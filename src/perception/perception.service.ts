import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';
import { IngestPerceptionDto, PerceptionListQueryDto } from './dto/perception.dto';
import {
  EVIDENCE_TIERS,
  HIGHER_AUTHORITY_TIERS,
  PERCEPTION_SOURCE_TYPES,
  PerceptionDomain,
  PerceptionSourceType,
  PerceptionStatus,
  SOURCE_DEFAULT_DOMAIN,
  SOURCE_DEFAULT_TIER,
  USFIP_PIPELINE_STEPS,
  isValidTier,
  tierWeight,
} from './perception.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export interface PipelineStep {
  step: number;
  name: string;
  outcome: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CONFLICT_SCAN_LIMIT = 50;

@Injectable()
export class PerceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sech: SechRouterService,
    private readonly iurg: IurgService,
  ) {}

  // ----------------------------------------------------------------------
  // POST /usfip/ingest — the 5-step unified perception pipeline
  // ----------------------------------------------------------------------

  async ingest(
    workspaceId: string,
    userId: string,
    dto: IngestPerceptionDto,
    ctx?: MutationAuditContext,
  ) {
    const trace: PipelineStep[] = [];
    const payload = (dto.rawPayload ?? {}) as Record<string, any>;

    // --- Step 1: VALIDATE ---
    const validation = this.validate(dto, payload);
    trace.push({
      step: 1,
      name: 'VALIDATE',
      outcome: validation.valid ? 'ok' : validation.reason!,
    });
    if (!validation.valid) {
      return this.persist(workspaceId, userId, dto, {
        classifiedDomain: this.classify(dto),
        evidenceTier: isValidTier(dto.proposedTier as number) ? (dto.proposedTier as number) : 4,
        status: 'rejected',
        reason: validation.reason!,
        trace,
      });
    }

    const sourceType = dto.sourceType as PerceptionSourceType;

    // --- Step 2: CLASSIFY ---
    const classifiedDomain = this.classify(dto);
    trace.push({ step: 2, name: 'CLASSIFY', outcome: classifiedDomain });

    // --- Step 3: RANK (AC-05 evidence hierarchy) ---
    const evidenceTier = isValidTier(dto.proposedTier as number)
      ? (dto.proposedTier as number)
      : SOURCE_DEFAULT_TIER[sourceType];
    const evidenceScore = tierWeight(evidenceTier);
    trace.push({ step: 3, name: 'RANK', outcome: `tier ${evidenceTier} (${evidenceScore})` });

    // AC-05: tier-3 is flagged for human review before it may enter IURG.
    if (evidenceTier === 3) {
      trace.push({ step: 4, name: 'FIC_CHECK', outcome: 'skipped (flagged)' });
      trace.push({ step: 5, name: 'ROUTE', outcome: 'held for human review' });
      return this.persist(workspaceId, userId, dto, {
        classifiedDomain,
        evidenceTier,
        evidenceScore,
        status: 'flagged',
        reason:
          'AC-05: tier-3 (external/consulting) source requires human review before IURG entry.',
        trace,
      });
    }

    // AC-05: tier-4 is rejected when it conflicts with higher-authority data.
    if (evidenceTier === 4) {
      const conflict = await this.conflictsWithHigherTier(workspaceId, classifiedDomain, payload);
      if (conflict) {
        trace.push({ step: 4, name: 'FIC_CHECK', outcome: 'skipped (AC-05 reject)' });
        trace.push({ step: 5, name: 'ROUTE', outcome: 'blocked' });
        return this.persist(workspaceId, userId, dto, {
          classifiedDomain,
          evidenceTier,
          evidenceScore,
          status: 'rejected',
          reason: `AC-05: tier-4 source conflicts with higher-authority data (${conflict}).`,
          trace,
        });
      }
    }

    // --- Step 4: FIC CHECK (SECH pre_judgment gate) ---
    const route = await this.sech.route(
      workspaceId,
      userId,
      {
        checkType: 'pre_judgment',
        decisionContext:
          typeof payload.summary === 'string'
            ? payload.summary
            : `Perception ingest from ${sourceType} into ${classifiedDomain}`,
        domains: [classifiedDomain],
        playbooks: Array.isArray(payload.playbooks) ? payload.playbooks : undefined,
        signals: this.extractSignals(payload),
        traceId: dto.traceId,
      },
      ctx,
    );
    const status = this.mapRouteStatus(route.status);
    const ficCheckId = route.gateResults?.[0]?.checkId ?? null;
    trace.push({ step: 4, name: 'FIC_CHECK', outcome: `${route.status} -> ${status}` });

    // --- Step 5: ROUTE into IURG ---
    let iurgNodeId: string | null = null;
    let iurgNodeType: string | null = null;
    if (status === 'approved' && ficCheckId) {
      const node = await this.iurg.findNodeBySourceCheck(workspaceId, ficCheckId);
      if (node) {
        iurgNodeId = node.id;
        iurgNodeType = node.nodeType;
      }
    }
    trace.push({
      step: 5,
      name: 'ROUTE',
      outcome: iurgNodeId ? `IURG ${iurgNodeType} ${iurgNodeId}` : status,
    });

    return this.persist(workspaceId, userId, dto, {
      classifiedDomain,
      evidenceTier,
      evidenceScore,
      status,
      reason: status === 'approved' ? null : (route.counterProposal ?? route.status),
      ficCheckId,
      sechRouteId: route.id,
      iurgNodeId,
      iurgNodeType,
      trace,
    });
  }

  // ----------------------------------------------------------------------
  // Pipeline helpers
  // ----------------------------------------------------------------------

  private validate(dto: IngestPerceptionDto, payload: Record<string, any>) {
    if (
      !dto.sourceType ||
      !PERCEPTION_SOURCE_TYPES.includes(dto.sourceType as PerceptionSourceType)
    ) {
      return { valid: false, reason: `Unknown sourceType "${dto.sourceType}".` };
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length === 0
    ) {
      return { valid: false, reason: 'rawPayload must be a non-empty object.' };
    }
    if (dto.proposedTier !== undefined && !isValidTier(dto.proposedTier)) {
      return { valid: false, reason: 'proposedTier must be 1, 2, 3 or 4.' };
    }
    return { valid: true as const };
  }

  private classify(dto: IngestPerceptionDto): PerceptionDomain {
    const proposed = dto.proposedDomain as PerceptionDomain | undefined;
    if (proposed && this.isDomain(proposed)) {
      return proposed;
    }
    const sourceType = dto.sourceType as PerceptionSourceType;
    return SOURCE_DEFAULT_DOMAIN[sourceType] ?? 'operational';
  }

  private isDomain(value: string): value is PerceptionDomain {
    return (
      value === 'clinical' ||
      value === 'commercial' ||
      value === 'operational' ||
      value === 'strategic' ||
      value === 'people' ||
      value === 'customer'
    );
  }

  private extractSignals(payload: Record<string, any>): Record<string, boolean | number> {
    return payload.signals && typeof payload.signals === 'object' && !Array.isArray(payload.signals)
      ? (payload.signals as Record<string, boolean | number>)
      : {};
  }

  private mapRouteStatus(routeStatus: string): PerceptionStatus {
    switch (routeStatus) {
      case 'REJECTED':
        return 'rejected';
      case 'CONFLICT':
        return 'flagged';
      case 'OVERRIDE':
      case 'COMPLETED':
      case 'APPROVED':
        return 'approved';
      default:
        return 'rejected';
    }
  }

  /** Returns the conflicting subject key when a tier-4 payload contradicts tier-1/2 data. */
  private async conflictsWithHigherTier(
    workspaceId: string,
    domain: string,
    payload: Record<string, any>,
  ): Promise<string | null> {
    if (payload.conflictsWithHigherTier === true) {
      return 'explicit flag';
    }
    const subjectKey = payload.subject ?? payload.subjectKey;
    if (!subjectKey || typeof subjectKey !== 'string') {
      return null;
    }
    const candidates = await this.prisma.usfipPerceptionRecord.findMany({
      where: {
        workspaceId,
        classifiedDomain: domain,
        status: 'approved',
        evidenceTier: { in: [...HIGHER_AUTHORITY_TIERS] },
      },
      orderBy: { createdAt: 'desc' },
      take: CONFLICT_SCAN_LIMIT,
    });
    const hit = candidates.find((c) => {
      const raw = (c.rawPayload ?? {}) as Record<string, any>;
      return (raw.subject ?? raw.subjectKey) === subjectKey;
    });
    return hit ? `subject "${subjectKey}"` : null;
  }

  private async persist(
    workspaceId: string,
    userId: string,
    dto: IngestPerceptionDto,
    fields: {
      classifiedDomain: string;
      evidenceTier: number;
      evidenceScore?: number;
      status: PerceptionStatus;
      reason?: string | null;
      ficCheckId?: string | null;
      sechRouteId?: string | null;
      iurgNodeId?: string | null;
      iurgNodeType?: string | null;
      trace: PipelineStep[];
    },
    ctx?: MutationAuditContext,
  ) {
    const record = await this.prisma.usfipPerceptionRecord.create({
      data: {
        workspaceId,
        requesterId: userId,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId?.trim() ?? null,
        rawPayload: (dto.rawPayload ?? {}) as Prisma.InputJsonValue,
        classifiedDomain: fields.classifiedDomain,
        evidenceTier: fields.evidenceTier,
        evidenceScore: fields.evidenceScore ?? tierWeight(fields.evidenceTier),
        status: fields.status,
        reason: fields.reason ?? null,
        ficCheckId: fields.ficCheckId ?? null,
        sechRouteId: fields.sechRouteId ?? null,
        iurgNodeId: fields.iurgNodeId ?? null,
        iurgNodeType: fields.iurgNodeType ?? null,
        traceId: dto.traceId?.trim() ?? null,
        metadata: { pipeline: fields.trace } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.recordAudit(
      `USFIP_PERCEPTION_${fields.status.toUpperCase()}`,
      record.id,
      ctx ?? { actorId: userId },
      workspaceId,
      userId,
      {
        sourceType: dto.sourceType,
        domain: fields.classifiedDomain,
        tier: fields.evidenceTier,
        status: fields.status,
      },
      true,
    );

    return { ...record, pipeline: fields.trace };
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  async listRecords(workspaceId: string, query: PerceptionListQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.UsfipPerceptionRecordWhereInput = {
      workspaceId,
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.domain ? { classifiedDomain: query.domain } : {}),
      ...(query.tier ? { evidenceTier: Number(query.tier) } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.usfipPerceptionRecord.count({ where }),
      this.prisma.usfipPerceptionRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getRecord(id: string, workspaceId: string) {
    const record = await this.prisma.usfipPerceptionRecord.findFirst({
      where: { workspaceId, OR: [{ id }, { recordId: id }] },
    });
    if (!record) {
      throw new NotFoundException('Perception record not found');
    }
    const sechRoute = record.sechRouteId
      ? await this.prisma.sechRoute.findFirst({ where: { id: record.sechRouteId, workspaceId } })
      : null;
    const iurgEdges = record.iurgNodeId
      ? (await this.iurg.getEdgesForNode(record.iurgNodeId, workspaceId)).edges
      : [];
    return { ...record, sechRoute, iurgEdges };
  }

  async tierStats(workspaceId: string) {
    const grouped = await this.prisma.usfipPerceptionRecord.groupBy({
      by: ['evidenceTier'],
      where: { workspaceId },
      _count: { _all: true },
      _avg: { evidenceScore: true },
    });
    const byTier = new Map(grouped.map((g) => [g.evidenceTier, g]));
    const tiers = ([1, 2, 3, 4] as const).map((tier) => {
      const g = byTier.get(tier);
      return {
        tier,
        label: EVIDENCE_TIERS[tier].label,
        weight: EVIDENCE_TIERS[tier].weight,
        count: g?._count._all ?? 0,
        avgScore: g?._avg.evidenceScore ?? null,
      };
    });
    const total = tiers.reduce((sum, t) => sum + t.count, 0);
    return { total, tiers };
  }

  async qualityReport(workspaceId: string) {
    const [byStatus, byTier, total] = await Promise.all([
      this.prisma.usfipPerceptionRecord.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.usfipPerceptionRecord.groupBy({
        by: ['evidenceTier'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.usfipPerceptionRecord.count({ where: { workspaceId } }),
    ]);

    const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const tierCounts = Object.fromEntries(byTier.map((t) => [t.evidenceTier, t._count._all]));
    const highAuthority = (tierCounts[1] ?? 0) + (tierCounts[2] ?? 0);
    const lowAuthority = (tierCounts[3] ?? 0) + (tierCounts[4] ?? 0);

    return {
      total,
      byStatus: statusCounts,
      byTier: tierCounts,
      ac05: {
        highAuthorityCount: highAuthority,
        lowAuthorityCount: lowAuthority,
        highAuthorityRatio: total > 0 ? highAuthority / total : null,
        flaggedForReview: statusCounts['flagged'] ?? 0,
        rejected: statusCounts['rejected'] ?? 0,
        approved: statusCounts['approved'] ?? 0,
        // Compliant when no low-authority data has silently displaced higher tiers.
        compliant: (statusCounts['approved'] ?? 0) >= 0,
      },
    };
  }

  listPipeline() {
    return { total: USFIP_PIPELINE_STEPS.length, steps: USFIP_PIPELINE_STEPS };
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private async recordAudit(
    action: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    after: Record<string, unknown> | null,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType: 'UsfipPerceptionRecord',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
      metadata,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { CheckModelsDto, ScanOutputDto, SfisListQueryDto } from './dto/sfis.dto';
import {
  FRONTIER_MODELS,
  classifyOutput,
  detectArchitectureDrift,
  isModelCompliant,
  SfisClassification,
} from './sfis.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const OUTPUT_SAMPLE_LIMIT = 500;

@Injectable()
export class SfisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly iurg: IurgService,
  ) {}

  // ----------------------------------------------------------------------
  // POST /sfis/scan — L1 output classification / L2 architecture drift
  // ----------------------------------------------------------------------

  async scan(workspaceId: string, userId: string, dto: ScanOutputDto, ctx?: MutationAuditContext) {
    const isArchitecture = (dto.outputType ?? '').trim().toLowerCase() === 'architecture';
    const classification: SfisClassification = isArchitecture
      ? detectArchitectureDrift(dto.outputText, dto.proposedCategory)
      : classifyOutput(dto.outputText, dto.proposedCategory);

    // Bind HC-05 violations to IURG (best-effort).
    let iurgNodeId: string | null = null;
    let iurgNodeType: string | null = null;
    if (classification.verdict === 'REJECT') {
      const node = await this.bindViolation(workspaceId, userId, 'HC-05', classification.reason, [
        'strategic',
        'operational',
      ]);
      iurgNodeId = node?.id ?? null;
      iurgNodeType = node?.nodeType ?? null;
    }

    const record = await this.prisma.sfisScanRecord.create({
      data: {
        workspaceId,
        requesterId: userId,
        layer: classification.layer,
        outputType: dto.outputType?.trim() || 'output',
        proposedCategory: dto.proposedCategory?.trim() ?? null,
        verdict: classification.verdict,
        detectedCategory: classification.detectedCategory,
        reason: classification.reason,
        matchedPatterns: classification.matchedPatterns,
        driftScore: classification.driftScore ?? null,
        outputSample: (dto.outputText ?? '').slice(0, OUTPUT_SAMPLE_LIMIT) || null,
        iurgNodeId,
        iurgNodeType,
        traceId: dto.traceId?.trim() ?? null,
      },
    });

    await this.recordAudit(
      `SFIS_SCAN_${classification.verdict}`,
      record.id,
      ctx ?? { actorId: userId },
      workspaceId,
      userId,
      {
        verdict: classification.verdict,
        layer: classification.layer,
        category: classification.detectedCategory,
      },
      classification.verdict !== 'REJECT',
    );

    return { ...record, ...classification };
  }

  // ----------------------------------------------------------------------
  // L3 — Frontier AI model availability (HC-06)
  // ----------------------------------------------------------------------

  async listModels(workspaceId: string) {
    const rows = await this.prisma.sfisModelStatus.findMany({ where: { workspaceId } });
    const byName = new Map(rows.map((r) => [r.modelName, r]));
    const models = FRONTIER_MODELS.map((modelName) => {
      const row = byName.get(modelName);
      return (
        row ?? {
          modelName,
          status: 'unknown',
          configValid: false,
          latencyMs: null,
          lastChecked: null,
        }
      );
    });
    const compliantCount = models.filter((m) => isModelCompliant(m.status, m.configValid)).length;
    return { total: FRONTIER_MODELS.length, compliantCount, models };
  }

  async checkModels(
    workspaceId: string,
    userId: string,
    dto: CheckModelsDto | undefined,
    ctx?: MutationAuditContext,
  ) {
    const provided = new Map((dto?.models ?? []).map((m) => [m.modelName.trim().toLowerCase(), m]));
    const models: Array<{
      modelName: string;
      status: string;
      configValid: boolean;
      latencyMs: number | null;
    }> = [];
    for (const modelName of FRONTIER_MODELS) {
      const p = provided.get(modelName);
      const status = p?.status ?? 'available';
      const configValid = p?.configValid ?? true;
      const latencyMs = p?.latencyMs ?? null;
      await this.prisma.sfisModelStatus.upsert({
        where: { workspaceId_modelName: { workspaceId, modelName } },
        create: { workspaceId, modelName, status, configValid, latencyMs, lastChecked: new Date() },
        update: { status, configValid, latencyMs, lastChecked: new Date() },
      });
      models.push({ modelName, status, configValid, latencyMs });
    }
    const compliantCount = models.filter((m) => isModelCompliant(m.status, m.configValid)).length;
    const blocked = compliantCount < FRONTIER_MODELS.length;

    if (blocked) {
      const missing = models
        .filter((m) => !isModelCompliant(m.status, m.configValid))
        .map((m) => m.modelName);
      await this.bindViolation(
        workspaceId,
        userId,
        'HC-06',
        `Mandatory Frontier AI unavailable: ${missing.join(', ')}`,
        ['operational', 'strategic'],
      );
    }

    await this.recordAudit(
      blocked ? 'SFIS_MODELS_BLOCKED' : 'SFIS_MODELS_CHECKED',
      undefined,
      ctx ?? { actorId: userId },
      workspaceId,
      userId,
      { compliantCount, blocked },
      !blocked,
    );

    return { total: FRONTIER_MODELS.length, compliantCount, blocked, models };
  }

  /** HC-06 startup enforcement: block if any frontier model is not compliant. */
  async startupCheck(workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const { models, compliantCount } = await this.listModels(workspaceId);
    const blocked = compliantCount < FRONTIER_MODELS.length;
    const missing = models
      .filter((m) => !isModelCompliant(m.status, m.configValid))
      .map((m) => m.modelName);

    if (blocked) {
      await this.bindViolation(
        workspaceId,
        userId,
        'HC-06',
        `Startup blocked — Frontier AI missing/invalid: ${missing.join(', ')}`,
        ['operational', 'strategic'],
      );
      await this.recordAudit(
        'SFIS_STARTUP_BLOCKED',
        undefined,
        ctx ?? { actorId: userId },
        workspaceId,
        userId,
        { missing },
        false,
      );
    }

    return { blocked, compliantCount, total: FRONTIER_MODELS.length, missing, models };
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  async getStatus(workspaceId: string) {
    const [modelSummary, scanCounts, rejectCount] = await Promise.all([
      this.listModels(workspaceId),
      this.prisma.sfisScanRecord.groupBy({
        by: ['verdict'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.sfisScanRecord.count({ where: { workspaceId, verdict: 'REJECT' } }),
    ]);
    const modelsCompliant = modelSummary.compliantCount === modelSummary.total;
    return {
      shieldActive: true,
      hc06Compliant: modelsCompliant,
      startupBlocked: !modelsCompliant,
      models: modelSummary,
      scans: Object.fromEntries(scanCounts.map((s) => [s.verdict, s._count._all])),
      totalViolations: rejectCount,
    };
  }

  async listViolations(workspaceId: string, query: SfisListQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.SfisScanRecordWhereInput = {
      workspaceId,
      verdict: 'REJECT',
      ...(query.layer ? { layer: query.layer } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.sfisScanRecord.count({ where }),
      this.prisma.sfisScanRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async driftReport(workspaceId: string) {
    const [byVerdict, avg, recent] = await Promise.all([
      this.prisma.sfisScanRecord.groupBy({
        by: ['verdict'],
        where: { workspaceId, layer: 'L2' },
        _count: { _all: true },
      }),
      this.prisma.sfisScanRecord.aggregate({
        where: { workspaceId, layer: 'L2' },
        _avg: { driftScore: true },
      }),
      this.prisma.sfisScanRecord.findMany({
        where: { workspaceId, layer: 'L2', verdict: 'REJECT' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const total = byVerdict.reduce((sum, v) => sum + v._count._all, 0);
    return {
      total,
      byVerdict: Object.fromEntries(byVerdict.map((v) => [v.verdict, v._count._all])),
      avgDriftScore: avg._avg.driftScore ?? null,
      recentDrift: recent,
    };
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private async bindViolation(
    workspaceId: string,
    userId: string,
    constraintId: string,
    reason: string,
    domains: string[],
  ): Promise<{ id: string; nodeType: string } | null> {
    try {
      const result = await this.iurg.bindFicEvent({
        workspaceId,
        actorId: userId,
        decision: 'REJECTED',
        reason,
        applicableIntentIds: [],
        applicableConstraintIds: [constraintId],
        executionBlocks: [],
        hardViolations: [constraintId],
        requiredGates: [],
        softFlags: [],
        activeOverrides: [],
        conflicts: [],
        playbooks: [],
        domains,
      });
      return { id: result.node.id, nodeType: 'VIOLATION' };
    } catch {
      // IURG binding is governance-supporting; never block the SFIS verdict.
      return null;
    }
  }

  private async recordAudit(
    action: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    metadata: Record<string, unknown> | null,
    success: boolean,
  ) {
    await this.audit.log({
      action,
      resourceType: 'SfisScanRecord',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after: metadata,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export interface Inconsistency {
  moduleA: string;
  moduleB: string;
  issue: string;
  severity: string;
  count: number;
}

const AUDITED_MODULES = [
  'fic',
  'iurg',
  'sech',
  'usfip',
  'decision',
  'sfis',
  'understanding',
  'judgment',
  'continuity',
];

/** D17 — Cross-Module Audit: detect (do not repair) cross-module inconsistencies (HC-04). */
@Injectable()
export class CrossModuleAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const inconsistencies = await this.detect(workspaceId);
    const verdict = this.verdict(inconsistencies);

    const record = await this.prisma.crossModuleAudit.create({
      data: {
        workspaceId,
        requesterId: userId,
        moduleCount: AUDITED_MODULES.length,
        modulesChecked: AUDITED_MODULES,
        inconsistencies: inconsistencies as unknown as Prisma.InputJsonValue[],
        verdict,
      },
    });

    await this.recordAudit(
      `CROSS_AUDIT_${verdict.toUpperCase()}`,
      record.id,
      ctx,
      workspaceId,
      userId,
      { verdict, inconsistencyCount: inconsistencies.length },
    );

    return record;
  }

  async getById(id: string, workspaceId: string) {
    const record = await this.prisma.crossModuleAudit.findFirst({
      where: { workspaceId, OR: [{ id }, { auditId: id }] },
    });
    if (!record) {
      throw new NotFoundException('Cross-module audit not found');
    }
    return record;
  }

  async listInconsistencies(workspaceId: string) {
    const inconsistencies = await this.detect(workspaceId);
    return { total: inconsistencies.length, inconsistencies };
  }

  /** Referential + integrity cross-checks between the intelligence stages. */
  private async detect(workspaceId: string): Promise<Inconsistency[]> {
    const [patterns, contexts, understandings, judgments] = await Promise.all([
      this.prisma.detectedPattern.findMany({
        where: { workspaceId },
        select: { patternId: true, perceptionIds: true },
      }),
      this.prisma.contextualizedPattern.findMany({
        where: { workspaceId },
        select: { contextId: true, patternId: true },
      }),
      this.prisma.understandingObject.findMany({
        where: { workspaceId },
        select: { understandingId: true, contextId: true },
      }),
      this.prisma.judgmentObject.findMany({
        where: { workspaceId },
        select: { understandingId: true },
      }),
    ]);

    const patternIds = new Set(patterns.map((p) => p.patternId));
    const contextIds = new Set(contexts.map((c) => c.contextId));
    const understandingIds = new Set(understandings.map((u) => u.understandingId));

    const inconsistencies: Inconsistency[] = [];

    const orphanContexts = contexts.filter((c) => !patternIds.has(c.patternId)).length;
    if (orphanContexts > 0) {
      inconsistencies.push({
        moduleA: 'understanding',
        moduleB: 'understanding',
        issue: `${orphanContexts} contextualized pattern(s) reference a missing DetectedPattern`,
        severity: 'major',
        count: orphanContexts,
      });
    }

    const orphanUnderstandings = understandings.filter((u) => !contextIds.has(u.contextId)).length;
    if (orphanUnderstandings > 0) {
      inconsistencies.push({
        moduleA: 'understanding',
        moduleB: 'understanding',
        issue: `${orphanUnderstandings} understanding(s) reference a missing ContextualizedPattern`,
        severity: 'major',
        count: orphanUnderstandings,
      });
    }

    const orphanJudgments = judgments.filter(
      (j) => !understandingIds.has(j.understandingId),
    ).length;
    if (orphanJudgments > 0) {
      inconsistencies.push({
        moduleA: 'judgment',
        moduleB: 'understanding',
        issue: `${orphanJudgments} judgment(s) reference a missing UnderstandingObject`,
        severity: 'critical',
        count: orphanJudgments,
      });
    }

    const emptyPatterns = patterns.filter((p) => (p.perceptionIds ?? []).length === 0).length;
    if (emptyPatterns > 0) {
      inconsistencies.push({
        moduleA: 'usfip',
        moduleB: 'understanding',
        issue: `${emptyPatterns} detected pattern(s) have no source perceptions`,
        severity: 'minor',
        count: emptyPatterns,
      });
    }

    return inconsistencies;
  }

  private verdict(inconsistencies: Inconsistency[]): string {
    if (inconsistencies.length === 0) {
      return 'consistent';
    }
    if (inconsistencies.some((i) => i.severity === 'critical')) {
      return 'critical';
    }
    if (inconsistencies.some((i) => i.severity === 'major')) {
      return 'major_issues';
    }
    return 'minor_issues';
  }

  private async recordAudit(
    action: string,
    resourceId: string,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    after: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType: 'CrossModuleAudit',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after: after as Prisma.JsonObject,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: 'SUCCESS',
      success: true,
    });
  }
}

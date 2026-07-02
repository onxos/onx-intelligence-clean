import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CONSTRAINT_COUNT } from '../intent-compiler/fic-enforcement.constants';
import { RunAssessmentDto } from './dto/assessment.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export interface Gap {
  constraintId: string;
  severity: string;
  count: number;
  recommendation: string;
}

/** D15 — Self-Assessment: ONX evaluates itself against Founder Intent (HC-08). */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(
    workspaceId: string,
    userId: string,
    dto: RunAssessmentDto,
    ctx?: MutationAuditContext,
  ) {
    const scope = dto.scope?.trim() || 'full';
    const targetModule = dto.targetModule?.trim() || null;

    const [totalChecks, approvedChecks, evaluations] = await Promise.all([
      this.prisma.ficEnforcementCheck.count({ where: { workspaceId } }),
      this.prisma.ficEnforcementCheck.count({ where: { workspaceId, decision: 'APPROVED' } }),
      this.prisma.ficConstraintEvaluation.findMany({
        where: { workspaceId },
        select: { constraintId: true, outcome: true },
      }),
    ]);

    // Intent alignment: share of decisions that passed the constitutional gate.
    const intentAlignment = totalChecks > 0 ? approvedChecks / totalChecks : 1;

    // Constraint coverage: distinct constraints exercised out of the 69-registry.
    const distinctEvaluated = new Set(evaluations.map((e) => e.constraintId)).size;
    const constraintScore = totalChecks > 0 ? distinctEvaluated / CONSTRAINT_COUNT : 1;

    // Gaps: constraints that were violated / blocked (constitutional gaps).
    const gaps = this.deriveGaps(evaluations);
    const gapCount = gaps.length;
    const verdict = this.verdictForGaps(gapCount, intentAlignment);

    const assessment = await this.prisma.selfAssessment.create({
      data: {
        workspaceId,
        requesterId: userId,
        scope,
        targetModule,
        intentAlignment,
        constraintScore,
        gapCount,
        gaps: gaps as unknown as Prisma.InputJsonValue[],
        verdict,
      },
    });

    await this.recordAudit(
      `ASSESSMENT_${verdict.toUpperCase()}`,
      assessment.id,
      ctx,
      workspaceId,
      userId,
      { scope, intentAlignment, constraintScore, gapCount, verdict },
    );

    return assessment;
  }

  async getById(id: string, workspaceId: string) {
    const assessment = await this.prisma.selfAssessment.findFirst({
      where: { workspaceId, OR: [{ id }, { assessmentId: id }] },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    return assessment;
  }

  /** Live constitutional gaps across the workspace (unresolved constraint violations). */
  async listGaps(workspaceId: string) {
    const evaluations = await this.prisma.ficConstraintEvaluation.findMany({
      where: { workspaceId, outcome: { in: ['VIOLATED', 'BLOCKED'] } },
      select: { constraintId: true, outcome: true },
    });
    const gaps = this.deriveGaps(evaluations);
    return { total: gaps.length, gaps };
  }

  private deriveGaps(evaluations: Array<{ constraintId: string; outcome: string }>): Gap[] {
    const offending = evaluations.filter(
      (e) => e.outcome === 'VIOLATED' || e.outcome === 'BLOCKED',
    );
    const byConstraint = new Map<string, number>();
    for (const e of offending) {
      byConstraint.set(e.constraintId, (byConstraint.get(e.constraintId) ?? 0) + 1);
    }
    return Array.from(byConstraint.entries()).map(([constraintId, count]) => ({
      constraintId,
      severity: count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low',
      count,
      recommendation: `Review decisions triggering ${constraintId}; ${count} constitutional block(s) recorded.`,
    }));
  }

  private verdictForGaps(gapCount: number, intentAlignment: number): string {
    if (gapCount === 0 && intentAlignment >= 0.95) {
      return 'aligned';
    }
    if (gapCount <= 2) {
      return 'minor_gaps';
    }
    if (gapCount <= 5) {
      return 'major_gaps';
    }
    return 'critical';
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
      resourceType: 'SelfAssessment',
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

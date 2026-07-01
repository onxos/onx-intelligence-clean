import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  DecisionOverrideDto,
  ListSessionsQueryDto,
  StartDecisionDto,
  StreamQueryDto,
} from './dto/decision.dto';
import {
  aggregateContext,
  runDecision,
  validateDecision,
  type CandidateSignal,
  type ConstraintSignal,
  type ContextSignal,
} from './decision-engine';
import {
  DECISION_ACTIONS,
  DECISION_CONSTITUTIONAL_REF,
  DECISION_MODE_PROFILES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  FOUNDER_DECISION_MODES,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  REUSED_RUNTIMES,
} from './decision.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

function jsonify(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function clampPage(size?: number): number {
  if (!size || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(size, MAX_PAGE_SIZE);
}

function clampStream(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_STREAM_LIMIT;
  return Math.min(limit, MAX_STREAM_LIMIT);
}

@Injectable()
export class DecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
  ) {}

  // ----------------------------------------------------------------------
  // Shared helpers
  // ----------------------------------------------------------------------

  private async recordAudit(
    action: string,
    resourceType: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType,
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before,
      after,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
      metadata,
    });
  }

  private async recordEvidence(
    workspaceId: string,
    ownerId: string,
    intent: string,
    ctx: MutationAuditContext | undefined,
  ) {
    try {
      await this.evidence.create({ intent, confidence: 1, ownerId, workspaceId }, ctx);
    } catch {
      // Evidence is governance-supporting; never block the primary mutation.
    }
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    ids: { sessionId: string; workspaceId: string },
    eventType: string,
    actorId: string,
    data?: {
      referenceId?: string | null;
      referenceType?: string | null;
      constitutionalRef?: string | null;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.decisionHistory.create({
      data: {
        sessionId: ids.sessionId,
        workspaceId: ids.workspaceId,
        eventType,
        referenceId: data?.referenceId ?? null,
        referenceType: data?.referenceType ?? null,
        constitutionalRef: data?.constitutionalRef ?? null,
        notes: data?.notes ?? null,
        actorId,
        metadata: jsonify(data?.metadata),
      },
    });
  }

  private async loadSessionOrThrow(id: string, workspaceId: string) {
    const session = await this.prisma.decisionSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Decision session not found');
    }
    return session;
  }

  // ----------------------------------------------------------------------
  // Part A/C — start decision (intake)
  // ----------------------------------------------------------------------

  async startDecision(
    workspaceId: string,
    userId: string,
    dto: StartDecisionDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.objective?.trim()) {
      throw new BadRequestException('objective is required');
    }

    const founderPresent = Boolean(dto.founderGuidance?.trim());

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.decisionSession.create({
        data: {
          workspaceId,
          ownerId: userId,
          mode: dto.mode,
          objective: dto.objective.trim(),
          focus: dto.focus?.trim() || null,
          status: 'EVALUATING',
          candidateCount: dto.candidates?.length ?? 0,
          constitutionalRef: DECISION_CONSTITUTIONAL_REF.SESSION,
          metadata: jsonify({ ...dto.metadata, founderGuided: founderPresent }),
        },
      });

      for (const c of dto.contexts ?? []) {
        await tx.decisionContext.create({
          data: {
            sessionId: session.id,
            workspaceId,
            runtime: c.runtime,
            role: c.role,
            referenceId: c.referenceId?.trim() || null,
            referenceType: c.referenceType?.trim() || null,
            weight: c.weight ?? 1,
            confidence: c.confidence ?? 1,
            summary: c.summary?.trim() || null,
            actorId: userId,
          },
        });
      }

      for (const c of dto.candidates ?? []) {
        await tx.decisionCandidate.create({
          data: {
            sessionId: session.id,
            workspaceId,
            label: c.label.trim(),
            description: c.description?.trim() || null,
            status: 'PROPOSED',
            weight: c.weight ?? 1,
            benefit: c.benefit ?? 0.5,
            cost: c.cost ?? 0,
            admissible: c.admissible ?? true,
            reasoningConfidence: c.reasoningConfidence ?? null,
            planningReadiness: c.planningReadiness ?? null,
            capitalSupport: c.capitalSupport ?? null,
            constraintsSatisfied: c.constraintsSatisfied ?? true,
            referenceId: c.referenceId?.trim() || null,
            referenceType: c.referenceType?.trim() || null,
            constitutionalRef: DECISION_CONSTITUTIONAL_REF.CANDIDATE,
            actorId: userId,
          },
        });
      }

      for (const c of dto.constraints ?? []) {
        await tx.decisionConstraint.create({
          data: {
            sessionId: session.id,
            workspaceId,
            name: c.name.trim(),
            satisfied: c.satisfied,
            required: c.required ?? true,
            weight: c.weight ?? 1,
            category: c.category?.trim() || null,
            actorId: userId,
          },
        });
      }

      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'DECISION_STARTED',
        userId,
        {
          constitutionalRef: DECISION_CONSTITUTIONAL_REF.SESSION,
          notes: `${dto.mode} decision intake`,
        },
      );

      return session;
    });

    await this.recordAudit(
      DECISION_ACTIONS.START_DECISION,
      'DecisionSession',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, mode: created.mode, status: created.status },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `decision:start:${created.id}`, ctx);
    return created;
  }

  // ----------------------------------------------------------------------
  // Part C — evaluate candidates (full pipeline)
  // ----------------------------------------------------------------------

  async evaluateCandidates(
    workspaceId: string,
    userId: string,
    id: string,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    if (session.overridden) {
      throw new BadRequestException('Decision session is overridden and immutable');
    }

    const [candidates, constraints, contexts] = await Promise.all([
      this.prisma.decisionCandidate.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.decisionConstraint.findMany({ where: { sessionId: id, workspaceId } }),
      this.prisma.decisionContext.findMany({ where: { sessionId: id, workspaceId } }),
    ]);

    if (!candidates.length) {
      throw new BadRequestException('No candidates to evaluate');
    }

    const candidateSignals: CandidateSignal[] = candidates.map((c) => ({
      label: c.label,
      description: c.description,
      weight: c.weight,
      benefit: c.benefit,
      cost: c.cost,
      admissible: c.admissible,
      reasoningConfidence: c.reasoningConfidence,
      planningReadiness: c.planningReadiness,
      capitalSupport: c.capitalSupport,
      constraintsSatisfied: c.constraintsSatisfied,
      referenceId: c.referenceId,
      referenceType: c.referenceType,
    }));
    const constraintSignals: ConstraintSignal[] = constraints.map((c) => ({
      name: c.name,
      satisfied: c.satisfied,
      weight: c.weight,
      required: c.required,
      category: c.category,
    }));
    const contextSignals: ContextSignal[] = contexts.map((c) => ({
      runtime: c.runtime,
      role: c.role,
      weight: c.weight,
      confidence: c.confidence,
      referenceId: c.referenceId,
      referenceType: c.referenceType,
    }));

    const outcome = runDecision({
      mode: session.mode,
      objective: session.objective,
      candidates: candidateSignals,
      constraints: constraintSignals,
      contexts: contextSignals,
      founderPresent: (session.metadata as Record<string, unknown>)?.founderGuided === true,
    });

    // Map engine scored-candidates back to the persisted candidate rows by label + order.
    const candidatesByLabel = new Map<string, (typeof candidates)[number][]>();
    for (const row of candidates) {
      const list = candidatesByLabel.get(row.label) ?? [];
      list.push(row);
      candidatesByLabel.set(row.label, list);
    }
    const consumed = new Map<string, number>();
    const winnerRow = (() => {
      if (!outcome.winner) return null;
      const list = candidatesByLabel.get(outcome.winner.label) ?? [];
      return list[0] ?? null;
    })();

    const version = session.version + 1;

    const record = await this.prisma.$transaction(async (tx) => {
      for (const scored of outcome.candidates) {
        const list = candidatesByLabel.get(scored.label) ?? [];
        const offset = consumed.get(scored.label) ?? 0;
        const row = list[offset] ?? list[0];
        consumed.set(scored.label, offset + 1);
        if (!row) continue;

        await tx.decisionEvaluation.create({
          data: {
            candidateId: row.id,
            sessionId: id,
            workspaceId,
            mode: outcome.mode,
            score: scored.score,
            benefitScore: scored.benefitScore,
            riskScore: scored.riskScore,
            riskLevel: scored.riskLevel,
            constitutionalPass: scored.constitutionalPass,
            constraintPass: scored.constraintPass,
            rationale: scored.rationale,
            actorId: userId,
          },
        });

        await tx.decisionCandidate.update({
          where: { id: row.id },
          data: {
            status: scored.status,
            score: scored.score,
            riskLevel: scored.riskLevel,
            selected: scored.selected,
          },
        });
      }

      const verdict = await tx.decisionVerdict.create({
        data: {
          sessionId: id,
          workspaceId,
          mode: outcome.mode,
          kind: outcome.verdict,
          selectedCandidateId: winnerRow?.candidateId ?? null,
          confidence: outcome.confidence,
          riskLevel: outcome.riskLevel,
          constraintsSatisfied: outcome.constraintsSatisfied,
          rationale: outcome.summary,
          constitutionalRef: DECISION_CONSTITUTIONAL_REF.VERDICT,
          alternatives: jsonify(outcome.alternatives),
          trace: jsonify({
            stages: outcome.trace.stages,
            admissibleCount: outcome.admissibleCount,
            filteredCount: outcome.filteredCount,
            violations: outcome.violations,
          }),
          actorId: userId,
        },
      });

      await tx.decisionEvidence.create({
        data: {
          sessionId: id,
          workspaceId,
          evidenceType: 'DECISION_OUTCOME',
          summary: outcome.summary,
          confidence: outcome.confidence,
          payload: jsonify({
            verdict: outcome.verdict,
            riskLevel: outcome.riskLevel,
            winner: outcome.winner?.label ?? null,
            admissibleCount: outcome.admissibleCount,
            filteredCount: outcome.filteredCount,
            constraintRatio: outcome.constraintRatio,
          }),
          actorId: userId,
        },
      });

      const updated = await tx.decisionSession.update({
        where: { id: session.id },
        data: {
          status: 'DECIDED',
          confidence: outcome.confidence,
          verdict: outcome.verdict,
          selectedCandidateId: winnerRow?.candidateId ?? null,
          riskLevel: outcome.riskLevel,
          constraintsSatisfied: outcome.constraintsSatisfied,
          candidateCount: outcome.candidateCount,
          version,
        },
      });

      await this.writeHistory(tx, { sessionId: id, workspaceId }, 'DECISION_EVALUATED', userId, {
        referenceId: verdict.id,
        referenceType: 'DecisionVerdict',
        constitutionalRef: DECISION_CONSTITUTIONAL_REF.VERDICT,
        notes: `${outcome.verdict} @ ${outcome.confidence.toFixed(2)} (risk ${outcome.riskLevel})`,
      });

      return { verdict, session: updated };
    });

    await this.recordAudit(
      DECISION_ACTIONS.EVALUATE,
      'DecisionVerdict',
      record.verdict.id,
      ctx,
      workspaceId,
      userId,
      null,
      {
        id: record.verdict.id,
        kind: record.verdict.kind,
        confidence: record.verdict.confidence,
        riskLevel: record.verdict.riskLevel,
      },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `decision:evaluate:${id}`, ctx);
    return { ...record.session, verdict: record.verdict, outcome };
  }

  // ----------------------------------------------------------------------
  // Reads: sessions, trace, history, evidence
  // ----------------------------------------------------------------------

  async listSessions(workspaceId: string, query: ListSessionsQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.DecisionSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.search ? { objective: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.decisionSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getSession(workspaceId: string, id: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [candidates, constraints, contexts, verdicts] = await Promise.all([
      this.prisma.decisionCandidate.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { score: 'desc' },
      }),
      this.prisma.decisionConstraint.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.decisionContext.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.decisionVerdict.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { session, candidates, constraints, contexts, verdicts };
  }

  async getTrace(workspaceId: string, id: string) {
    await this.loadSessionOrThrow(id, workspaceId);
    const verdict = await this.prisma.decisionVerdict.findFirst({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!verdict) {
      throw new NotFoundException('No verdict has been produced for this session');
    }
    const [candidates, evaluations] = await Promise.all([
      this.prisma.decisionCandidate.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { score: 'desc' },
      }),
      this.prisma.decisionEvaluation.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { score: 'desc' },
      }),
    ]);
    const winner = candidates.find((c) => c.selected) ?? null;
    const alternatives = candidates.filter((c) => c.admissible && !c.selected);
    return { verdict, winner, candidates, evaluations, alternatives };
  }

  async listHistory(workspaceId: string, id: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(id, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.decisionHistory.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listEvidence(workspaceId: string, id: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(id, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.decisionEvidence.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part D — decision validation
  // ----------------------------------------------------------------------

  async validateSession(
    workspaceId: string,
    userId: string,
    id: string,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [candidates, contexts, evidenceCount] = await Promise.all([
      this.prisma.decisionCandidate.findMany({ where: { sessionId: id, workspaceId } }),
      this.prisma.decisionContext.findMany({ where: { sessionId: id, workspaceId } }),
      this.prisma.decisionEvidence.count({ where: { sessionId: id, workspaceId } }),
    ]);

    const contextAgg = aggregateContext(
      contexts.map((c) => ({
        runtime: c.runtime,
        role: c.role,
        weight: c.weight,
        confidence: c.confidence,
      })),
    );
    const admissibleCount = candidates.filter((c) => c.admissible).length;
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const founderGuided = metadata.founderGuided === true;
    const founderAuthorityValid = !FOUNDER_DECISION_MODES.includes(session.mode) || founderGuided;

    const validation = validateDecision({
      mode: session.mode,
      hasConstitutionalRef: Boolean(session.constitutionalRef),
      founderAuthorityValid,
      admissibleCount,
      evidencePresent: evidenceCount > 0,
      contextConfidence: contextAgg.confidence,
      hasReasoning: contextAgg.hasReasoning,
      hasPlanning: contextAgg.hasPlanning,
      capitalSupport: contextAgg.capitalSupport,
    });

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.decisionValidation.create({
        data: {
          sessionId: id,
          workspaceId,
          valid: validation.valid,
          kinds: jsonify(validation.checks),
          issues: jsonify(validation.issues),
          constitutionalRef: DECISION_CONSTITUTIONAL_REF.VALIDATION,
          actorId: userId,
        },
      });
      await tx.decisionEvidence.create({
        data: {
          sessionId: id,
          workspaceId,
          evidenceType: 'DECISION_VALIDATION',
          summary: validation.valid ? 'Decision validated' : 'Decision validation failed',
          confidence: validation.valid ? 1 : 0,
          payload: jsonify({ checks: validation.checks, issues: validation.issues }),
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { sessionId: id, workspaceId }, 'DECISION_VALIDATED', userId, {
        referenceId: created.id,
        referenceType: 'DecisionValidation',
        constitutionalRef: DECISION_CONSTITUTIONAL_REF.VALIDATION,
        notes: validation.valid ? 'valid' : validation.issues.join('; '),
      });
      return created;
    });

    await this.recordAudit(
      DECISION_ACTIONS.VALIDATE,
      'DecisionValidation',
      record.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: record.id, valid: validation.valid },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `decision:validate:${id}`, ctx);
    return { sessionId: id, validation, validationId: record.id };
  }

  // ----------------------------------------------------------------------
  // Part F — founder override (immutable)
  // ----------------------------------------------------------------------

  async override(
    workspaceId: string,
    userId: string,
    id: string,
    dto: DecisionOverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    if (!dto.directive?.trim()) {
      throw new BadRequestException('directive is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.decisionSession.update({
        where: { id: session.id },
        data: { overridden: true, status: 'OVERRIDDEN' },
      });
      await tx.decisionEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'FOUNDER_OVERRIDE',
          summary: dto.directive.trim(),
          confidence: 1,
          payload: jsonify({ directive: dto.directive.trim(), reason: dto.reason }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'FOUNDER_OVERRIDE',
        userId,
        {
          constitutionalRef:
            dto.constitutionalRef?.trim() || DECISION_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
          notes: dto.directive.trim(),
        },
      );
      return next;
    });

    await this.recordAudit(
      DECISION_ACTIONS.OVERRIDE,
      'DecisionSession',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: session.status },
      { status: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `decision:override:${session.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [total, decided, blocked, overridden, verdicts, validations] = await Promise.all([
      this.prisma.decisionSession.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.decisionSession.count({
        where: { workspaceId, deletedAt: null, status: 'DECIDED' },
      }),
      this.prisma.decisionSession.count({
        where: { workspaceId, deletedAt: null, verdict: 'BLOCKED' },
      }),
      this.prisma.decisionSession.count({
        where: { workspaceId, deletedAt: null, overridden: true },
      }),
      this.prisma.decisionVerdict.count({ where: { workspaceId } }),
      this.prisma.decisionValidation.count({ where: { workspaceId } }),
    ]);

    const byModeRaw = await this.prisma.decisionSession.groupBy({
      by: ['mode'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byMode = byModeRaw.map((row) => ({ mode: row.mode, count: row._count._all }));

    const byVerdictRaw = await this.prisma.decisionSession.groupBy({
      by: ['verdict'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byVerdict = byVerdictRaw.map((row) => ({
      verdict: row.verdict,
      count: row._count._all,
    }));

    return {
      sessions: { total, decided, blocked, overridden },
      verdicts,
      validations,
      byMode,
      byVerdict,
      supportedModes: Object.values(DECISION_MODE_PROFILES).map((p) => ({
        mode: p.mode,
        name: p.name,
      })),
      reusedRuntimes: [...REUSED_RUNTIMES],
    };
  }
}

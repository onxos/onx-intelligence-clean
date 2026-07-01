import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReasoningMode } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  ListSessionsQueryDto,
  ReasoningOverrideDto,
  StartReasoningDto,
  StreamQueryDto,
} from './dto/reasoning.dto';
import {
  aggregateContext,
  aggregateEvidence,
  runReasoning,
  validateReasoning,
  type ConstraintSignal,
  type ContextSignal,
  type EvidenceSignal,
} from './reasoning-engine';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  REASONING_ACTIONS,
  REASONING_CONSTITUTIONAL_REF,
  REASONING_MODE_PROFILES,
  REUSED_RUNTIMES,
} from './reasoning.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const FOUNDER_MODES: ReasoningMode[] = ['CONSTITUTIONAL', 'FOUNDER_GUIDED'];

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
export class ReasoningService {
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
    await tx.reasoningHistory.create({
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
    const session = await this.prisma.reasoningSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Reasoning session not found');
    }
    return session;
  }

  // ----------------------------------------------------------------------
  // Part C — start reasoning (full pipeline)
  // ----------------------------------------------------------------------

  async startReasoning(
    workspaceId: string,
    userId: string,
    dto: StartReasoningDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.question?.trim()) {
      throw new BadRequestException('question is required');
    }

    const founderPresent = Boolean(dto.founderGuidance?.trim());
    const contexts: ContextSignal[] = (dto.contexts ?? []).map((c) => ({
      runtime: c.runtime,
      role: c.role,
      weight: c.weight,
      confidence: c.confidence,
      referenceId: c.referenceId,
      referenceType: c.referenceType,
      summary: c.summary,
    }));
    const evidenceSignals: EvidenceSignal[] = (dto.evidence ?? []).map((e) => ({
      summary: e.summary,
      confidence: e.confidence,
      runtime: e.runtime,
      referenceId: e.referenceId,
      referenceType: e.referenceType,
    }));
    const constraints: ConstraintSignal[] = (dto.constraints ?? []).map((c) => ({
      name: c.name,
      satisfied: c.satisfied,
      weight: c.weight,
      required: c.required,
    }));

    const outcome = runReasoning({
      mode: dto.mode,
      question: dto.question.trim(),
      contexts,
      evidence: evidenceSignals,
      constraints,
      founderPresent,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.reasoningSession.create({
        data: {
          workspaceId,
          ownerId: userId,
          mode: dto.mode,
          question: dto.question.trim(),
          objective: dto.objective?.trim() || null,
          status: 'COMPLETED',
          confidence: outcome.confidence,
          verdict: outcome.verdict,
          constraintsSatisfied: outcome.constraintsSatisfied,
          alternativesCount: outcome.alternatives.length,
          constitutionalRef: REASONING_CONSTITUTIONAL_REF.SESSION,
          metadata: jsonify({ ...dto.metadata, founderGuided: founderPresent }),
        },
      });

      // Persist loaded context (references only).
      for (const c of dto.contexts ?? []) {
        await tx.reasoningContext.create({
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

      // Primary reasoning chain + steps (Part C stages).
      const primaryChain = await tx.reasoningChain.create({
        data: {
          sessionId: session.id,
          workspaceId,
          mode: dto.mode,
          status: 'PRIMARY',
          sequence: 0,
          primary: true,
          confidence: outcome.confidence,
          rationale: outcome.conclusion,
          constitutionalRef: REASONING_CONSTITUTIONAL_REF.CHAIN,
          actorId: userId,
        },
      });
      for (const step of outcome.steps) {
        await tx.reasoningStep.create({
          data: {
            chainId: primaryChain.id,
            sessionId: session.id,
            workspaceId,
            kind: step.kind,
            sequence: step.sequence,
            summary: step.summary,
            output: jsonify(step.output),
            confidence: step.confidence,
            actorId: userId,
          },
        });
      }

      // Alternative reasoning paths (Part C).
      let altSeq = 1;
      for (const alt of outcome.alternatives) {
        await tx.reasoningChain.create({
          data: {
            sessionId: session.id,
            workspaceId,
            mode: alt.mode,
            status: 'ALTERNATIVE',
            sequence: altSeq,
            primary: false,
            confidence: alt.confidence,
            rationale: alt.rationale,
            constitutionalRef: REASONING_CONSTITUTIONAL_REF.CHAIN,
            actorId: userId,
          },
        });
        altSeq += 1;
      }

      // Evidence aggregation (Part C).
      for (const e of dto.evidence ?? []) {
        await tx.reasoningEvidence.create({
          data: {
            sessionId: session.id,
            workspaceId,
            evidenceType: 'INPUT_EVIDENCE',
            runtime: e.runtime?.trim() || null,
            referenceId: e.referenceId?.trim() || null,
            referenceType: e.referenceType?.trim() || null,
            summary: e.summary?.trim() || null,
            confidence: e.confidence ?? 1,
            actorId: userId,
          },
        });
      }
      await tx.reasoningEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'REASONING_OUTCOME',
          summary: outcome.conclusion,
          confidence: outcome.confidence,
          payload: jsonify({
            verdict: outcome.verdict,
            contextConfidence: outcome.contextConfidence,
            evidenceConfidence: outcome.evidenceConfidence,
            constraintRatio: outcome.constraintRatio,
          }),
          actorId: userId,
        },
      });

      // Reasoning result (Part C).
      const result = await tx.reasoningResult.create({
        data: {
          sessionId: session.id,
          workspaceId,
          verdict: outcome.verdict,
          confidence: outcome.confidence,
          conclusion: outcome.conclusion,
          constraintsSatisfied: outcome.constraintsSatisfied,
          alternativesCount: outcome.alternatives.length,
          constitutionalRef: REASONING_CONSTITUTIONAL_REF.RESULT,
          payload: jsonify({
            trace: outcome.trace,
            violations: outcome.violations,
            alternatives: outcome.alternatives,
          }),
          actorId: userId,
        },
      });

      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'REASONING_STARTED',
        userId,
        {
          constitutionalRef: REASONING_CONSTITUTIONAL_REF.SESSION,
          notes: `${dto.mode} reasoning`,
        },
      );
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'REASONING_COMPLETED',
        userId,
        {
          referenceId: result.id,
          referenceType: 'ReasoningResult',
          constitutionalRef: REASONING_CONSTITUTIONAL_REF.RESULT,
          notes: `${outcome.verdict} @ ${outcome.confidence.toFixed(2)}`,
        },
      );

      return { session, result };
    });

    await this.recordAudit(
      REASONING_ACTIONS.START_REASONING,
      'ReasoningSession',
      created.session.id,
      ctx,
      workspaceId,
      userId,
      null,
      {
        id: created.session.id,
        mode: created.session.mode,
        verdict: created.session.verdict,
        confidence: created.session.confidence,
      },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `reasoning:start:${created.session.id}`, ctx);
    return { ...created.session, result: created.result, outcome };
  }

  // ----------------------------------------------------------------------
  // Reads: sessions, trace, history, evidence
  // ----------------------------------------------------------------------

  async listSessions(workspaceId: string, query: ListSessionsQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.ReasoningSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.search ? { question: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.reasoningSession.findMany({
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
    const [result, contexts, chains] = await Promise.all([
      this.prisma.reasoningResult.findFirst({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.reasoningContext.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reasoningChain.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { sequence: 'asc' },
      }),
    ]);
    return { session, result, contexts, chains };
  }

  async getTrace(workspaceId: string, id: string) {
    await this.loadSessionOrThrow(id, workspaceId);
    const chains = await this.prisma.reasoningChain.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { sequence: 'asc' },
    });
    const steps = await this.prisma.reasoningStep.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { sequence: 'asc' },
    });
    const stepsByChain = new Map<string, typeof steps>();
    for (const step of steps) {
      const list = stepsByChain.get(step.chainId) ?? [];
      list.push(step);
      stepsByChain.set(step.chainId, list);
    }
    return {
      sessionId: id,
      chains: chains.map((chain) => ({
        ...chain,
        steps: stepsByChain.get(chain.id) ?? [],
      })),
    };
  }

  async listHistory(workspaceId: string, id: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(id, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.reasoningHistory.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listEvidence(workspaceId: string, id: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(id, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.reasoningEvidence.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part D — reasoning validation
  // ----------------------------------------------------------------------

  async validateSession(
    workspaceId: string,
    userId: string,
    id: string,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [contexts, evidenceItems] = await Promise.all([
      this.prisma.reasoningContext.findMany({ where: { sessionId: id, workspaceId } }),
      this.prisma.reasoningEvidence.findMany({
        where: { sessionId: id, workspaceId, evidenceType: 'INPUT_EVIDENCE' },
      }),
    ]);

    const contextAgg = aggregateContext(
      contexts.map((c) => ({
        runtime: c.runtime,
        role: c.role,
        weight: c.weight,
        confidence: c.confidence,
      })),
    );
    const evidenceAgg = aggregateEvidence(evidenceItems.map((e) => ({ confidence: e.confidence })));
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const founderGuided = metadata.founderGuided === true;
    const founderAuthorityValid = !FOUNDER_MODES.includes(session.mode) || founderGuided;

    const validation = validateReasoning({
      mode: session.mode,
      contextConfidence: contextAgg.confidence,
      evidenceConfidence: evidenceAgg.confidence,
      evidenceCount: evidenceAgg.count,
      hasKnowledge: contextAgg.hasKnowledge,
      constraintsSatisfied: session.constraintsSatisfied,
      hasConstitutionalRef: Boolean(session.constitutionalRef),
      founderAuthorityValid,
    });

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reasoningValidation.create({
        data: {
          sessionId: id,
          workspaceId,
          valid: validation.valid,
          kinds: jsonify(validation.checks),
          issues: jsonify(validation.issues),
          constitutionalRef: REASONING_CONSTITUTIONAL_REF.VALIDATION,
          actorId: userId,
        },
      });
      await tx.reasoningEvidence.create({
        data: {
          sessionId: id,
          workspaceId,
          evidenceType: 'REASONING_VALIDATION',
          summary: validation.valid ? 'Reasoning validated' : 'Reasoning validation failed',
          confidence: validation.valid ? 1 : 0,
          payload: jsonify({ checks: validation.checks, issues: validation.issues }),
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { sessionId: id, workspaceId }, 'REASONING_VALIDATED', userId, {
        referenceId: created.id,
        referenceType: 'ReasoningValidation',
        constitutionalRef: REASONING_CONSTITUTIONAL_REF.VALIDATION,
        notes: validation.valid ? 'valid' : validation.issues.join('; '),
      });
      return created;
    });

    await this.recordAudit(
      REASONING_ACTIONS.VALIDATE,
      'ReasoningValidation',
      record.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: record.id, valid: validation.valid },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `reasoning:validate:${id}`, ctx);
    return { sessionId: id, validation, validationId: record.id };
  }

  // ----------------------------------------------------------------------
  // Part F — founder override (immutable)
  // ----------------------------------------------------------------------

  async override(
    workspaceId: string,
    userId: string,
    id: string,
    dto: ReasoningOverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    if (!dto.directive?.trim()) {
      throw new BadRequestException('directive is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.reasoningSession.update({
        where: { id: session.id },
        data: { overridden: true, status: 'OVERRIDDEN' },
      });
      await tx.reasoningEvidence.create({
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
            dto.constitutionalRef?.trim() || REASONING_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
          notes: dto.directive.trim(),
        },
      );
      return next;
    });

    await this.recordAudit(
      REASONING_ACTIONS.OVERRIDE,
      'ReasoningSession',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: session.status },
      { status: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(
      workspaceId,
      session.ownerId,
      `reasoning:override:${session.id}`,
      ctx,
    );
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [total, completed, contested, overridden, chains, validations] = await Promise.all([
      this.prisma.reasoningSession.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.reasoningSession.count({
        where: { workspaceId, deletedAt: null, status: 'COMPLETED' },
      }),
      this.prisma.reasoningSession.count({
        where: { workspaceId, deletedAt: null, verdict: 'CONTESTED' },
      }),
      this.prisma.reasoningSession.count({
        where: { workspaceId, deletedAt: null, overridden: true },
      }),
      this.prisma.reasoningChain.count({ where: { workspaceId } }),
      this.prisma.reasoningValidation.count({ where: { workspaceId } }),
    ]);

    const byModeRaw = await this.prisma.reasoningSession.groupBy({
      by: ['mode'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byMode = byModeRaw.map((row) => ({ mode: row.mode, count: row._count._all }));

    const byVerdictRaw = await this.prisma.reasoningSession.groupBy({
      by: ['verdict'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byVerdict = byVerdictRaw.map((row) => ({
      verdict: row.verdict,
      count: row._count._all,
    }));

    return {
      sessions: { total, completed, contested, overridden },
      chains,
      validations,
      byMode,
      byVerdict,
      supportedModes: Object.values(REASONING_MODE_PROFILES).map((p) => ({
        mode: p.mode,
        name: p.name,
      })),
      reusedRuntimes: [...REUSED_RUNTIMES],
    };
  }
}

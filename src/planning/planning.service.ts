import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  ListSessionsQueryDto,
  PlanningOverrideDto,
  StartPlanningDto,
  StreamQueryDto,
} from './dto/planning.dto';
import {
  aggregateContext,
  decomposeGoals,
  estimateResources,
  runPlanning,
  validatePlanning,
  type ConstraintSignal,
  type ContextSignal,
  type GoalSignal,
  type ResourceSignal,
} from './planning-engine';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  FOUNDER_PLANNING_MODES,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  PLANNING_ACTIONS,
  PLANNING_CONSTITUTIONAL_REF,
  PLANNING_MODE_PROFILES,
  REUSED_RUNTIMES,
} from './planning.constants';

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
export class PlanningService {
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
    await tx.planningHistory.create({
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
    const session = await this.prisma.planningSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Planning session not found');
    }
    return session;
  }

  private readResources(metadata: Prisma.JsonValue | null): ResourceSignal[] {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const raw = meta.planningResources;
    if (!Array.isArray(raw)) return [];
    return raw as ResourceSignal[];
  }

  // ----------------------------------------------------------------------
  // Part A/C — start planning (intake)
  // ----------------------------------------------------------------------

  async startPlanning(
    workspaceId: string,
    userId: string,
    dto: StartPlanningDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.objective?.trim()) {
      throw new BadRequestException('objective is required');
    }

    const founderPresent = Boolean(dto.founderGuidance?.trim());
    const resources: ResourceSignal[] = (dto.resources ?? []).map((r) => ({
      name: r.name,
      required: r.required,
      available: r.available,
      demand: r.demand,
      capacity: r.capacity,
    }));
    const decomposition = decomposeGoals(
      (dto.goals ?? []).map((g) => ({
        title: g.title,
        description: g.description,
        priority: g.priority,
        weight: g.weight,
        measurable: g.measurable,
        referenceId: g.referenceId,
        referenceType: g.referenceType,
      })),
    );
    const clarityByGoal = new Map(decomposition.goals.map((g) => [g.title, g.clarity]));

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.planningSession.create({
        data: {
          workspaceId,
          ownerId: userId,
          mode: dto.mode,
          objective: dto.objective.trim(),
          focus: dto.focus?.trim() || null,
          status: 'PLANNING',
          goalCount: dto.goals?.length ?? 0,
          constitutionalRef: PLANNING_CONSTITUTIONAL_REF.SESSION,
          metadata: jsonify({
            ...dto.metadata,
            founderGuided: founderPresent,
            planningResources: resources,
          }),
        },
      });

      for (const c of dto.contexts ?? []) {
        await tx.planningContext.create({
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

      for (const g of dto.goals ?? []) {
        await tx.planningGoal.create({
          data: {
            sessionId: session.id,
            workspaceId,
            title: g.title.trim(),
            description: g.description?.trim() || null,
            priority: g.priority ?? 0,
            weight: g.weight ?? 1,
            measurable: Boolean(g.measurable),
            decomposed: true,
            stepCount: decomposition.goals.find((d) => d.title === g.title)?.stepCount ?? 0,
            confidence: clarityByGoal.get(g.title) ?? 0,
            referenceId: g.referenceId?.trim() || null,
            referenceType: g.referenceType?.trim() || null,
            constitutionalRef: PLANNING_CONSTITUTIONAL_REF.GOAL,
            actorId: userId,
          },
        });
      }

      for (const c of dto.constraints ?? []) {
        await tx.planningConstraint.create({
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
        'PLANNING_STARTED',
        userId,
        {
          constitutionalRef: PLANNING_CONSTITUTIONAL_REF.SESSION,
          notes: `${dto.mode} planning intake`,
        },
      );

      return session;
    });

    await this.recordAudit(
      PLANNING_ACTIONS.START_PLANNING,
      'PlanningSession',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, mode: created.mode, status: created.status },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `planning:start:${created.id}`, ctx);
    return created;
  }

  // ----------------------------------------------------------------------
  // Part C — generate plan (full pipeline)
  // ----------------------------------------------------------------------

  async generatePlan(workspaceId: string, userId: string, id: string, ctx?: MutationAuditContext) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    if (session.overridden) {
      throw new BadRequestException('Planning session is overridden and immutable');
    }

    const [goals, constraints, contexts] = await Promise.all([
      this.prisma.planningGoal.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { priority: 'desc' },
      }),
      this.prisma.planningConstraint.findMany({ where: { sessionId: id, workspaceId } }),
      this.prisma.planningContext.findMany({ where: { sessionId: id, workspaceId } }),
    ]);

    const goalSignals: GoalSignal[] = goals.map((g) => ({
      title: g.title,
      description: g.description,
      priority: g.priority,
      weight: g.weight,
      measurable: g.measurable,
      referenceId: g.referenceId,
      referenceType: g.referenceType,
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
    const resources = this.readResources(session.metadata);

    const outcome = runPlanning({
      mode: session.mode,
      objective: session.objective,
      goals: goalSignals,
      constraints: constraintSignals,
      contexts: contextSignals,
      resources,
      founderPresent: (session.metadata as Record<string, unknown>)?.founderGuided === true,
    });

    const version = session.version + 1;

    const record = await this.prisma.$transaction(async (tx) => {
      const strategy = await tx.planningStrategy.create({
        data: {
          sessionId: id,
          workspaceId,
          mode: outcome.strategy.mode,
          name: outcome.strategy.name,
          rationale: outcome.strategy.rationale,
          confidence: outcome.strategy.confidence,
          selected: true,
          constitutionalRef: PLANNING_CONSTITUTIONAL_REF.STRATEGY,
          actorId: userId,
        },
      });

      const primaryPlan = await tx.planningPlan.create({
        data: {
          sessionId: id,
          workspaceId,
          mode: outcome.mode,
          status: 'PRIMARY',
          sequence: version * 100,
          primary: true,
          readiness: outcome.readiness,
          riskLevel: outcome.riskLevel,
          confidence: outcome.confidence,
          timelineDuration: outcome.timeline.totalDuration,
          rationale: outcome.summary,
          constitutionalRef: PLANNING_CONSTITUTIONAL_REF.PLAN,
          actorId: userId,
          payload: jsonify({
            trace: outcome.trace,
            dependencyGraph: outcome.dependencyGraph,
            violations: outcome.violations,
            shortfalls: outcome.shortfalls,
            strategyId: strategy.id,
          }),
        },
      });

      for (const step of outcome.steps) {
        await tx.planningStep.create({
          data: {
            planId: primaryPlan.id,
            sessionId: id,
            workspaceId,
            sequence: step.sequence,
            title: step.title,
            description: step.description,
            goalReference: step.goalReference,
            dependsOn: jsonify(step.sequence > 0 ? [step.sequence - 1] : []),
            resourceEstimate: step.resourceEstimate,
            durationEstimate: step.durationEstimate,
            confidence: step.confidence,
            actorId: userId,
          },
        });
      }

      for (const milestone of outcome.milestones) {
        await tx.planningMilestone.create({
          data: {
            planId: primaryPlan.id,
            sessionId: id,
            workspaceId,
            sequence: milestone.sequence,
            title: milestone.title,
            criteria: milestone.criteria,
            targetOffset: milestone.targetOffset,
            actorId: userId,
          },
        });
      }

      let altSeq = version * 100 + 1;
      for (const alt of outcome.alternatives) {
        await tx.planningPlan.create({
          data: {
            sessionId: id,
            workspaceId,
            mode: alt.mode,
            status: 'ALTERNATIVE',
            sequence: altSeq,
            primary: false,
            readiness: alt.readiness,
            riskLevel: outcome.riskLevel,
            confidence: alt.confidence,
            timelineDuration: outcome.timeline.totalDuration,
            rationale: alt.rationale,
            constitutionalRef: PLANNING_CONSTITUTIONAL_REF.PLAN,
            actorId: userId,
          },
        });
        await tx.planningStrategy.create({
          data: {
            sessionId: id,
            workspaceId,
            mode: alt.mode,
            name: `${PLANNING_MODE_PROFILES[alt.mode].name} strategy`,
            rationale: alt.rationale,
            confidence: alt.confidence,
            selected: false,
            constitutionalRef: PLANNING_CONSTITUTIONAL_REF.STRATEGY,
            actorId: userId,
          },
        });
        altSeq += 1;
      }

      await tx.planningEvidence.create({
        data: {
          sessionId: id,
          workspaceId,
          evidenceType: 'PLANNING_OUTCOME',
          summary: outcome.summary,
          confidence: outcome.confidence,
          payload: jsonify({
            readiness: outcome.readiness,
            riskLevel: outcome.riskLevel,
            goalConfidence: outcome.goalConfidence,
            constraintRatio: outcome.constraintRatio,
            resourceFeasibility: outcome.resourceFeasibility,
            timeline: outcome.timeline.totalDuration,
          }),
          actorId: userId,
        },
      });

      const updated = await tx.planningSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          confidence: outcome.confidence,
          readiness: outcome.readiness,
          riskLevel: outcome.riskLevel,
          constraintsSatisfied: outcome.constraintsSatisfied,
          planCount: outcome.alternatives.length + 1,
          version,
        },
      });

      await this.writeHistory(tx, { sessionId: id, workspaceId }, 'PLAN_GENERATED', userId, {
        referenceId: primaryPlan.id,
        referenceType: 'PlanningPlan',
        constitutionalRef: PLANNING_CONSTITUTIONAL_REF.PLAN,
        notes: `${outcome.readiness} @ ${outcome.confidence.toFixed(2)} (risk ${outcome.riskLevel})`,
      });

      return { plan: primaryPlan, session: updated };
    });

    await this.recordAudit(
      PLANNING_ACTIONS.GENERATE_PLAN,
      'PlanningPlan',
      record.plan.id,
      ctx,
      workspaceId,
      userId,
      null,
      {
        id: record.plan.id,
        readiness: record.plan.readiness,
        confidence: record.plan.confidence,
        riskLevel: record.plan.riskLevel,
      },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `planning:generate:${id}`, ctx);
    return { ...record.session, plan: record.plan, outcome };
  }

  // ----------------------------------------------------------------------
  // Reads: sessions, plan detail, history, evidence
  // ----------------------------------------------------------------------

  async listSessions(workspaceId: string, query: ListSessionsQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.PlanningSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.search ? { objective: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.planningSession.findMany({
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
    const [goals, constraints, contexts, plans] = await Promise.all([
      this.prisma.planningGoal.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { priority: 'desc' },
      }),
      this.prisma.planningConstraint.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.planningContext.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.planningPlan.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { sequence: 'desc' },
      }),
    ]);
    return { session, goals, constraints, contexts, plans };
  }

  async getPlan(workspaceId: string, id: string) {
    await this.loadSessionOrThrow(id, workspaceId);
    const plan = await this.prisma.planningPlan.findFirst({
      where: { sessionId: id, workspaceId, primary: true },
      orderBy: { sequence: 'desc' },
    });
    if (!plan) {
      throw new NotFoundException('No plan has been generated for this session');
    }
    const [steps, milestones, strategies] = await Promise.all([
      this.prisma.planningStep.findMany({
        where: { planId: plan.id, workspaceId },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.planningMilestone.findMany({
        where: { planId: plan.id, workspaceId },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.planningStrategy.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const alternatives = await this.prisma.planningPlan.findMany({
      where: { sessionId: id, workspaceId, status: 'ALTERNATIVE' },
      orderBy: { confidence: 'desc' },
    });
    return { plan, steps, milestones, strategies, alternatives };
  }

  async listHistory(workspaceId: string, id: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(id, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.planningHistory.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listEvidence(workspaceId: string, id: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(id, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.planningEvidence.findMany({
      where: { sessionId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part D — planning validation
  // ----------------------------------------------------------------------

  async validateSession(
    workspaceId: string,
    userId: string,
    id: string,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [goals, contexts] = await Promise.all([
      this.prisma.planningGoal.findMany({ where: { sessionId: id, workspaceId } }),
      this.prisma.planningContext.findMany({ where: { sessionId: id, workspaceId } }),
    ]);

    const decomposition = decomposeGoals(
      goals.map((g) => ({
        title: g.title,
        description: g.description,
        priority: g.priority,
        weight: g.weight,
        measurable: g.measurable,
      })),
    );
    const contextAgg = aggregateContext(
      contexts.map((c) => ({
        runtime: c.runtime,
        role: c.role,
        weight: c.weight,
        confidence: c.confidence,
      })),
    );
    const resourceEst = estimateResources(this.readResources(session.metadata));
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const founderGuided = metadata.founderGuided === true;
    const founderAuthorityValid = !FOUNDER_PLANNING_MODES.includes(session.mode) || founderGuided;

    const validation = validatePlanning({
      mode: session.mode,
      goalConfidence: decomposition.goalConfidence,
      goalCount: decomposition.count,
      resourceFeasibility: resourceEst.feasibility,
      constraintsSatisfied: session.constraintsSatisfied,
      dependencyCyclic: false,
      hasReasoning: contextAgg.hasReasoning,
      riskLevel: session.riskLevel ?? 'MODERATE',
      hasConstitutionalRef: Boolean(session.constitutionalRef),
      founderAuthorityValid,
    });

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.planningValidation.create({
        data: {
          sessionId: id,
          workspaceId,
          valid: validation.valid,
          kinds: jsonify(validation.checks),
          issues: jsonify(validation.issues),
          constitutionalRef: PLANNING_CONSTITUTIONAL_REF.VALIDATION,
          actorId: userId,
        },
      });
      await tx.planningEvidence.create({
        data: {
          sessionId: id,
          workspaceId,
          evidenceType: 'PLANNING_VALIDATION',
          summary: validation.valid ? 'Plan validated' : 'Plan validation failed',
          confidence: validation.valid ? 1 : 0,
          payload: jsonify({ checks: validation.checks, issues: validation.issues }),
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { sessionId: id, workspaceId }, 'PLAN_VALIDATED', userId, {
        referenceId: created.id,
        referenceType: 'PlanningValidation',
        constitutionalRef: PLANNING_CONSTITUTIONAL_REF.VALIDATION,
        notes: validation.valid ? 'valid' : validation.issues.join('; '),
      });
      return created;
    });

    await this.recordAudit(
      PLANNING_ACTIONS.VALIDATE,
      'PlanningValidation',
      record.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: record.id, valid: validation.valid },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `planning:validate:${id}`, ctx);
    return { sessionId: id, validation, validationId: record.id };
  }

  // ----------------------------------------------------------------------
  // Part F — founder override (immutable)
  // ----------------------------------------------------------------------

  async override(
    workspaceId: string,
    userId: string,
    id: string,
    dto: PlanningOverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    if (!dto.directive?.trim()) {
      throw new BadRequestException('directive is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.planningSession.update({
        where: { id: session.id },
        data: { overridden: true, status: 'OVERRIDDEN' },
      });
      await tx.planningEvidence.create({
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
            dto.constitutionalRef?.trim() || PLANNING_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
          notes: dto.directive.trim(),
        },
      );
      return next;
    });

    await this.recordAudit(
      PLANNING_ACTIONS.OVERRIDE,
      'PlanningSession',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: session.status },
      { status: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `planning:override:${session.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [total, completed, blocked, overridden, plans, validations] = await Promise.all([
      this.prisma.planningSession.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.planningSession.count({
        where: { workspaceId, deletedAt: null, status: 'COMPLETED' },
      }),
      this.prisma.planningSession.count({
        where: { workspaceId, deletedAt: null, readiness: 'BLOCKED' },
      }),
      this.prisma.planningSession.count({
        where: { workspaceId, deletedAt: null, overridden: true },
      }),
      this.prisma.planningPlan.count({ where: { workspaceId } }),
      this.prisma.planningValidation.count({ where: { workspaceId } }),
    ]);

    const byModeRaw = await this.prisma.planningSession.groupBy({
      by: ['mode'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byMode = byModeRaw.map((row) => ({ mode: row.mode, count: row._count._all }));

    const byReadinessRaw = await this.prisma.planningSession.groupBy({
      by: ['readiness'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byReadiness = byReadinessRaw.map((row) => ({
      readiness: row.readiness,
      count: row._count._all,
    }));

    return {
      sessions: { total, completed, blocked, overridden },
      plans,
      validations,
      byMode,
      byReadiness,
      supportedModes: Object.values(PLANNING_MODE_PROFILES).map((p) => ({
        mode: p.mode,
        name: p.name,
      })),
      reusedRuntimes: [...REUSED_RUNTIMES],
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  ArbitrateDto,
  CreateOrchestrationDto,
  CreatePolicyDto,
  ListQueryDto,
  MergeRequestDto,
  MergeRollbackDto,
  OverrideDto,
  RouteDto,
  StartOrchestrationDto,
  StreamQueryDto,
} from './dto/meta.dto';
import {
  arbitrate as engineArbitrate,
  planSteps,
  resolveRoute,
  validateMerge,
} from './meta-engine';
import {
  ARBITRATION_TYPES,
  COORDINATED_RUNTIMES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  META_ACTIONS,
  OVERRIDE_TYPES,
  ROUTE_TARGETS,
} from './meta.constants';

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
export class MetaService {
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
    ids: { sessionId: string; workspaceId: string; planId?: string | null },
    eventType: string,
    actorId: string,
    data?: { referenceId?: string | null; notes?: string; metadata?: Record<string, unknown> },
  ) {
    await tx.metaExecutionHistory.create({
      data: {
        sessionId: ids.sessionId,
        planId: ids.planId ?? null,
        workspaceId: ids.workspaceId,
        eventType,
        referenceId: data?.referenceId ?? null,
        notes: data?.notes ?? null,
        actorId,
        metadata: jsonify(data?.metadata),
      },
    });
  }

  private async loadSessionOrThrow(id: string, workspaceId: string) {
    const session = await this.prisma.metaOrchestrationSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Orchestration session not found');
    }
    return session;
  }

  // ----------------------------------------------------------------------
  // Part A — orchestration lifecycle
  // ----------------------------------------------------------------------

  async createOrchestration(
    workspaceId: string,
    userId: string,
    dto: CreateOrchestrationDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const ownerId = dto.ownerId?.trim() || userId;
    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.metaOrchestrationSession.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          workspaceId,
          ownerId,
          objective: dto.objective?.trim() || null,
          targetDomain: dto.targetDomain?.trim() || null,
          state: 'OPEN',
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.metaExecutionState.create({
        data: {
          sessionId: session.id,
          workspaceId,
          status: 'IDLE',
          detail: 'Orchestration created',
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'ORCHESTRATION_CREATED',
        userId,
        { notes: session.name },
      );
      return session;
    });

    await this.recordAudit(
      META_ACTIONS.CREATE_ORCHESTRATION,
      'MetaOrchestrationSession',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, name: created.name, state: created.state },
      true,
    );
    await this.recordEvidence(workspaceId, ownerId, `meta:orchestration:create:${created.id}`, ctx);
    return created;
  }

  async startOrchestration(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: StartOrchestrationDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    if (session.overridden) {
      throw new BadRequestException('Session is under an immutable founder override');
    }
    const inputs = dto.steps?.length
      ? dto.steps
      : [
          {
            name: session.objective || 'Coordinate runtimes',
            target: undefined,
            intent: session.targetDomain,
          },
        ];
    const planned = planSteps(
      inputs.map((s) => ({ name: s.name, target: s.target ?? null, intent: s.intent ?? null })),
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.metaExecutionPlan.create({
        data: {
          sessionId: session.id,
          workspaceId,
          name: dto.planName?.trim() || `Plan for ${session.name}`,
          status: 'RUNNING',
          version: session.planSeq + 1,
          stepCount: planned.length,
          actorId: userId,
          startedAt: new Date(),
          definition: jsonify({ steps: planned }),
          metadata: jsonify(dto.metadata),
        },
      });
      for (const step of planned) {
        await tx.metaExecutionStep.create({
          data: {
            planId: plan.id,
            sessionId: session.id,
            workspaceId,
            sequence: step.sequence,
            name: step.name,
            target: step.target,
            status: 'ROUTED',
            routeReason: step.reason,
            actorId: userId,
            metadata: jsonify({ constitutionalRef: step.constitutionalRef }),
          },
        });
      }
      const state = await tx.metaExecutionState.create({
        data: {
          sessionId: session.id,
          planId: plan.id,
          workspaceId,
          status: 'RUNNING',
          currentStep: 0,
          totalSteps: planned.length,
          progress: 0,
          detail: 'Orchestration started',
          actorId: userId,
        },
      });
      await tx.metaOrchestrationSession.update({
        where: { id: session.id },
        data: { state: 'EXECUTING', planSeq: { increment: 1 } },
      });
      await tx.metaExecutionEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'PLAN_STARTED',
          referenceId: plan.id,
          referenceType: 'MetaExecutionPlan',
          summary: `Plan started with ${planned.length} routed steps`,
          payload: jsonify({ steps: planned }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId, planId: plan.id },
        'ORCHESTRATION_STARTED',
        userId,
        { referenceId: plan.id, notes: `${planned.length} steps` },
      );
      return { plan, state };
    });

    await this.recordAudit(
      META_ACTIONS.START_ORCHESTRATION,
      'MetaExecutionPlan',
      result.plan.id,
      ctx,
      workspaceId,
      userId,
      { state: session.state },
      { state: 'EXECUTING', planId: result.plan.id, steps: planned.length },
      true,
    );
    await this.recordEvidence(
      workspaceId,
      session.ownerId,
      `meta:orchestration:start:${session.id}`,
      ctx,
    );
    return result;
  }

  async listSessions(workspaceId: string, query: ListQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.MetaOrchestrationSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.metaOrchestrationSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getSession(workspaceId: string, id: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [plans, overrides] = await Promise.all([
      this.prisma.metaExecutionPlan.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.metaOverrideEvent.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    return { session, plans, overrides };
  }

  async getExecutionPlan(workspaceId: string, sessionId: string) {
    await this.loadSessionOrThrow(sessionId, workspaceId);
    const plan = await this.prisma.metaExecutionPlan.findFirst({
      where: { sessionId, workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!plan) {
      throw new NotFoundException('No execution plan for this session');
    }
    const steps = await this.prisma.metaExecutionStep.findMany({
      where: { planId: plan.id, workspaceId },
      orderBy: { sequence: 'asc' },
    });
    return { plan, steps };
  }

  async getExecutionState(workspaceId: string, sessionId: string) {
    await this.loadSessionOrThrow(sessionId, workspaceId);
    const state = await this.prisma.metaExecutionState.findFirst({
      where: { sessionId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!state) {
      throw new NotFoundException('No execution state for this session');
    }
    return state;
  }

  async listHistory(workspaceId: string, sessionId: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(sessionId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.metaExecutionHistory.findMany({
      where: { sessionId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part B — routing
  // ----------------------------------------------------------------------

  async route(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: RouteDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    const resolution = resolveRoute({
      target: dto.target ?? null,
      intent: dto.intent ?? null,
      candidates: dto.candidates,
    });

    const decision = await this.prisma.$transaction(async (tx) => {
      const created = await tx.metaRoutingDecision.create({
        data: {
          sessionId: session.id,
          workspaceId,
          target: resolution.target,
          intent: dto.intent?.trim() || null,
          referenceId: dto.referenceId?.trim() || null,
          referenceType: dto.referenceType?.trim() || null,
          score: resolution.score,
          reason: resolution.reason,
          constitutionalRef: resolution.constitutionalRef,
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { sessionId: session.id, workspaceId }, 'ROUTED', userId, {
        referenceId: created.id,
        notes: resolution.target,
      });
      return created;
    });

    await this.recordAudit(
      META_ACTIONS.ROUTE,
      'MetaRoutingDecision',
      decision.id,
      ctx,
      workspaceId,
      userId,
      null,
      { target: resolution.target, score: resolution.score },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `meta:route:${decision.id}`, ctx);
    return decision;
  }

  // ----------------------------------------------------------------------
  // Part C — arbitration
  // ----------------------------------------------------------------------

  async arbitrate(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: ArbitrateDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    const outcome = engineArbitrate(dto.type, dto.paths);

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.metaArbitration.create({
        data: {
          sessionId: session.id,
          workspaceId,
          type: outcome.type,
          outcome: outcome.outcome,
          winningPath: outcome.winningPath,
          losingPaths: jsonify(outcome.losingPaths),
          reason: outcome.reason,
          constitutionalRef: outcome.constitutionalRef,
          actorId: userId,
        },
      });
      await tx.metaExecutionEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'ARBITRATION',
          referenceId: created.id,
          referenceType: 'MetaArbitration',
          summary: outcome.reason,
          payload: jsonify(outcome),
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { sessionId: session.id, workspaceId }, 'ARBITRATED', userId, {
        referenceId: created.id,
        notes: `${outcome.type}:${outcome.outcome}`,
      });
      return created;
    });

    await this.recordAudit(
      META_ACTIONS.ARBITRATE,
      'MetaArbitration',
      record.id,
      ctx,
      workspaceId,
      userId,
      null,
      { type: outcome.type, outcome: outcome.outcome, winningPath: outcome.winningPath },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `meta:arbitrate:${record.id}`, ctx);
    return record;
  }

  // ----------------------------------------------------------------------
  // Part D — merge
  // ----------------------------------------------------------------------

  async requestMerge(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: MergeRequestDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    const validation = validateMerge(dto.sourcePaths ?? []);

    const merge = await this.prisma.$transaction(async (tx) => {
      const created = await tx.metaMergeRequest.create({
        data: {
          sessionId: session.id,
          workspaceId,
          status: validation.status,
          sourcePaths: jsonify(dto.sourcePaths ?? []),
          validated: validation.valid,
          validationDetail: validation.detail,
          mergedResult: validation.valid ? jsonify({ merged: dto.sourcePaths }) : Prisma.JsonNull,
          reason: dto.reason?.trim() || null,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.metaMergeHistory.create({
        data: {
          mergeRefId: created.id,
          sessionId: session.id,
          workspaceId,
          eventType: validation.valid ? 'MERGE_VALIDATED' : 'MERGE_REJECTED',
          notes: validation.detail,
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'MERGE_REQUESTED',
        userId,
        { referenceId: created.id, notes: validation.status },
      );
      return created;
    });

    await this.recordAudit(
      validation.valid ? META_ACTIONS.MERGE_VALIDATE : META_ACTIONS.MERGE_REQUEST,
      'MetaMergeRequest',
      merge.id,
      ctx,
      workspaceId,
      userId,
      null,
      { status: merge.status, validated: merge.validated },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `meta:merge:request:${merge.id}`, ctx);
    return merge;
  }

  async commitMerge(
    workspaceId: string,
    userId: string,
    mergeId: string,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.prisma.metaMergeRequest.findFirst({
      where: { id: mergeId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Merge request not found');
    }
    if (!existing.validated) {
      throw new BadRequestException('Merge request has not passed validation');
    }
    if (existing.status === 'MERGED') {
      throw new BadRequestException('Merge request already committed');
    }
    if (existing.rolledBack) {
      throw new BadRequestException('Merge request has been rolled back');
    }

    const merge = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.metaMergeRequest.update({
        where: { id: existing.id },
        data: { status: 'MERGED', mergedAt: new Date() },
      });
      await tx.metaMergeHistory.create({
        data: {
          mergeRefId: existing.id,
          sessionId: existing.sessionId,
          workspaceId,
          eventType: 'MERGE_COMMITTED',
          notes: 'Merge committed',
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: existing.sessionId, workspaceId },
        'MERGE_COMMITTED',
        userId,
        { referenceId: existing.id },
      );
      return updated;
    });

    await this.recordAudit(
      META_ACTIONS.MERGE_COMMIT,
      'MetaMergeRequest',
      merge.id,
      ctx,
      workspaceId,
      userId,
      { status: existing.status },
      { status: 'MERGED' },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `meta:merge:commit:${merge.id}`, ctx);
    return merge;
  }

  async rollbackMerge(
    workspaceId: string,
    userId: string,
    mergeId: string,
    dto: MergeRollbackDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.prisma.metaMergeRequest.findFirst({
      where: { id: mergeId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Merge request not found');
    }
    if (existing.rolledBack) {
      throw new BadRequestException('Merge request already rolled back');
    }

    const merge = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.metaMergeRequest.update({
        where: { id: existing.id },
        data: {
          status: 'ROLLED_BACK',
          rolledBack: true,
          rolledBackAt: new Date(),
          reason: dto.reason?.trim() || existing.reason,
        },
      });
      await tx.metaMergeHistory.create({
        data: {
          mergeRefId: existing.id,
          sessionId: existing.sessionId,
          workspaceId,
          eventType: 'MERGE_ROLLED_BACK',
          notes: dto.reason?.trim() || 'Merge rolled back',
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: existing.sessionId, workspaceId },
        'MERGE_ROLLED_BACK',
        userId,
        { referenceId: existing.id },
      );
      return updated;
    });

    await this.recordAudit(
      META_ACTIONS.MERGE_ROLLBACK,
      'MetaMergeRequest',
      merge.id,
      ctx,
      workspaceId,
      userId,
      { status: existing.status },
      { status: 'ROLLED_BACK' },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `meta:merge:rollback:${merge.id}`, ctx);
    return merge;
  }

  async listMerges(workspaceId: string, sessionId: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(sessionId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.metaMergeRequest.findMany({
      where: { sessionId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part E — founder override (immutable)
  // ----------------------------------------------------------------------

  async override(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: OverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    if (!dto.directive?.trim()) {
      throw new BadRequestException('directive is required');
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.metaOverrideEvent.create({
        data: {
          sessionId: session.id,
          workspaceId,
          overrideType: dto.overrideType,
          directive: dto.directive.trim(),
          reason: dto.reason?.trim() || null,
          targetReferenceId: dto.targetReferenceId?.trim() || null,
          targetReferenceType: dto.targetReferenceType?.trim() || null,
          constitutionalRef: dto.constitutionalRef?.trim() || null,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.metaOrchestrationSession.update({
        where: { id: session.id },
        data: { overridden: true, state: 'OVERRIDDEN', eventSeq: { increment: 1 } },
      });
      await tx.metaExecutionEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'FOUNDER_OVERRIDE',
          referenceId: created.id,
          referenceType: 'MetaOverrideEvent',
          summary: `Immutable ${dto.overrideType} override`,
          payload: jsonify({ directive: created.directive, reason: created.reason }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'FOUNDER_OVERRIDE',
        userId,
        { referenceId: created.id, notes: dto.overrideType },
      );
      return created;
    });

    await this.recordAudit(
      META_ACTIONS.OVERRIDE,
      'MetaOverrideEvent',
      event.id,
      ctx,
      workspaceId,
      userId,
      null,
      { overrideType: event.overrideType, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `meta:override:${event.id}`, ctx);
    return event;
  }

  // ----------------------------------------------------------------------
  // Part G — governance policies
  // ----------------------------------------------------------------------

  async createPolicy(
    workspaceId: string,
    userId: string,
    dto: CreatePolicyDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const type = dto.policyType ?? 'ROUTING';
    const base = {
      workspaceId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      rules: jsonify(dto.rules),
      actorId: userId,
      metadata: jsonify(dto.metadata),
    };

    let created: { id: string };
    switch (type) {
      case 'ARBITRATION':
        created = await this.prisma.metaArbitrationPolicy.create({
          data: { ...base, type: dto.arbitrationType ?? null },
        });
        break;
      case 'MERGE':
        created = await this.prisma.metaMergePolicy.create({ data: base });
        break;
      case 'EXECUTION':
        created = await this.prisma.metaExecutionPolicy.create({ data: base });
        break;
      case 'ROUTING':
      default:
        created = await this.prisma.metaRoutingPolicy.create({
          data: { ...base, target: dto.target ?? null },
        });
        break;
    }

    await this.recordAudit(
      META_ACTIONS.CREATE_POLICY,
      `Meta${type[0]}${type.slice(1).toLowerCase()}Policy`,
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, type },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `meta:policy:${type}:${created.id}`, ctx);
    return { id: created.id, policyType: type };
  }

  async listPolicies(workspaceId: string) {
    const [routing, arbitration, merge, execution] = await Promise.all([
      this.prisma.metaRoutingPolicy.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.metaArbitrationPolicy.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.metaMergePolicy.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.metaExecutionPolicy.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { routing, arbitration, merge, execution };
  }

  // ----------------------------------------------------------------------
  // Part F — cross-runtime coordination + dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [
      sessions,
      activeSessions,
      overriddenSessions,
      plans,
      steps,
      routingDecisions,
      arbitrations,
      merges,
      overrides,
      // coordinated runtime footprints (Part F — read only)
      feeds,
      learningStates,
      capital,
      objects,
      measurements,
      runtimeSessions,
      exchanges,
      intents,
      iuc,
    ] = await Promise.all([
      this.prisma.metaOrchestrationSession.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.metaOrchestrationSession.count({
        where: { workspaceId, deletedAt: null, state: 'EXECUTING' },
      }),
      this.prisma.metaOrchestrationSession.count({
        where: { workspaceId, deletedAt: null, overridden: true },
      }),
      this.prisma.metaExecutionPlan.count({ where: { workspaceId } }),
      this.prisma.metaExecutionStep.count({ where: { workspaceId } }),
      this.prisma.metaRoutingDecision.count({ where: { workspaceId } }),
      this.prisma.metaArbitration.count({ where: { workspaceId } }),
      this.prisma.metaMergeRequest.count({ where: { workspaceId } }),
      this.prisma.metaOverrideEvent.count({ where: { workspaceId } }),
      this.prisma.intelligenceFeed.count({ where: { workspaceId } }),
      this.prisma.learningState.count({ where: { workspaceId } }),
      this.prisma.intelligenceCapital.count({ where: { workspaceId } }),
      this.prisma.intelligenceObject.count({ where: { workspaceId } }),
      this.prisma.measurementRecord.count({ where: { workspaceId } }),
      this.prisma.runtimeSession.count({ where: { workspaceId } }),
      this.prisma.exchangeTransaction.count({ where: { workspaceId } }),
      this.prisma.founderIntent.count({ where: { workspaceId } }),
      this.prisma.iUCEntity.count({ where: { workspaceId } }),
    ]);

    return {
      orchestration: {
        sessions,
        activeSessions,
        overriddenSessions,
        plans,
        steps,
      },
      routing: { decisions: routingDecisions, supportedTargets: ROUTE_TARGETS },
      arbitration: { records: arbitrations, supportedTypes: ARBITRATION_TYPES },
      merge: { requests: merges },
      override: { events: overrides, supportedTypes: OVERRIDE_TYPES },
      coordination: {
        coordinatedRuntimes: COORDINATED_RUNTIMES,
        footprint: {
          D11: feeds,
          D12: learningStates,
          D13: capital,
          D16: objects,
          D17: measurements,
          D18: runtimeSessions,
          D19: exchanges,
          FIC: intents,
          IUC: iuc,
        },
      },
    };
  }
}

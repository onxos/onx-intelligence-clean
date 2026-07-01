import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorityLevel,
  Prisma,
  RuntimeCheckpoint,
  RuntimeEventType,
  RuntimeHistoryEventType,
  RuntimeSession,
  RuntimeSessionState,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  AttachRuntimeContextDto,
  CreateRuntimeCheckpointDto,
  CreateRuntimePolicyDto,
  CreateRuntimeSessionDto,
  RecordRuntimeEventDto,
  RecoverRuntimeDto,
  RestoreCheckpointDto,
  RuntimeListQueryDto,
  RuntimeStreamQueryDto,
  TransitionRuntimeStateDto,
  UpdateRuntimeSessionDto,
} from './dto/runtime.dto';
import {
  canInitiateRecovery,
  computeRuntimeHealth,
  resolveRecoveryTargetState,
} from './runtime-engine';
import {
  canCheckpointRuntimeState,
  isValidRuntimeTransition,
  RUNTIME_ACTIVE_STATES,
  RUNTIME_HEARTBEAT_STALE_MS,
  RUNTIME_SESSION_STATES,
  RUNTIME_SORT_FIELDS,
  RUNTIME_STATE_TRANSITIONS,
} from './runtime.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_STREAM_LIMIT = 50;
const MAX_STREAM_LIMIT = 200;

@Injectable()
export class RuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
  ) {}

  // ----------------------------------------------------------------------
  // Helpers
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

  private async loadSessionOrThrow(id: string, workspaceId: string) {
    const session = await this.prisma.runtimeSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Runtime session not found');
    }
    return session;
  }

  private snapshot(session: RuntimeSession) {
    return {
      id: session.id,
      sessionId: session.sessionId,
      name: session.name,
      state: session.state,
      previousState: session.previousState,
      healthStatus: session.healthStatus,
      recoveryCount: session.recoveryCount,
      continuitySeq: session.continuitySeq,
      authority: session.authority,
      status: session.status,
      deletedAt: session.deletedAt,
    };
  }

  private computeSessionHealth(session: RuntimeSession, now = new Date()) {
    return computeRuntimeHealth({
      state: session.state,
      recoveryCount: session.recoveryCount,
      lastHeartbeatAt: session.lastHeartbeatAt,
      now,
    });
  }

  /** Persist a runtime event, incrementing the session's monotonic sequence. */
  private async emitEvent(
    tx: Prisma.TransactionClient,
    session: { id: string; workspaceId: string },
    seq: number,
    eventType: RuntimeEventType,
    state: RuntimeSessionState | null,
    actorId: string,
    description?: string,
    payload?: Record<string, unknown>,
  ) {
    await tx.runtimeEvent.create({
      data: {
        sessionId: session.id,
        eventType,
        sequence: seq,
        state: state ?? undefined,
        description: description ?? null,
        actorId,
        workspaceId: session.workspaceId,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
        metadata: {} as Prisma.InputJsonValue,
      },
    });
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    session: { id: string; workspaceId: string },
    eventType: RuntimeHistoryEventType,
    actorId: string,
    data: {
      fromState?: RuntimeSessionState | null;
      toState?: RuntimeSessionState | null;
      healthStatus?: RuntimeSession['healthStatus'] | null;
      referenceId?: string | null;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.runtimeHistory.create({
      data: {
        sessionId: session.id,
        eventType,
        fromState: data.fromState ?? undefined,
        toState: data.toState ?? undefined,
        healthStatus: data.healthStatus ?? undefined,
        referenceId: data.referenceId ?? null,
        actorId,
        workspaceId: session.workspaceId,
        notes: data.notes ?? null,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  // ----------------------------------------------------------------------
  // Part A — Runtime session CRUD
  // ----------------------------------------------------------------------

  async createSession(
    workspaceId: string,
    userId: string,
    dto: CreateRuntimeSessionDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      const ownerId = dto.ownerId?.trim() || userId;
      const created = await this.prisma.$transaction(async (tx) => {
        const session = await tx.runtimeSession.create({
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            workspaceId,
            ownerId,
            state: 'CREATED',
            healthStatus: 'UNKNOWN',
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            eventSeq: 1,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await tx.runtimeState.create({
          data: {
            sessionId: session.id,
            fromState: null,
            toState: 'CREATED',
            reason: 'Runtime session created',
            actorId: ownerId,
            workspaceId,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        await this.emitEvent(
          tx,
          session,
          1,
          'SESSION_CREATED',
          'CREATED',
          ownerId,
          'Runtime session created',
        );
        await this.writeHistory(tx, session, 'SESSION_CREATED', ownerId, {
          toState: 'CREATED',
          healthStatus: 'UNKNOWN',
          notes: 'Runtime session created',
        });
        return session;
      });

      await this.recordAudit(
        'RUNTIME_SESSION_CREATED',
        'RuntimeSession',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        this.snapshot(created),
        true,
      );
      await this.recordEvidence(
        workspaceId,
        ownerId,
        `Runtime session established: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_SESSION_CREATED',
        'RuntimeSession',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listSessions(workspaceId: string, query?: RuntimeListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = (RUNTIME_SORT_FIELDS as readonly string[]).includes(query?.sortBy as string)
      ? (query?.sortBy as string)
      : 'createdAt';
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';
    const search = query?.search?.trim();

    const where: Prisma.RuntimeSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.state && { state: query.state }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.runtimeSession.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.RuntimeSessionOrderByWithRelationInput,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.runtimeSession.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getSession(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [states, contexts, checkpoints, recoveries, history] = await Promise.all([
      this.prisma.runtimeState.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.runtimeContext.findMany({
        where: { sessionId: session.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.runtimeCheckpoint.findMany({
        where: { sessionId: session.id, deletedAt: null },
        orderBy: { sequence: 'desc' },
        take: 50,
      }),
      this.prisma.runtimeRecovery.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.runtimeHistory.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { ...session, states, contexts, checkpoints, recoveries, history };
  }

  async updateSession(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateRuntimeSessionDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadSessionOrThrow(id, workspaceId);
    try {
      const updated = await this.prisma.runtimeSession.update({
        where: { id: before.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.authority !== undefined && { authority: dto.authority }),
          ...(dto.metadata !== undefined && {
            metadata: dto.metadata as Prisma.InputJsonValue,
          }),
        },
      });
      await this.recordAudit(
        'RUNTIME_SESSION_UPDATED',
        'RuntimeSession',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(updated),
        true,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_SESSION_UPDATED',
        'RuntimeSession',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async removeSession(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const before = await this.loadSessionOrThrow(id, workspaceId);
    try {
      const removed = await this.prisma.runtimeSession.update({
        where: { id: before.id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      });
      await this.recordAudit(
        'RUNTIME_SESSION_ARCHIVED',
        'RuntimeSession',
        removed.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(removed),
        true,
      );
      return { id: removed.id, status: removed.status, deletedAt: removed.deletedAt };
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_SESSION_ARCHIVED',
        'RuntimeSession',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Part B — State machine
  // ----------------------------------------------------------------------

  async transitionState(
    id: string,
    workspaceId: string,
    userId: string,
    dto: TransitionRuntimeStateDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadSessionOrThrow(id, workspaceId);
    try {
      if (!RUNTIME_SESSION_STATES.includes(dto.state)) {
        throw new BadRequestException('target state is invalid');
      }
      if (!isValidRuntimeTransition(before.state, dto.state)) {
        throw new BadRequestException(`Invalid runtime transition ${before.state} -> ${dto.state}`);
      }
      const now = new Date();
      const updated = await this.prisma.$transaction(async (tx) => {
        const seq = before.eventSeq + 1;
        const nextHealth = computeRuntimeHealth({
          state: dto.state,
          recoveryCount: before.recoveryCount,
          lastHeartbeatAt: before.lastHeartbeatAt,
          now,
        });
        const session = await tx.runtimeSession.update({
          where: { id: before.id },
          data: {
            previousState: before.state,
            state: dto.state,
            healthStatus: nextHealth,
            stateEnteredAt: now,
            eventSeq: seq,
          },
        });
        await tx.runtimeState.create({
          data: {
            sessionId: before.id,
            fromState: before.state,
            toState: dto.state,
            reason: dto.reason?.trim() || `Transition to ${dto.state}`,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.emitEvent(
          tx,
          before,
          seq,
          'STATE_TRANSITION',
          dto.state,
          ctx?.actorId ?? userId,
          `Transition ${before.state} -> ${dto.state}`,
        );
        await this.writeHistory(tx, before, 'STATE_TRANSITION', ctx?.actorId ?? userId, {
          fromState: before.state,
          toState: dto.state,
          healthStatus: nextHealth,
          notes: dto.reason?.trim() || null,
        });
        return session;
      });

      await this.recordAudit(
        'RUNTIME_STATE_TRANSITIONED',
        'RuntimeSession',
        before.id,
        ctx,
        workspaceId,
        userId,
        { state: before.state },
        { state: updated.state, healthStatus: updated.healthStatus },
        true,
        { fromState: before.state, toState: updated.state },
      );
      await this.recordEvidence(
        workspaceId,
        before.ownerId,
        `Runtime ${before.name} transitioned ${before.state} -> ${updated.state}`,
        ctx,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_STATE_TRANSITIONED',
        'RuntimeSession',
        before.id,
        ctx,
        workspaceId,
        userId,
        { state: before.state },
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Part C — Runtime objects (contexts)
  // ----------------------------------------------------------------------

  async attachContext(
    id: string,
    workspaceId: string,
    userId: string,
    dto: AttachRuntimeContextDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      if (!dto.key?.trim()) {
        throw new BadRequestException('key is required');
      }
      const existing = await this.prisma.runtimeContext.findFirst({
        where: {
          sessionId: session.id,
          contextType: dto.contextType,
          key: dto.key.trim(),
          deletedAt: null,
        },
        orderBy: { version: 'desc' },
      });
      const created = await this.prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.runtimeContext.update({
            where: { id: existing.id },
            data: { active: false },
          });
        }
        const context = await tx.runtimeContext.create({
          data: {
            sessionId: session.id,
            contextType: dto.contextType,
            key: dto.key.trim(),
            referenceId: dto.referenceId?.trim() || null,
            referenceType: dto.referenceType?.trim() || null,
            payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
            version: existing ? existing.version + 1 : 1,
            active: true,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        const seq = session.eventSeq + 1;
        await tx.runtimeSession.update({
          where: { id: session.id },
          data: { eventSeq: seq },
        });
        await this.emitEvent(
          tx,
          session,
          seq,
          'CONTEXT_ATTACHED',
          session.state,
          ctx?.actorId ?? userId,
          `Context attached: ${dto.contextType}/${context.key}`,
          { contextId: context.id, referenceId: context.referenceId },
        );
        await this.writeHistory(tx, session, 'CONTEXT_ATTACHED', ctx?.actorId ?? userId, {
          referenceId: context.referenceId,
          notes: `Context ${dto.contextType}/${context.key} v${context.version}`,
        });
        return context;
      });

      await this.recordAudit(
        'RUNTIME_CONTEXT_ATTACHED',
        'RuntimeContext',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, contextType: created.contextType, key: created.key },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        session.ownerId,
        `Runtime context attached (${dto.contextType}) to ${session.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_CONTEXT_ATTACHED',
        'RuntimeContext',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listContexts(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const contexts = await this.prisma.runtimeContext.findMany({
      where: { sessionId: session.id, deletedAt: null },
      orderBy: [{ contextType: 'asc' }, { createdAt: 'desc' }],
    });
    return { sessionId: session.id, contexts };
  }

  // ----------------------------------------------------------------------
  // Events + history + continuity (Part E)
  // ----------------------------------------------------------------------

  async recordEvent(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RecordRuntimeEventDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const seq = session.eventSeq + 1;
        const isHeartbeat = dto.eventType === 'HEARTBEAT';
        await tx.runtimeSession.update({
          where: { id: session.id },
          data: {
            eventSeq: seq,
            ...(isHeartbeat && { lastHeartbeatAt: new Date() }),
          },
        });
        const event = await tx.runtimeEvent.create({
          data: {
            sessionId: session.id,
            eventType: dto.eventType,
            sequence: seq,
            state: session.state,
            description: dto.description?.trim() || null,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        return event;
      });
      await this.recordAudit(
        'RUNTIME_EVENT_RECORDED',
        'RuntimeEvent',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, eventType: created.eventType, sequence: created.sequence },
        true,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_EVENT_RECORDED',
        'RuntimeEvent',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listEvents(id: string, workspaceId: string, query?: RuntimeStreamQueryDto) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const limit = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    const events = await this.prisma.runtimeEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: 'desc' },
      take: limit,
    });
    return { sessionId: session.id, events };
  }

  async history(id: string, workspaceId: string, query?: RuntimeStreamQueryDto) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const limit = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    const events = await this.prisma.runtimeHistory.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { sessionId: session.id, events };
  }

  async continuity(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const lineageRoot = session.lineageRoot ?? session.sessionId;
    const [lineage, stateHistory, recoveries] = await Promise.all([
      this.prisma.runtimeSession.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [{ lineageRoot }, { sessionId: lineageRoot }],
        },
        orderBy: { continuitySeq: 'asc' },
        select: {
          id: true,
          sessionId: true,
          name: true,
          state: true,
          continuitySeq: true,
          parentSessionId: true,
          createdAt: true,
        },
      }),
      this.prisma.runtimeState.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.runtimeRecovery.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      sessionId: session.id,
      lineageRoot,
      continuitySeq: session.continuitySeq,
      recoveryCount: session.recoveryCount,
      lineage,
      stateHistory,
      recoveries,
    };
  }

  // ----------------------------------------------------------------------
  // Part D — Recovery engine + checkpoints/snapshots
  // ----------------------------------------------------------------------

  async createCheckpoint(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CreateRuntimeCheckpointDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      if (!dto.label?.trim()) {
        throw new BadRequestException('label is required');
      }
      if (!canCheckpointRuntimeState(session.state)) {
        throw new BadRequestException(`Cannot checkpoint a session in state ${session.state}`);
      }
      const contexts = await this.prisma.runtimeContext.findMany({
        where: { sessionId: session.id, deletedAt: null, active: true },
      });
      const created = await this.prisma.$transaction(async (tx) => {
        const sequence =
          (await tx.runtimeCheckpoint.count({ where: { sessionId: session.id } })) + 1;
        const checkpoint = await tx.runtimeCheckpoint.create({
          data: {
            sessionId: session.id,
            checkpointType: dto.checkpointType ?? 'MANUAL',
            label: dto.label.trim(),
            sequence,
            capturedState: session.state,
            healthStatus: session.healthStatus,
            contextSnapshot: {
              contexts: contexts.map((context) => ({
                contextType: context.contextType,
                key: context.key,
                referenceId: context.referenceId,
                referenceType: context.referenceType,
                payload: context.payload,
                version: context.version,
              })),
            } as Prisma.InputJsonValue,
            contextCount: contexts.length,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        const seq = session.eventSeq + 1;
        await tx.runtimeSession.update({
          where: { id: session.id },
          data: { eventSeq: seq, lastCheckpointId: checkpoint.id },
        });
        await this.emitEvent(
          tx,
          session,
          seq,
          'CHECKPOINT_CREATED',
          session.state,
          ctx?.actorId ?? userId,
          `Checkpoint created: ${checkpoint.label}`,
          { checkpointId: checkpoint.id, contextCount: contexts.length },
        );
        await this.writeHistory(tx, session, 'CHECKPOINT_CREATED', ctx?.actorId ?? userId, {
          toState: session.state,
          referenceId: checkpoint.id,
          notes: `Checkpoint ${checkpoint.label} (${contexts.length} contexts)`,
        });
        return checkpoint;
      });

      await this.recordAudit(
        'RUNTIME_CHECKPOINT_CREATED',
        'RuntimeCheckpoint',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, label: created.label, capturedState: created.capturedState },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        session.ownerId,
        `Runtime checkpoint captured for ${session.name}: ${created.label}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_CHECKPOINT_CREATED',
        'RuntimeCheckpoint',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listCheckpoints(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const checkpoints = await this.prisma.runtimeCheckpoint.findMany({
      where: { sessionId: session.id, deletedAt: null },
      orderBy: { sequence: 'desc' },
    });
    return { sessionId: session.id, checkpoints };
  }

  async createSnapshot(
    id: string,
    workspaceId: string,
    userId: string,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      const contexts = await this.prisma.runtimeContext.findMany({
        where: { sessionId: session.id, deletedAt: null, active: true },
      });
      const created = await this.prisma.$transaction(async (tx) => {
        const snapshot = await tx.runtimeSnapshot.create({
          data: {
            sessionId: session.id,
            checkpointId: session.lastCheckpointId,
            label: `Snapshot @ ${session.state}`,
            state: session.state,
            payload: {
              session: this.snapshot(session),
              contexts: contexts.map((context) => ({
                contextType: context.contextType,
                key: context.key,
                referenceId: context.referenceId,
                payload: context.payload,
                version: context.version,
              })),
            } as Prisma.InputJsonValue,
            contextCount: contexts.length,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        const seq = session.eventSeq + 1;
        await tx.runtimeSession.update({
          where: { id: session.id },
          data: { eventSeq: seq },
        });
        await this.emitEvent(
          tx,
          session,
          seq,
          'SNAPSHOT_CREATED',
          session.state,
          ctx?.actorId ?? userId,
          'Runtime snapshot captured',
          { snapshotId: snapshot.id },
        );
        await this.writeHistory(tx, session, 'SNAPSHOT_CREATED', ctx?.actorId ?? userId, {
          toState: session.state,
          referenceId: snapshot.id,
          notes: `Snapshot captured (${contexts.length} contexts)`,
        });
        return snapshot;
      });

      await this.recordAudit(
        'RUNTIME_SNAPSHOT_CREATED',
        'RuntimeSnapshot',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, state: created.state },
        true,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_SNAPSHOT_CREATED',
        'RuntimeSnapshot',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  /** Shared recovery execution used by recover(), restoreCheckpoint() and resume(). */
  private async executeRecovery(
    session: RuntimeSession,
    workspaceId: string,
    userId: string,
    dto: RecoverRuntimeDto,
    ctx?: MutationAuditContext,
  ) {
    if (!canInitiateRecovery(session.state, dto.recoveryType)) {
      throw new BadRequestException(`Cannot ${dto.recoveryType} from state ${session.state}`);
    }

    let checkpoint: RuntimeCheckpoint | null = null;
    if (dto.recoveryType === 'CHECKPOINT_RESTORE' || dto.recoveryType === 'RUNTIME_ROLLBACK') {
      if (!dto.checkpointId?.trim()) {
        throw new BadRequestException('checkpointId is required for this recovery type');
      }
      checkpoint = await this.prisma.runtimeCheckpoint.findFirst({
        where: { id: dto.checkpointId.trim(), sessionId: session.id, workspaceId, deletedAt: null },
      });
      if (!checkpoint) {
        throw new NotFoundException('Runtime checkpoint not found');
      }
    }

    const targetState = resolveRecoveryTargetState(dto.recoveryType, checkpoint?.capturedState);
    const routeThroughRecovering =
      session.state !== 'RECOVERING' && isValidRuntimeTransition(session.state, 'RECOVERING');

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      let seq = session.eventSeq;

      // 1. Enter RECOVERING (records a state edge + event).
      if (routeThroughRecovering) {
        seq += 1;
        await tx.runtimeState.create({
          data: {
            sessionId: session.id,
            fromState: session.state,
            toState: 'RECOVERING',
            reason: dto.reason?.trim() || `Recovery (${dto.recoveryType}) started`,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        await this.emitEvent(
          tx,
          session,
          seq,
          'RECOVERY_STARTED',
          'RECOVERING',
          ctx?.actorId ?? userId,
          `Recovery started: ${dto.recoveryType}`,
          { recoveryType: dto.recoveryType, checkpointId: checkpoint?.id },
        );
      }

      // 2. Restore contexts captured by the checkpoint (checkpoint restore / rollback).
      if (checkpoint) {
        const snapshotPayload = (checkpoint.contextSnapshot as { contexts?: any[] } | null) ?? {};
        const restoredContexts = Array.isArray(snapshotPayload.contexts)
          ? snapshotPayload.contexts
          : [];
        if (restoredContexts.length) {
          await tx.runtimeContext.updateMany({
            where: { sessionId: session.id, deletedAt: null, active: true },
            data: { active: false },
          });
          for (const restored of restoredContexts) {
            await tx.runtimeContext.create({
              data: {
                sessionId: session.id,
                contextType: restored.contextType,
                key: restored.key,
                referenceId: restored.referenceId ?? null,
                referenceType: restored.referenceType ?? null,
                payload: (restored.payload ?? {}) as Prisma.InputJsonValue,
                version: (restored.version ?? 1) + 1,
                active: true,
                actorId: ctx?.actorId ?? userId,
                workspaceId,
                metadata: { restoredFromCheckpoint: checkpoint.id } as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      // 3. Resolve to the target state.
      seq += 1;
      const nextHealth = computeRuntimeHealth({
        state: targetState,
        recoveryCount: session.recoveryCount + 1,
        lastHeartbeatAt: session.lastHeartbeatAt,
        now,
      });
      await tx.runtimeState.create({
        data: {
          sessionId: session.id,
          fromState: 'RECOVERING',
          toState: targetState,
          reason: `Recovery (${dto.recoveryType}) resolved`,
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
      await this.emitEvent(
        tx,
        session,
        seq,
        dto.recoveryType === 'RUNTIME_ROLLBACK' ? 'ROLLBACK' : 'RECOVERY_COMPLETED',
        targetState,
        ctx?.actorId ?? userId,
        `Recovery completed: ${dto.recoveryType} -> ${targetState}`,
        { recoveryType: dto.recoveryType },
      );

      const updatedSession = await tx.runtimeSession.update({
        where: { id: session.id },
        data: {
          previousState: session.state,
          state: targetState,
          healthStatus: nextHealth,
          recoveryCount: session.recoveryCount + 1,
          stateEnteredAt: now,
          eventSeq: seq,
          ...(checkpoint && { lastCheckpointId: checkpoint.id }),
        },
      });

      const recovery = await tx.runtimeRecovery.create({
        data: {
          sessionId: session.id,
          checkpointId: checkpoint?.id ?? null,
          recoveryType: dto.recoveryType,
          status: 'COMPLETED',
          fromState: session.state,
          toState: targetState,
          reason: dto.reason?.trim() || null,
          success: true,
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          completedAt: now,
        },
      });

      await this.writeHistory(
        tx,
        session,
        dto.recoveryType === 'RUNTIME_ROLLBACK' ? 'ROLLBACK' : 'RECOVERY',
        ctx?.actorId ?? userId,
        {
          fromState: session.state,
          toState: targetState,
          healthStatus: nextHealth,
          referenceId: recovery.id,
          notes: `Recovery ${dto.recoveryType} -> ${targetState}`,
        },
      );

      return { recovery, session: updatedSession };
    });

    await this.recordAudit(
      'RUNTIME_RECOVERED',
      'RuntimeSession',
      session.id,
      ctx,
      workspaceId,
      userId,
      { state: session.state, recoveryCount: session.recoveryCount },
      {
        state: result.session.state,
        recoveryCount: result.session.recoveryCount,
        recoveryType: dto.recoveryType,
      },
      true,
      { recoveryId: result.recovery.id },
    );
    await this.recordEvidence(
      workspaceId,
      session.ownerId,
      `Runtime ${session.name} recovered (${dto.recoveryType}) -> ${result.session.state}`,
      ctx,
    );
    return result;
  }

  async recover(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RecoverRuntimeDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      return await this.executeRecovery(session, workspaceId, userId, dto, ctx);
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_RECOVERED',
        'RuntimeSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        { state: session.state },
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async restoreCheckpoint(
    id: string,
    checkpointId: string,
    workspaceId: string,
    userId: string,
    dto: RestoreCheckpointDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      return await this.executeRecovery(
        session,
        workspaceId,
        userId,
        {
          recoveryType: 'CHECKPOINT_RESTORE',
          checkpointId,
          reason: dto.reason,
          metadata: dto.metadata,
        },
        ctx,
      );
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_RECOVERED',
        'RuntimeSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        { state: session.state },
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async resume(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RestoreCheckpointDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      return await this.executeRecovery(
        session,
        workspaceId,
        userId,
        { recoveryType: 'SESSION_RESUME', reason: dto.reason, metadata: dto.metadata },
        ctx,
      );
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_RECOVERED',
        'RuntimeSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        { state: session.state },
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async recoveryHistory(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const recoveries = await this.prisma.runtimeRecovery.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
    });
    return { sessionId: session.id, recoveries };
  }

  // ----------------------------------------------------------------------
  // Part F — Governance (policy + health) + dashboard
  // ----------------------------------------------------------------------

  async createPolicy(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CreateRuntimePolicyDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      if (!dto.policyType?.trim()) {
        throw new BadRequestException('policyType is required');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const policy = await tx.runtimePolicy.create({
          data: {
            sessionId: session.id,
            name: dto.name.trim(),
            policyType: dto.policyType.trim(),
            rules: (dto.rules ?? {}) as Prisma.InputJsonValue,
            enabled: dto.enabled ?? true,
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.writeHistory(tx, session, 'POLICY_SET', ctx?.actorId ?? userId, {
          referenceId: policy.id,
          notes: `Policy set: ${policy.name} (${policy.policyType})`,
        });
        return policy;
      });

      await this.recordAudit(
        'RUNTIME_POLICY_SET',
        'RuntimePolicy',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, name: created.name, policyType: created.policyType },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        session.ownerId,
        `Runtime policy set for ${session.name}: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'RUNTIME_POLICY_SET',
        'RuntimePolicy',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listPolicies(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const policies = await this.prisma.runtimePolicy.findMany({
      where: { sessionId: session.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { sessionId: session.id, policies };
  }

  async health(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const now = new Date();
    const healthStatus = this.computeSessionHealth(session, now);
    const heartbeatAgeMs = session.lastHeartbeatAt
      ? now.getTime() - new Date(session.lastHeartbeatAt).getTime()
      : null;
    const heartbeatStale =
      RUNTIME_ACTIVE_STATES.includes(session.state) &&
      heartbeatAgeMs !== null &&
      heartbeatAgeMs > RUNTIME_HEARTBEAT_STALE_MS;

    // Persist the computed health if it drifted from the stored value.
    if (healthStatus !== session.healthStatus) {
      await this.prisma.runtimeSession.update({
        where: { id: session.id },
        data: { healthStatus },
      });
      await this.prisma.runtimeHistory.create({
        data: {
          sessionId: session.id,
          eventType: 'HEALTH_CHECK',
          toState: session.state,
          healthStatus,
          actorId: session.ownerId,
          workspaceId,
          notes: `Health re-evaluated: ${session.healthStatus} -> ${healthStatus}`,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
    }

    return {
      sessionId: session.id,
      state: session.state,
      healthStatus,
      previousHealthStatus: session.healthStatus,
      recoveryCount: session.recoveryCount,
      lastHeartbeatAt: session.lastHeartbeatAt,
      heartbeatAgeMs,
      heartbeatStale,
      checks: {
        state: session.state,
        recoverable: !isTerminal(session.state),
        heartbeatStale,
        recoveryPressure: session.recoveryCount,
      },
    };
  }

  async dashboard(workspaceId: string) {
    const sessions = await this.prisma.runtimeSession.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const [totalCheckpoints, recoveries] = await Promise.all([
      this.prisma.runtimeCheckpoint.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.runtimeRecovery.findMany({ where: { workspaceId } }),
    ]);

    const byState = sessions.reduce<Record<string, number>>((acc, session) => {
      acc[session.state] = (acc[session.state] ?? 0) + 1;
      return acc;
    }, {});
    const byHealth = sessions.reduce<Record<string, number>>((acc, session) => {
      acc[session.healthStatus] = (acc[session.healthStatus] ?? 0) + 1;
      return acc;
    }, {});

    const activeSessions = sessions.filter((session) =>
      RUNTIME_ACTIVE_STATES.includes(session.state),
    ).length;
    const degradedSessions = sessions.filter(
      (session) => session.healthStatus === 'DEGRADED' || session.state === 'DEGRADED',
    ).length;
    const failedSessions = sessions.filter((session) => session.state === 'FAILED').length;
    const successfulRecoveries = recoveries.filter((recovery) => recovery.success).length;

    return {
      workspaceId,
      totalSessions: sessions.length,
      activeSessions,
      degradedSessions,
      failedSessions,
      totalCheckpoints,
      totalRecoveries: recoveries.length,
      successfulRecoveries,
      recoverySuccessRate: recoveries.length
        ? Math.round((successfulRecoveries / recoveries.length) * 1e4) / 1e4
        : 0,
      byState,
      byHealth,
      states: RUNTIME_SESSION_STATES,
      transitions: RUNTIME_STATE_TRANSITIONS,
    };
  }
}

function isTerminal(state: RuntimeSessionState): boolean {
  return state === 'ARCHIVED';
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorityLevel,
  ExchangeAuditOutcome,
  ExchangeEventType,
  ExchangeMessageType,
  ExchangeOwnershipClass,
  ExchangeSession,
  ExchangeStage,
  ExchangeTransaction,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  CreateExchangeDto,
  CreateExchangePolicyDto,
  CreateExchangeSessionDto,
  ExchangeListQueryDto,
  ExchangeStreamQueryDto,
  RecordExchangeMessageDto,
  ReplayExchangeDto,
  RollbackExchangeDto,
  SubmitExchangeDto,
  UpdateExchangeSessionDto,
  ValidateExchangeDto,
} from './dto/exchange.dto';
import {
  assertExchangeTransition,
  computeChecksum,
  computeTrustScore,
  deriveLineage,
  resolveOwnershipClass,
  resolveVerificationState,
  validateExchange,
  verifyChecksum,
  type ValidationCheck,
} from './exchange-engine';
import {
  EXCHANGE_OWNERSHIP_CLASSES,
  EXCHANGE_SORT_FIELDS,
  EXCHANGE_STAGE_TRANSITIONS,
  EXCHANGE_STAGES,
  isTerminalExchangeStage,
} from './exchange.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type ExchangeIds = { sessionId: string; transactionId: string | null; workspaceId: string };

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_STREAM_LIMIT = 50;
const MAX_STREAM_LIMIT = 200;

@Injectable()
export class ExchangeService {
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
    const session = await this.prisma.exchangeSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Exchange session not found');
    }
    return session;
  }

  private async loadTransactionOrThrow(id: string, workspaceId: string) {
    const transaction = await this.prisma.exchangeTransaction.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!transaction) {
      throw new NotFoundException('Exchange transaction not found');
    }
    return transaction;
  }

  private sessionSnapshot(session: ExchangeSession) {
    return {
      id: session.id,
      exchangeId: session.exchangeId,
      name: session.name,
      state: session.state,
      ownershipClass: session.ownershipClass,
      authority: session.authority,
      status: session.status,
      deletedAt: session.deletedAt,
    };
  }

  private transactionSnapshot(transaction: ExchangeTransaction) {
    return {
      id: transaction.id,
      transactionId: transaction.transactionId,
      intent: transaction.intent,
      stage: transaction.stage,
      status: transaction.status,
      ownershipClass: transaction.ownershipClass,
      trustScore: transaction.trustScore,
      verification: transaction.verification,
      validationState: transaction.validationState,
      integrityVerified: transaction.integrityVerified,
    };
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    ids: ExchangeIds,
    eventType: ExchangeEventType,
    actorId: string,
    data: {
      fromStage?: ExchangeStage | null;
      toStage?: ExchangeStage | null;
      referenceId?: string | null;
      notes?: string | null;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    await tx.exchangeHistory.create({
      data: {
        transactionId: ids.transactionId,
        sessionId: ids.sessionId,
        workspaceId: ids.workspaceId,
        eventType,
        fromStage: data.fromStage ?? undefined,
        toStage: data.toStage ?? undefined,
        referenceId: data.referenceId ?? null,
        notes: data.notes ?? null,
        actorId,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async writeMessage(
    tx: Prisma.TransactionClient,
    transaction: ExchangeTransaction,
    sequence: number,
    messageType: ExchangeMessageType,
    stage: ExchangeStage,
    actorId: string,
    body?: string,
    payload?: Record<string, unknown>,
  ) {
    await tx.exchangeMessage.create({
      data: {
        transactionId: transaction.id,
        sessionId: transaction.sessionId,
        workspaceId: transaction.workspaceId,
        messageType,
        sequence,
        stage,
        body: body ?? null,
        payload: (payload ?? {}) as Prisma.InputJsonValue,
        actorId,
        metadata: {} as Prisma.InputJsonValue,
      },
    });
  }

  // ----------------------------------------------------------------------
  // Exchange sessions (Part A)
  // ----------------------------------------------------------------------

  async createSession(
    workspaceId: string,
    userId: string,
    dto: CreateExchangeSessionDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      const ownerId = dto.ownerId?.trim() || userId;
      const ownershipClass = resolveOwnershipClass({
        requested: dto.ownershipClass,
        hasFounderAuthority: dto.authority === 'INSTITUTIONAL' || dto.authority === 'SOVEREIGN',
      });
      const created = await this.prisma.$transaction(async (tx) => {
        const session = await tx.exchangeSession.create({
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            workspaceId,
            ownerId,
            ownershipClass,
            state: 'OPEN',
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            eventSeq: 1,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.writeHistory(
          tx,
          { sessionId: session.id, transactionId: null, workspaceId },
          'SESSION_CREATED',
          ownerId,
          { notes: 'Exchange session created' },
        );
        return session;
      });

      await this.recordAudit(
        'EXCHANGE_SESSION_CREATED',
        'ExchangeSession',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        this.sessionSnapshot(created),
        true,
      );
      await this.recordEvidence(
        workspaceId,
        ownerId,
        `Exchange session established: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_SESSION_CREATED',
        'ExchangeSession',
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

  async listSessions(workspaceId: string, query?: ExchangeListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const search = query?.search?.trim();
    const where: Prisma.ExchangeSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.exchangeSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.exchangeSession.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getSession(id: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(id, workspaceId);
    const [transactions, policies, contexts] = await Promise.all([
      this.prisma.exchangeTransaction.findMany({
        where: { sessionId: session.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.exchangePolicy.findMany({
        where: { sessionId: session.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.exchangeContext.findMany({
        where: { sessionId: session.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { ...session, transactions, policies, contexts };
  }

  async updateSession(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateExchangeSessionDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadSessionOrThrow(id, workspaceId);
    try {
      const updated = await this.prisma.exchangeSession.update({
        where: { id: before.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.authority !== undefined && { authority: dto.authority }),
          ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
        },
      });
      await this.recordAudit(
        'EXCHANGE_SESSION_UPDATED',
        'ExchangeSession',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.sessionSnapshot(before),
        this.sessionSnapshot(updated),
        true,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_SESSION_UPDATED',
        'ExchangeSession',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.sessionSnapshot(before),
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
      const removed = await this.prisma.exchangeSession.update({
        where: { id: before.id },
        data: { deletedAt: new Date(), state: 'ARCHIVED', status: 'ARCHIVED' },
      });
      await this.recordAudit(
        'EXCHANGE_SESSION_ARCHIVED',
        'ExchangeSession',
        removed.id,
        ctx,
        workspaceId,
        userId,
        this.sessionSnapshot(before),
        this.sessionSnapshot(removed),
        true,
      );
      return { id: removed.id, state: removed.state, deletedAt: removed.deletedAt };
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_SESSION_ARCHIVED',
        'ExchangeSession',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.sessionSnapshot(before),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Exchange transactions (Part A/C/D/E) — create
  // ----------------------------------------------------------------------

  async createExchange(
    workspaceId: string,
    userId: string,
    dto: CreateExchangeDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.intent?.trim()) {
        throw new BadRequestException('intent is required');
      }
      if (!dto.payload || typeof dto.payload !== 'object') {
        throw new BadRequestException('payload is required');
      }
      const session = await this.loadSessionOrThrow(dto.sessionId, workspaceId);
      if (session.state === 'CLOSED' || session.state === 'ARCHIVED') {
        throw new BadRequestException(`Exchange session is ${session.state}`);
      }

      const ownershipClass = resolveOwnershipClass({
        requested: dto.ownershipClass ?? (session.ownershipClass as ExchangeOwnershipClass),
        hasFounderAuthority: dto.authority === 'INSTITUTIONAL' || dto.authority === 'SOVEREIGN',
      });
      const authority = dto.authority ?? AuthorityLevel.OPERATIONAL;
      const checksum = computeChecksum(dto.payload);
      const confidence = typeof dto.confidence === 'number' ? dto.confidence : 0;
      const traceable = dto.traceable ?? true;
      const initialTrust = computeTrustScore({
        authority,
        confidence,
        verification: 'UNVERIFIED',
        integrityVerified: false,
        hasProvenance: Boolean(dto.provenance?.trim()),
        traceable,
      });

      const created = await this.prisma.$transaction(async (tx) => {
        const seq = session.transactionSeq + 1;
        await tx.exchangeSession.update({
          where: { id: session.id },
          data: {
            transactionSeq: seq,
            state: session.state === 'OPEN' ? 'ACTIVE' : session.state,
          },
        });
        const transaction = await tx.exchangeTransaction.create({
          data: {
            sessionId: session.id,
            workspaceId,
            ownerId: session.ownerId,
            intent: dto.intent.trim(),
            description: dto.description?.trim() || null,
            stage: 'INTEND',
            status: 'PENDING',
            ownershipClass,
            origin: dto.origin?.trim() || null,
            destination: dto.destination?.trim() || null,
            parentTransactionId: dto.parentTransactionId?.trim() || null,
            sourceObjectId: dto.sourceObjectId?.trim() || null,
            sourceObjectType: dto.sourceObjectType?.trim() || null,
            targetObjectId: dto.targetObjectId?.trim() || null,
            targetObjectType: dto.targetObjectType?.trim() || null,
            authority,
            confidence,
            provenance: dto.provenance?.trim() || null,
            integrityHash: checksum,
            integrityVerified: false,
            traceable,
            trustScore: initialTrust,
            validationState: 'PENDING',
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        const ids: ExchangeIds = {
          sessionId: session.id,
          transactionId: transaction.id,
          workspaceId,
        };
        // Seal the payload into an integrity-protected envelope (Part A).
        const envelope = await tx.exchangeEnvelope.create({
          data: {
            transactionId: transaction.id,
            sessionId: session.id,
            workspaceId,
            payload: dto.payload as Prisma.InputJsonValue,
            checksum,
            sealed: true,
            ownershipClass,
            authority,
            actorId: session.ownerId,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        await this.writeMessage(
          tx,
          transaction,
          1,
          'REQUEST',
          'INTEND',
          session.ownerId,
          `Exchange intended: ${transaction.intent}`,
        );
        await this.writeHistory(tx, ids, 'TRANSACTION_CREATED', session.ownerId, {
          toStage: 'INTEND',
          referenceId: transaction.id,
          notes: `Exchange transaction created (${ownershipClass})`,
        });
        await this.writeHistory(tx, ids, 'ENVELOPE_SEALED', session.ownerId, {
          referenceId: envelope.id,
          notes: `Envelope sealed (checksum ${checksum.slice(0, 12)}…)`,
        });
        return transaction;
      });

      await this.recordAudit(
        'EXCHANGE_CREATED',
        'ExchangeTransaction',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        this.transactionSnapshot(created),
        true,
      );
      await this.recordEvidence(
        workspaceId,
        session.ownerId,
        `Exchange created: ${created.intent}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_CREATED',
        'ExchangeTransaction',
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

  async listExchanges(workspaceId: string, query?: ExchangeListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = (EXCHANGE_SORT_FIELDS as readonly string[]).includes(query?.sortBy as string)
      ? (query?.sortBy as string)
      : 'createdAt';
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';
    const search = query?.search?.trim();
    const where: Prisma.ExchangeTransactionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.stage && { stage: query.stage as ExchangeStage }),
      ...(query?.status && { status: query.status as Prisma.EnumExchangeTransactionStatusFilter }),
      ...(search && {
        OR: [
          { intent: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.exchangeTransaction.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.ExchangeTransactionOrderByWithRelationInput,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.exchangeTransaction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getExchange(id: string, workspaceId: string) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const [envelopes, messages, receipts, audits, lineages, history] = await Promise.all([
      this.prisma.exchangeEnvelope.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.exchangeMessage.findMany({
        where: { transactionId: transaction.id },
        orderBy: { sequence: 'asc' },
        take: 100,
      }),
      this.prisma.exchangeReceipt.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.exchangeAudit.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.exchangeLineage.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.exchangeHistory.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { ...transaction, envelopes, messages, receipts, audits, lineages, history };
  }

  async status(id: string, workspaceId: string) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    return {
      id: transaction.id,
      transactionId: transaction.transactionId,
      intent: transaction.intent,
      stage: transaction.stage,
      previousStage: transaction.previousStage,
      status: transaction.status,
      ownershipClass: transaction.ownershipClass,
      trustScore: transaction.trustScore,
      verification: transaction.verification,
      validationState: transaction.validationState,
      integrityVerified: transaction.integrityVerified,
      stageSeq: transaction.stageSeq,
      replayCount: transaction.replayCount,
      rolledBack: transaction.rolledBack,
      completedAt: transaction.completedAt,
      terminal: isTerminalExchangeStage(transaction.stage),
      pipeline: EXCHANGE_STAGES,
      transitions: EXCHANGE_STAGE_TRANSITIONS,
    };
  }

  async history(id: string, workspaceId: string, query?: ExchangeStreamQueryDto) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const limit = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    const events = await this.prisma.exchangeHistory.findMany({
      where: { transactionId: transaction.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { transactionId: transaction.id, events };
  }

  async lineage(id: string, workspaceId: string) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const [lineages, children] = await Promise.all([
      this.prisma.exchangeLineage.findMany({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.exchangeTransaction.findMany({
        where: { parentTransactionId: transaction.id, workspaceId, deletedAt: null },
        select: { id: true, transactionId: true, intent: true, stage: true, status: true },
      }),
    ]);
    return {
      transactionId: transaction.id,
      origin: transaction.origin,
      destination: transaction.destination,
      parentTransactionId: transaction.parentTransactionId,
      sourceObjectId: transaction.sourceObjectId,
      sourceObjectType: transaction.sourceObjectType,
      targetObjectId: transaction.targetObjectId,
      targetObjectType: transaction.targetObjectType,
      lineages,
      children,
    };
  }

  async auditTrail(id: string, workspaceId: string) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const audits = await this.prisma.exchangeAudit.findMany({
      where: { transactionId: transaction.id },
      orderBy: { createdAt: 'desc' },
    });
    return { transactionId: transaction.id, audits };
  }

  async listMessages(id: string, workspaceId: string) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const messages = await this.prisma.exchangeMessage.findMany({
      where: { transactionId: transaction.id },
      orderBy: { sequence: 'asc' },
    });
    return { transactionId: transaction.id, messages };
  }

  async listReceipts(id: string, workspaceId: string) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const receipts = await this.prisma.exchangeReceipt.findMany({
      where: { transactionId: transaction.id },
      orderBy: { createdAt: 'desc' },
    });
    return { transactionId: transaction.id, receipts };
  }

  async recordMessage(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RecordExchangeMessageDto,
    ctx?: MutationAuditContext,
  ) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    const created = await this.prisma.$transaction(async (tx) => {
      const seq = transaction.eventSeq + 1;
      await tx.exchangeTransaction.update({
        where: { id: transaction.id },
        data: { eventSeq: seq },
      });
      return tx.exchangeMessage.create({
        data: {
          transactionId: transaction.id,
          sessionId: transaction.sessionId,
          workspaceId,
          messageType: dto.messageType,
          sequence: seq,
          stage: transaction.stage,
          fromParty: dto.fromParty?.trim() || null,
          toParty: dto.toParty?.trim() || null,
          body: dto.body?.trim() || null,
          payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
          actorId: ctx?.actorId ?? userId,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    });
    await this.recordAudit(
      'EXCHANGE_MESSAGE_RECORDED',
      'ExchangeMessage',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, messageType: created.messageType, sequence: created.sequence },
      true,
    );
    return created;
  }

  // ----------------------------------------------------------------------
  // Part F — Validation engine
  // ----------------------------------------------------------------------

  private async loadPolicyViolations(
    sessionId: string,
    workspaceId: string,
    input: { ownershipClass: ExchangeOwnershipClass; trustScore: number },
  ): Promise<string[]> {
    const policies = await this.prisma.exchangePolicy.findMany({
      where: { sessionId, workspaceId, deletedAt: null, enabled: true },
    });
    const violations: string[] = [];
    for (const policy of policies) {
      const rules = (policy.rules as Record<string, unknown> | null) ?? {};
      if (policy.policyType.toUpperCase() === 'TRUST' && typeof rules.minTrust === 'number') {
        if (input.trustScore < (rules.minTrust as number)) {
          violations.push(`${policy.name}: trust ${input.trustScore} < ${rules.minTrust}`);
        }
      }
      if (policy.policyType.toUpperCase() === 'OWNERSHIP' && Array.isArray(rules.disallow)) {
        if ((rules.disallow as string[]).includes(input.ownershipClass)) {
          violations.push(`${policy.name}: ownership ${input.ownershipClass} disallowed`);
        }
      }
    }
    return violations;
  }

  private buildValidation(
    transaction: ExchangeTransaction,
    workspaceId: string,
    integrityVerified: boolean,
    trustScore: number,
    hasLineage: boolean,
    policyViolations: string[],
    hasPayload: boolean,
  ) {
    return validateExchange({
      ownershipClass: transaction.ownershipClass,
      authority: transaction.authority,
      actorWorkspaceId: workspaceId,
      transactionWorkspaceId: transaction.workspaceId,
      hasPayload,
      integrityVerified,
      hasLineage,
      trustScore,
      policyViolations,
    });
  }

  private async persistValidationAudits(
    tx: Prisma.TransactionClient,
    transaction: ExchangeTransaction,
    checks: ValidationCheck[],
    actorId: string,
    stage: ExchangeStage,
  ) {
    for (const check of checks) {
      await tx.exchangeAudit.create({
        data: {
          transactionId: transaction.id,
          sessionId: transaction.sessionId,
          workspaceId: transaction.workspaceId,
          dimension: check.dimension,
          outcome: check.outcome as ExchangeAuditOutcome,
          stage,
          detail: check.detail,
          score: check.score ?? null,
          actorId,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
    }
  }

  async validate(
    id: string,
    workspaceId: string,
    userId: string,
    _dto: ValidateExchangeDto,
    ctx?: MutationAuditContext,
  ) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    try {
      const envelope = await this.prisma.exchangeEnvelope.findFirst({
        where: { transactionId: transaction.id },
        orderBy: { createdAt: 'desc' },
      });
      const integrityVerified = envelope
        ? verifyChecksum(envelope.payload, envelope.checksum)
        : false;
      const trustScore = computeTrustScore({
        authority: transaction.authority,
        confidence: transaction.confidence,
        verification: transaction.verification,
        integrityVerified,
        hasProvenance: Boolean(transaction.provenance),
        traceable: transaction.traceable,
      });
      const lineageCount = await this.prisma.exchangeLineage.count({
        where: { transactionId: transaction.id },
      });
      const violations = await this.loadPolicyViolations(transaction.sessionId, workspaceId, {
        ownershipClass: transaction.ownershipClass,
        trustScore,
      });
      const result = this.buildValidation(
        transaction,
        workspaceId,
        integrityVerified,
        trustScore,
        lineageCount > 0,
        violations,
        Boolean(envelope),
      );

      await this.prisma.$transaction(async (tx) => {
        await this.persistValidationAudits(
          tx,
          transaction,
          result.checks,
          ctx?.actorId ?? userId,
          transaction.stage,
        );
        await tx.exchangeTransaction.update({
          where: { id: transaction.id },
          data: {
            validationState: result.passed ? 'PASSED' : 'FAILED',
            trustScore,
            integrityVerified,
          },
        });
        await this.writeHistory(
          tx,
          { sessionId: transaction.sessionId, transactionId: transaction.id, workspaceId },
          'VALIDATED',
          ctx?.actorId ?? userId,
          { notes: `Validation ${result.passed ? 'PASSED' : 'FAILED'}` },
        );
      });

      await this.recordAudit(
        'EXCHANGE_VALIDATED',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        null,
        { passed: result.passed, trustScore },
        true,
        { checks: result.checks.length },
      );
      return {
        transactionId: transaction.id,
        passed: result.passed,
        trustScore,
        checks: result.checks,
      };
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_VALIDATED',
        'ExchangeTransaction',
        transaction.id,
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

  // ----------------------------------------------------------------------
  // Part B — Pipeline execution (submit / replay)
  // ----------------------------------------------------------------------

  private async runPipeline(transaction: ExchangeTransaction, workspaceId: string, userId: string) {
    const actorId = userId;
    const envelope = await this.prisma.exchangeEnvelope.findFirst({
      where: { transactionId: transaction.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!envelope) {
      throw new BadRequestException('Exchange envelope missing; cannot run pipeline');
    }
    const integrityVerified = verifyChecksum(envelope.payload, envelope.checksum);
    const trustScore = computeTrustScore({
      authority: transaction.authority,
      confidence: transaction.confidence,
      verification: integrityVerified ? 'PENDING' : 'UNVERIFIED',
      integrityVerified,
      hasProvenance: Boolean(transaction.provenance),
      traceable: transaction.traceable,
    });
    const violations = await this.loadPolicyViolations(transaction.sessionId, workspaceId, {
      ownershipClass: transaction.ownershipClass,
      trustScore,
    });
    const validation = this.buildValidation(
      transaction,
      workspaceId,
      integrityVerified,
      trustScore,
      false, // lineage is recorded later in the pipeline
      violations,
      true,
    );

    const ids: ExchangeIds = {
      sessionId: transaction.sessionId,
      transactionId: transaction.id,
      workspaceId,
    };

    return this.prisma.$transaction(async (tx) => {
      let currentStage: ExchangeStage = transaction.stage;
      let stageSeq = transaction.stageSeq;
      let eventSeq = transaction.eventSeq;

      const advance = async (
        toStage: ExchangeStage,
        eventType: ExchangeEventType,
        notes: string,
        referenceId?: string,
      ) => {
        assertExchangeTransition(currentStage, toStage);
        stageSeq += 1;
        await this.writeHistory(tx, ids, 'STAGE_ADVANCED', actorId, {
          fromStage: currentStage,
          toStage,
          notes: `Stage ${currentStage} -> ${toStage}`,
        });
        await this.writeHistory(tx, ids, eventType, actorId, { toStage, referenceId, notes });
        currentStage = toStage;
      };

      const fail = async (reason: string) => {
        assertExchangeTransition(currentStage, 'FAILED');
        stageSeq += 1;
        await this.writeHistory(tx, ids, 'STAGE_ADVANCED', actorId, {
          fromStage: currentStage,
          toStage: 'FAILED',
          notes: `Stage ${currentStage} -> FAILED`,
        });
        await this.writeHistory(tx, ids, 'FAILED', actorId, { toStage: 'FAILED', notes: reason });
        currentStage = 'FAILED';
        return tx.exchangeTransaction.update({
          where: { id: transaction.id },
          data: {
            previousStage: transaction.stage,
            stage: 'FAILED',
            status: 'FAILED',
            validationState: 'FAILED',
            trustScore,
            integrityVerified,
            stageSeq,
            eventSeq,
          },
        });
      };

      // INTEND -> COMPREHEND
      await advance('COMPREHEND', 'MESSAGE_SENT', 'Intent comprehended');
      eventSeq += 1;
      await this.writeMessage(
        tx,
        transaction,
        eventSeq,
        'EVENT',
        'COMPREHEND',
        actorId,
        'Comprehension complete',
      );

      // COMPREHEND -> VALIDATE (run the validation engine + persist audits)
      await advance(
        'VALIDATE',
        'VALIDATED',
        `Validation ${validation.passed ? 'PASSED' : 'FAILED'}`,
      );
      await this.persistValidationAudits(tx, transaction, validation.checks, actorId, 'VALIDATE');
      if (!validation.passed) {
        const failedTxn = await fail('Constitutional validation failed');
        return {
          transaction: failedTxn,
          validation,
          trustScore,
          integrityVerified,
          failedStage: 'VALIDATE' as ExchangeStage,
        };
      }

      // VALIDATE -> TRANSFER (envelope already sealed at create)
      await advance('TRANSFER', 'TRANSFERRED', 'Sealed envelope transferred', envelope.id);
      eventSeq += 1;
      await this.writeMessage(
        tx,
        transaction,
        eventSeq,
        'EVENT',
        'TRANSFER',
        actorId,
        'Envelope transferred',
      );

      // TRANSFER -> VERIFY (verify integrity + issue receipt)
      const verification = resolveVerificationState(integrityVerified, trustScore);
      await advance('VERIFY', 'VERIFIED', `Verification ${verification}`);
      const receipt = await tx.exchangeReceipt.create({
        data: {
          transactionId: transaction.id,
          sessionId: transaction.sessionId,
          workspaceId,
          status: verification === 'REJECTED' ? 'REJECTED' : 'ISSUED',
          stage: 'VERIFY',
          trustScore,
          verification,
          issuedTo: transaction.destination,
          notes: `Receipt for ${transaction.intent}`,
          actorId,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
      await this.writeHistory(tx, ids, 'RECEIPT_ISSUED', actorId, {
        referenceId: receipt.id,
        notes: `Receipt issued (${verification})`,
      });

      // VERIFY -> LINEAGE (record lineage)
      const lineage = deriveLineage(
        {
          origin: transaction.origin,
          destination: transaction.destination,
          parentTransactionId: transaction.parentTransactionId,
          sourceObjectId: transaction.sourceObjectId,
          sourceObjectType: transaction.sourceObjectType,
          targetObjectId: transaction.targetObjectId,
          targetObjectType: transaction.targetObjectType,
        },
        transaction.id,
      );
      await advance('LINEAGE', 'LINEAGE_RECORDED', 'Lineage recorded');
      const lineageRow = await tx.exchangeLineage.create({
        data: {
          transactionId: transaction.id,
          sessionId: transaction.sessionId,
          workspaceId,
          origin: lineage.origin,
          destination: lineage.destination,
          parentTransactionId: lineage.parentTransactionId,
          sourceObjectId: transaction.sourceObjectId,
          sourceObjectType: transaction.sourceObjectType,
          targetObjectId: transaction.targetObjectId,
          targetObjectType: transaction.targetObjectType,
          executionChain: lineage.executionChain as Prisma.InputJsonValue,
          depth: lineage.depth,
          actorId,
          metadata: {} as Prisma.InputJsonValue,
        },
      });

      // LINEAGE -> MEASURE (record the trust measurement as an audit dimension)
      await advance('MEASURE', 'MEASURED', `Trust measured at ${trustScore}`, lineageRow.id);
      await tx.exchangeAudit.create({
        data: {
          transactionId: transaction.id,
          sessionId: transaction.sessionId,
          workspaceId,
          dimension: 'measure',
          outcome: 'PASS',
          stage: 'MEASURE',
          detail: `Composite trust score ${trustScore}`,
          score: trustScore,
          actorId,
          metadata: {} as Prisma.InputJsonValue,
        },
      });

      // MEASURE -> CAPITALIZE
      await advance('CAPITALIZE', 'CAPITALIZED', 'Exchange capitalized');

      // CAPITALIZE -> COMPLETE
      await advance('COMPLETE', 'COMPLETED', 'Exchange completed');

      const completed = await tx.exchangeTransaction.update({
        where: { id: transaction.id },
        data: {
          previousStage: 'CAPITALIZE',
          stage: 'COMPLETE',
          status: 'COMPLETED',
          validationState: 'PASSED',
          verification,
          integrityVerified,
          trustScore,
          stageSeq,
          eventSeq,
          completedAt: new Date(),
        },
      });

      return {
        transaction: completed,
        validation,
        trustScore,
        integrityVerified,
        failedStage: null,
      };
    });
  }

  async submitExchange(
    id: string,
    workspaceId: string,
    userId: string,
    _dto: SubmitExchangeDto,
    ctx?: MutationAuditContext,
  ) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    try {
      if (transaction.stage !== 'INTEND') {
        throw new BadRequestException(
          `Exchange can only be submitted from INTEND (current: ${transaction.stage})`,
        );
      }
      await this.prisma.exchangeTransaction.update({
        where: { id: transaction.id },
        data: { status: 'IN_PROGRESS' },
      });
      const result = await this.runPipeline(transaction, workspaceId, ctx?.actorId ?? userId);

      await this.recordAudit(
        'EXCHANGE_SUBMITTED',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        this.transactionSnapshot(transaction),
        this.transactionSnapshot(result.transaction),
        true,
        { finalStage: result.transaction.stage, passed: result.validation.passed },
      );
      await this.recordEvidence(
        workspaceId,
        transaction.ownerId,
        `Exchange ${transaction.intent} -> ${result.transaction.stage}`,
        ctx,
      );
      return {
        transaction: result.transaction,
        validation: result.validation,
        trustScore: result.trustScore,
      };
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_SUBMITTED',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        this.transactionSnapshot(transaction),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async replay(
    id: string,
    workspaceId: string,
    userId: string,
    _dto: ReplayExchangeDto,
    ctx?: MutationAuditContext,
  ) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    try {
      if (!isTerminalExchangeStage(transaction.stage)) {
        throw new BadRequestException('Only completed or failed exchanges can be replayed');
      }
      // Reset the pipeline to INTEND for a fresh, audited run.
      const reset = await this.prisma.$transaction(async (tx) => {
        await this.writeHistory(
          tx,
          { sessionId: transaction.sessionId, transactionId: transaction.id, workspaceId },
          'REPLAYED',
          ctx?.actorId ?? userId,
          { fromStage: transaction.stage, toStage: 'INTEND', notes: 'Exchange replay initiated' },
        );
        return tx.exchangeTransaction.update({
          where: { id: transaction.id },
          data: {
            previousStage: transaction.stage,
            stage: 'INTEND',
            status: 'REPLAYED',
            validationState: 'PENDING',
            verification: 'UNVERIFIED',
            replayCount: transaction.replayCount + 1,
            completedAt: null,
          },
        });
      });
      const result = await this.runPipeline(reset, workspaceId, ctx?.actorId ?? userId);

      await this.recordAudit(
        'EXCHANGE_REPLAYED',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        this.transactionSnapshot(transaction),
        this.transactionSnapshot(result.transaction),
        true,
        { replayCount: reset.replayCount, finalStage: result.transaction.stage },
      );
      await this.recordEvidence(
        workspaceId,
        transaction.ownerId,
        `Exchange replayed: ${transaction.intent}`,
        ctx,
      );
      return {
        transaction: result.transaction,
        validation: result.validation,
        trustScore: result.trustScore,
      };
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_REPLAYED',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        this.transactionSnapshot(transaction),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async rollback(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RollbackExchangeDto,
    ctx?: MutationAuditContext,
  ) {
    const transaction = await this.loadTransactionOrThrow(id, workspaceId);
    try {
      if (transaction.rolledBack) {
        throw new BadRequestException('Exchange has already been rolled back');
      }
      if (transaction.stage === 'INTEND') {
        throw new BadRequestException('Nothing to roll back before submission');
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        const ids: ExchangeIds = {
          sessionId: transaction.sessionId,
          transactionId: transaction.id,
          workspaceId,
        };
        const rolled = await tx.exchangeTransaction.update({
          where: { id: transaction.id },
          data: {
            previousStage: transaction.stage,
            status: 'ROLLED_BACK',
            rolledBack: true,
            verification: 'REJECTED',
          },
        });
        await tx.exchangeReceipt.create({
          data: {
            transactionId: transaction.id,
            sessionId: transaction.sessionId,
            workspaceId,
            status: 'REJECTED',
            stage: transaction.stage,
            trustScore: transaction.trustScore,
            verification: 'REJECTED',
            notes: dto.reason?.trim() || 'Exchange rolled back',
            actorId: ctx?.actorId ?? userId,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        await this.writeHistory(tx, ids, 'ROLLED_BACK', ctx?.actorId ?? userId, {
          fromStage: transaction.stage,
          notes: dto.reason?.trim() || 'Exchange rolled back',
        });
        return rolled;
      });

      await this.recordAudit(
        'EXCHANGE_ROLLED_BACK',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        this.transactionSnapshot(transaction),
        this.transactionSnapshot(updated),
        true,
      );
      await this.recordEvidence(
        workspaceId,
        transaction.ownerId,
        `Exchange rolled back: ${transaction.intent}`,
        ctx,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_ROLLED_BACK',
        'ExchangeTransaction',
        transaction.id,
        ctx,
        workspaceId,
        userId,
        this.transactionSnapshot(transaction),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Part G — Governance (policy) + dashboard
  // ----------------------------------------------------------------------

  async createPolicy(
    sessionId: string,
    workspaceId: string,
    userId: string,
    dto: CreateExchangePolicyDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      if (!dto.policyType?.trim()) {
        throw new BadRequestException('policyType is required');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const policy = await tx.exchangePolicy.create({
          data: {
            sessionId: session.id,
            workspaceId,
            name: dto.name.trim(),
            policyType: dto.policyType.trim(),
            rules: (dto.rules ?? {}) as Prisma.InputJsonValue,
            enabled: dto.enabled ?? true,
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            actorId: ctx?.actorId ?? userId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.writeHistory(
          tx,
          { sessionId: session.id, transactionId: null, workspaceId },
          'POLICY_SET',
          ctx?.actorId ?? userId,
          { referenceId: policy.id, notes: `Policy set: ${policy.name} (${policy.policyType})` },
        );
        return policy;
      });

      await this.recordAudit(
        'EXCHANGE_POLICY_SET',
        'ExchangePolicy',
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
        `Exchange policy set for ${session.name}: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'EXCHANGE_POLICY_SET',
        'ExchangePolicy',
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

  async listPolicies(sessionId: string, workspaceId: string) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    const policies = await this.prisma.exchangePolicy.findMany({
      where: { sessionId: session.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { sessionId: session.id, policies };
  }

  async dashboard(workspaceId: string) {
    const transactions = await this.prisma.exchangeTransaction.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const [totalSessions, totalReceipts, totalLineages] = await Promise.all([
      this.prisma.exchangeSession.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.exchangeReceipt.count({ where: { workspaceId } }),
      this.prisma.exchangeLineage.count({ where: { workspaceId } }),
    ]);

    const byStage = transactions.reduce<Record<string, number>>((acc, txn) => {
      acc[txn.stage] = (acc[txn.stage] ?? 0) + 1;
      return acc;
    }, {});
    const byStatus = transactions.reduce<Record<string, number>>((acc, txn) => {
      acc[txn.status] = (acc[txn.status] ?? 0) + 1;
      return acc;
    }, {});
    const byOwnership = transactions.reduce<Record<string, number>>((acc, txn) => {
      acc[txn.ownershipClass] = (acc[txn.ownershipClass] ?? 0) + 1;
      return acc;
    }, {});

    const completed = transactions.filter((txn) => txn.status === 'COMPLETED').length;
    const failed = transactions.filter(
      (txn) => txn.stage === 'FAILED' || txn.status === 'FAILED',
    ).length;
    const rolledBack = transactions.filter((txn) => txn.rolledBack).length;
    const trustScores = transactions.map((txn) => txn.trustScore);
    const averageTrust = trustScores.length
      ? Math.round(
          (trustScores.reduce((sum, value) => sum + value, 0) / trustScores.length) * 1e4,
        ) / 1e4
      : 0;

    return {
      workspaceId,
      totalSessions,
      totalTransactions: transactions.length,
      completedTransactions: completed,
      failedTransactions: failed,
      rolledBackTransactions: rolledBack,
      completionRate: transactions.length
        ? Math.round((completed / transactions.length) * 1e4) / 1e4
        : 0,
      averageTrust,
      totalReceipts,
      totalLineages,
      byStage,
      byStatus,
      byOwnership,
      stages: EXCHANGE_STAGES,
      ownershipClasses: EXCHANGE_OWNERSHIP_CLASSES,
      transitions: EXCHANGE_STAGE_TRANSITIONS,
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  CreatePolicyDto,
  CreateProtocolDto,
  CreateRuleDto,
  CreateSessionDto,
  ExecuteProtocolDto,
  InterpretDirectiveDto,
  ListQueryDto,
  OverrideDto,
  StreamQueryDto,
} from './dto/usfip.dto';
import { evaluateProtocol, interpretDirective, validateGovernance } from './usfip-engine';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  REUSED_RUNTIMES,
  USFIP_ACTIONS,
  USFIP_CONSTITUTIONAL_REF,
} from './usfip.constants';

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
export class UsfipService {
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
    await tx.uSFIPHistory.create({
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
    const session = await this.prisma.uSFIPSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('USFIP session not found');
    }
    return session;
  }

  private async loadProtocolOrThrow(id: string, workspaceId: string) {
    const protocol = await this.prisma.uSFIPProtocol.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!protocol) {
      throw new NotFoundException('USFIP protocol not found');
    }
    return protocol;
  }

  // ----------------------------------------------------------------------
  // Part A / B — session + interpretation
  // ----------------------------------------------------------------------

  async createSession(
    workspaceId: string,
    userId: string,
    dto: CreateSessionDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!dto.founderDirective?.trim()) {
      throw new BadRequestException('founderDirective is required');
    }
    const ownerId = dto.ownerId?.trim() || userId;
    const interpretation = interpretDirective({
      founderDirective: dto.founderDirective,
      strategicObjective: dto.strategicObjective,
      strategicPriority: dto.strategicPriority,
      strategicHorizon: dto.strategicHorizon,
      strategicOutcome: dto.strategicOutcome,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.uSFIPSession.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          workspaceId,
          ownerId,
          state: 'INTERPRETING',
          founderDirective: interpretation.founderDirective,
          strategicObjective: interpretation.strategicObjective,
          strategicContext: dto.strategicContext?.trim() || null,
          strategicConstraints: jsonify(dto.strategicConstraints),
          strategicPriority: interpretation.strategicPriority,
          strategicHorizon: interpretation.strategicHorizon,
          strategicOutcome: interpretation.strategicOutcome,
          intentReferenceId: dto.intentReferenceId?.trim() || null,
          intentReferenceType: dto.intentReferenceId ? 'FounderIntent' : null,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.uSFIPEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'STRATEGIC_INTERPRETATION',
          summary: interpretation.strategicOutcome,
          payload: jsonify(interpretation),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'SESSION_CREATED',
        userId,
        { constitutionalRef: interpretation.constitutionalRef, notes: session.name },
      );
      return session;
    });

    await this.recordAudit(
      USFIP_ACTIONS.CREATE_SESSION,
      'USFIPSession',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, state: created.state, priority: created.strategicPriority },
      true,
    );
    await this.recordEvidence(workspaceId, ownerId, `usfip:session:create:${created.id}`, ctx);
    return created;
  }

  async interpret(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: InterpretDirectiveDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    if (session.overridden) {
      throw new BadRequestException('Session is under an immutable founder override');
    }
    const interpretation = interpretDirective({
      founderDirective: dto.founderDirective?.trim() || session.founderDirective || session.name,
      strategicObjective: dto.strategicObjective ?? session.strategicObjective,
      strategicPriority: dto.strategicPriority ?? session.strategicPriority,
      strategicHorizon: dto.strategicHorizon ?? session.strategicHorizon,
      strategicOutcome: dto.strategicOutcome ?? session.strategicOutcome,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.uSFIPSession.update({
        where: { id: session.id },
        data: {
          state: 'INTERPRETING',
          founderDirective: interpretation.founderDirective,
          strategicObjective: interpretation.strategicObjective,
          strategicPriority: interpretation.strategicPriority,
          strategicHorizon: interpretation.strategicHorizon,
          strategicOutcome: interpretation.strategicOutcome,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'DIRECTIVE_INTERPRETED',
        userId,
        { constitutionalRef: interpretation.constitutionalRef },
      );
      return next;
    });

    await this.recordAudit(
      USFIP_ACTIONS.INTERPRET,
      'USFIPSession',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { objective: session.strategicObjective },
      { objective: updated.strategicObjective, priority: updated.strategicPriority },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `usfip:interpret:${session.id}`, ctx);
    return { session: updated, interpretation };
  }

  async listSessions(workspaceId: string, query: ListQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.USFIPSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.uSFIPSession.findMany({
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
    const [protocols, executions] = await Promise.all([
      this.prisma.uSFIPProtocol.findMany({
        where: { sessionId: id, workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.uSFIPExecution.findMany({
        where: { sessionId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    return { session, protocols, executions };
  }

  // ----------------------------------------------------------------------
  // Part A / C — protocol, rules, policies
  // ----------------------------------------------------------------------

  async createProtocol(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: CreateProtocolDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadSessionOrThrow(sessionId, workspaceId);
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }

    const protocol = await this.prisma.$transaction(async (tx) => {
      const created = await tx.uSFIPProtocol.create({
        data: {
          sessionId: session.id,
          workspaceId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: 'DRAFT',
          strategicPriority: dto.strategicPriority ?? session.strategicPriority,
          strategicHorizon: dto.strategicHorizon ?? session.strategicHorizon,
          constitutionalRef: USFIP_CONSTITUTIONAL_REF.PROTOCOL,
          definition: jsonify(dto.definition),
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'PROTOCOL_CREATED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'USFIPProtocol',
          constitutionalRef: USFIP_CONSTITUTIONAL_REF.PROTOCOL,
        },
      );
      return created;
    });

    await this.recordAudit(
      USFIP_ACTIONS.CREATE_PROTOCOL,
      'USFIPProtocol',
      protocol.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: protocol.id, status: protocol.status },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `usfip:protocol:${protocol.id}`, ctx);
    return protocol;
  }

  async activateProtocol(
    workspaceId: string,
    userId: string,
    protocolId: string,
    ctx?: MutationAuditContext,
  ) {
    const protocol = await this.loadProtocolOrThrow(protocolId, workspaceId);
    if (protocol.status === 'ACTIVE') {
      throw new BadRequestException('Protocol is already active');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.uSFIPProtocol.update({
        where: { id: protocol.id },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      });
      await this.writeHistory(
        tx,
        { sessionId: protocol.sessionId, workspaceId },
        'PROTOCOL_ACTIVATED',
        userId,
        { referenceId: protocol.id, referenceType: 'USFIPProtocol' },
      );
      return next;
    });

    await this.recordAudit(
      USFIP_ACTIONS.ACTIVATE_PROTOCOL,
      'USFIPProtocol',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: protocol.status },
      { status: 'ACTIVE' },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `usfip:protocol:activate:${updated.id}`, ctx);
    return updated;
  }

  async createRule(
    workspaceId: string,
    userId: string,
    protocolId: string,
    dto: CreateRuleDto,
    ctx?: MutationAuditContext,
  ) {
    const protocol = await this.loadProtocolOrThrow(protocolId, workspaceId);
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const rule = await this.prisma.uSFIPRule.create({
      data: {
        protocolId: protocol.id,
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        ordering: dto.ordering ?? 0,
        weight: dto.weight ?? 0.5,
        condition: dto.condition?.trim() || null,
        action: dto.action?.trim() || null,
        constitutionalRef: USFIP_CONSTITUTIONAL_REF.RULE,
        definition: jsonify(dto.definition),
        actorId: userId,
      },
    });
    await this.recordAudit(
      USFIP_ACTIONS.CREATE_RULE,
      'USFIPRule',
      rule.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: rule.id, ordering: rule.ordering },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `usfip:rule:${rule.id}`, ctx);
    return rule;
  }

  async createPolicy(
    workspaceId: string,
    userId: string,
    protocolId: string,
    dto: CreatePolicyDto,
    ctx?: MutationAuditContext,
  ) {
    const protocol = await this.loadProtocolOrThrow(protocolId, workspaceId);
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const policy = await this.prisma.uSFIPPolicy.create({
      data: {
        protocolId: protocol.id,
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority ?? 0,
        strategicPriority: dto.strategicPriority ?? 'MEDIUM',
        constitutionalRef: USFIP_CONSTITUTIONAL_REF.POLICY,
        rules: jsonify(dto.rules),
        actorId: userId,
      },
    });
    await this.recordAudit(
      USFIP_ACTIONS.CREATE_POLICY,
      'USFIPPolicy',
      policy.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: policy.id, priority: policy.priority },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `usfip:policy:${policy.id}`, ctx);
    return policy;
  }

  async listProtocolComponents(workspaceId: string, protocolId: string) {
    const protocol = await this.loadProtocolOrThrow(protocolId, workspaceId);
    const [rules, policies] = await Promise.all([
      this.prisma.uSFIPRule.findMany({
        where: { protocolId: protocol.id, workspaceId, deletedAt: null },
        orderBy: { ordering: 'asc' },
      }),
      this.prisma.uSFIPPolicy.findMany({
        where: { protocolId: protocol.id, workspaceId, deletedAt: null },
        orderBy: { priority: 'desc' },
      }),
    ]);
    return { protocol, rules, policies };
  }

  // ----------------------------------------------------------------------
  // Part C / D — protocol validation + execution
  // ----------------------------------------------------------------------

  private async gatherProtocolComponents(protocolId: string, workspaceId: string) {
    const [rules, policies] = await Promise.all([
      this.prisma.uSFIPRule.findMany({
        where: { protocolId, workspaceId, deletedAt: null },
      }),
      this.prisma.uSFIPPolicy.findMany({
        where: { protocolId, workspaceId, deletedAt: null },
      }),
    ]);
    return { rules, policies };
  }

  async validateProtocol(workspaceId: string, protocolId: string) {
    const protocol = await this.loadProtocolOrThrow(protocolId, workspaceId);
    const session = await this.loadSessionOrThrow(protocol.sessionId, workspaceId);
    const { rules, policies } = await this.gatherProtocolComponents(protocol.id, workspaceId);
    const validation = validateGovernance({
      founderDirective: session.founderDirective,
      overridden: session.overridden,
      activeRuleCount: rules.filter((r) => r.status === 'ACTIVE').length,
      activePolicyCount: policies.filter((p) => p.status === 'ACTIVE').length,
    });
    return { protocol: { id: protocol.id, status: protocol.status }, validation };
  }

  async executeProtocol(
    workspaceId: string,
    userId: string,
    protocolId: string,
    dto: ExecuteProtocolDto,
    ctx?: MutationAuditContext,
  ) {
    const protocol = await this.loadProtocolOrThrow(protocolId, workspaceId);
    const session = await this.loadSessionOrThrow(protocol.sessionId, workspaceId);
    if (session.overridden) {
      throw new BadRequestException('Session is under an immutable founder override');
    }
    const { rules, policies } = await this.gatherProtocolComponents(protocol.id, workspaceId);
    const governance = validateGovernance({
      founderDirective: session.founderDirective,
      overridden: session.overridden,
      activeRuleCount: rules.filter((r) => r.status === 'ACTIVE').length,
      activePolicyCount: policies.filter((p) => p.status === 'ACTIVE').length,
    });
    if (!governance.valid) {
      throw new BadRequestException(
        `Constitutional governance rejected execution: ${governance.issues.join('; ')}`,
      );
    }

    const priority = dto.strategicPriority ?? protocol.strategicPriority;
    const horizon = dto.strategicHorizon ?? protocol.strategicHorizon;
    const evaluation = evaluateProtocol({
      priority,
      horizon,
      rules: rules.map((r) => ({
        id: r.id,
        status: r.status,
        ordering: r.ordering,
        weight: r.weight,
      })),
      policies: policies.map((p) => ({
        id: p.id,
        status: p.status,
        priority: p.priority,
        strategicPriority: p.strategicPriority,
      })),
    });

    const execution = await this.prisma.$transaction(async (tx) => {
      const created = await tx.uSFIPExecution.create({
        data: {
          sessionId: session.id,
          protocolId: protocol.id,
          workspaceId,
          status: 'COMPLETED',
          selectedPolicyId: evaluation.selectedPolicyId,
          selectedRuleIds: jsonify(evaluation.selectedRuleIds),
          executionPath: jsonify(evaluation.executionPath),
          strategicPriority: priority,
          strategicHorizon: horizon,
          outcome: session.strategicOutcome,
          reason: evaluation.reason,
          constitutionalRef: evaluation.constitutionalRef,
          score: evaluation.score,
          actorId: userId,
          startedAt: new Date(),
          completedAt: new Date(),
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.uSFIPSession.update({
        where: { id: session.id },
        data: { state: 'EXECUTING', executionSeq: { increment: 1 } },
      });
      await tx.uSFIPEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'PROTOCOL_EXECUTION',
          referenceId: created.id,
          referenceType: 'USFIPExecution',
          summary: evaluation.reason,
          payload: jsonify(evaluation),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { sessionId: session.id, workspaceId },
        'PROTOCOL_EXECUTED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'USFIPExecution',
          constitutionalRef: evaluation.constitutionalRef,
          notes: `score=${evaluation.score.toFixed(3)}`,
        },
      );
      return created;
    });

    await this.recordAudit(
      USFIP_ACTIONS.EXECUTE,
      'USFIPExecution',
      execution.id,
      ctx,
      workspaceId,
      userId,
      null,
      {
        id: execution.id,
        selectedPolicyId: evaluation.selectedPolicyId,
        rules: evaluation.selectedRuleIds.length,
        score: evaluation.score,
      },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `usfip:execute:${execution.id}`, ctx);
    return { execution, evaluation };
  }

  // ----------------------------------------------------------------------
  // Part E — history + override
  // ----------------------------------------------------------------------

  async listHistory(workspaceId: string, sessionId: string, query: StreamQueryDto) {
    await this.loadSessionOrThrow(sessionId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.uSFIPHistory.findMany({
      where: { sessionId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

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

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.uSFIPSession.update({
        where: { id: session.id },
        data: { overridden: true, state: 'OVERRIDDEN' },
      });
      await tx.uSFIPEvidence.create({
        data: {
          sessionId: session.id,
          workspaceId,
          evidenceType: 'FOUNDER_OVERRIDE',
          summary: dto.directive.trim(),
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
            dto.constitutionalRef?.trim() || USFIP_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
          notes: dto.directive.trim(),
        },
      );
      return next;
    });

    await this.recordAudit(
      USFIP_ACTIONS.OVERRIDE,
      'USFIPSession',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { state: session.state },
      { state: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, session.ownerId, `usfip:override:${session.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [
      sessions,
      interpreting,
      executing,
      overridden,
      protocols,
      activeProtocols,
      rules,
      policies,
      executions,
    ] = await Promise.all([
      this.prisma.uSFIPSession.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.uSFIPSession.count({
        where: { workspaceId, deletedAt: null, state: 'INTERPRETING' },
      }),
      this.prisma.uSFIPSession.count({
        where: { workspaceId, deletedAt: null, state: 'EXECUTING' },
      }),
      this.prisma.uSFIPSession.count({
        where: { workspaceId, deletedAt: null, overridden: true },
      }),
      this.prisma.uSFIPProtocol.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.uSFIPProtocol.count({
        where: { workspaceId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.uSFIPRule.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.uSFIPPolicy.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.uSFIPExecution.count({ where: { workspaceId } }),
    ]);

    return {
      sessions: { total: sessions, interpreting, executing, overridden },
      protocols: { total: protocols, active: activeProtocols },
      rules,
      policies,
      executions,
      reusedRuntimes: REUSED_RUNTIMES,
    };
  }
}

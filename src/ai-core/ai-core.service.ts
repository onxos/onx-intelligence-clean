import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { SechRouterService } from '../sech/sech-router.service';
import { IurgService } from '../iurg/iurg.service';
import { AiRouterService } from './ai-router.service';
import { AI_EVIDENCE_TIER } from './ai-core.config';
import {
  AiChatDto,
  AiConsensusDto,
  AiQueryDto,
  AiQueryLogListDto,
  ClinicalDiagnosisDto,
  ClinicalProtocolDto,
} from './dto/ai-core.dto';
import {
  CLINICAL_SYSTEM_PROMPT,
  diagnosisPrompt,
  protocolPrompt,
} from './prompts/clinical.prompts';
import { AICompletionContext, AIMessage } from './ai-core.types';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type DeliveryStatus = 'approved' | 'rejected' | 'flagged';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * The constitutional AI orchestrator. Every model invocation is gated by the
 * SECH pre_execution FIC check BEFORE any response is delivered; REJECTED and
 * CONFLICT decisions return a counter-proposal or escalation instead of raw AI
 * output. Approved responses are evidence-tiered (AC-05), bound to their IURG
 * node, logged immutably, and audited.
 */
@Injectable()
export class AiCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly router: AiRouterService,
    private readonly sech: SechRouterService,
    @Optional() private readonly iurg?: IurgService,
  ) {}

  // ----------------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------------

  async query(workspaceId: string, userId: string, dto: AiQueryDto, ctx?: MutationAuditContext) {
    const domain = normalizeDomain(dto.domain);
    const gate = await this.runGate(workspaceId, userId, dto.query, domain, dto.signals, ctx);

    if (gate.status !== 'approved') {
      return this.persistBlocked(workspaceId, userId, dto.query, domain, gate);
    }

    const aiResponse = await this.router.route(
      dto.query,
      buildContext(dto.context, domain),
      dto.providerId,
    );
    return this.persistApproved(workspaceId, userId, dto.query, domain, gate, aiResponse);
  }

  async consensus(
    workspaceId: string,
    userId: string,
    dto: AiConsensusDto,
    ctx?: MutationAuditContext,
  ) {
    const domain = normalizeDomain(dto.domain);
    const gate = await this.runGate(workspaceId, userId, dto.query, domain, dto.signals, ctx);

    if (gate.status !== 'approved') {
      const blocked = await this.persistBlocked(workspaceId, userId, dto.query, domain, gate);
      return { ...blocked, consensus: null };
    }

    const consensus = await this.router.consensus(dto.query, buildContext(undefined, domain));
    const primary = consensus.responses[0];
    const log = await this.writeLog(workspaceId, userId, {
      query: dto.query,
      domain,
      providerUsed: consensus.agreed ? 'consensus' : (primary?.provider ?? 'none'),
      modelUsed: consensus.agreed
        ? `${consensus.agreementCount}/${consensus.totalConsulted}`
        : (primary?.model ?? 'none'),
      response: consensus.consensusContent ?? primary?.content ?? null,
      tokensUsed: consensus.responses.reduce((acc, r) => acc + r.tokensUsed, 0),
      latencyMs: consensus.responses.reduce((acc, r) => acc + r.latencyMs, 0),
      evidenceTier: consensus.evidenceTier,
      gate,
    });
    await this.recordAudit('AI_CONSENSUS_COMPLETED', log.queryId, workspaceId, userId, ctx, true);
    return { status: 'approved' as const, queryId: log.queryId, ...gate.refs, consensus };
  }

  async chat(workspaceId: string, userId: string, dto: AiChatDto, ctx?: MutationAuditContext) {
    const domain = normalizeDomain(dto.domain);
    const lastUser = [...dto.messages].reverse().find((m) => m.role === 'user');
    const gateText = lastUser?.content ?? dto.messages[dto.messages.length - 1]?.content ?? '';
    const gate = await this.runGate(workspaceId, userId, gateText, domain, dto.signals, ctx);

    if (gate.status !== 'approved') {
      return this.persistBlocked(workspaceId, userId, gateText, domain, gate);
    }

    const messages: AIMessage[] = dto.messages.map((m) => ({ role: m.role as "user" | "system" | "assistant", content: m.content }));
    const aiResponse = await this.router.chat(messages, buildContext(undefined, domain));
    return this.persistApproved(workspaceId, userId, gateText, domain, gate, aiResponse);
  }

  async clinicalDiagnosis(
    workspaceId: string,
    userId: string,
    dto: ClinicalDiagnosisDto,
    ctx?: MutationAuditContext,
  ) {
    const prompt = diagnosisPrompt(dto.symptoms, dto.history);
    return this.query(
      workspaceId,
      userId,
      {
        query: prompt,
        domain: 'clinical',
        signals: dto.signals,
        context: { system: CLINICAL_SYSTEM_PROMPT },
      },
      ctx,
    );
  }

  async clinicalProtocol(
    workspaceId: string,
    userId: string,
    dto: ClinicalProtocolDto,
    ctx?: MutationAuditContext,
  ) {
    const prompt = protocolPrompt(dto.condition, dto.context);
    return this.query(
      workspaceId,
      userId,
      {
        query: prompt,
        domain: 'clinical',
        signals: dto.signals,
        context: { system: CLINICAL_SYSTEM_PROMPT },
      },
      ctx,
    );
  }

  listProviders() {
    return this.router.listProviderInfo();
  }

  async providerStatus(name: string) {
    const status = await this.router.providerStatus(name);
    if (!status) {
      throw new NotFoundException(`Unknown provider: ${name}`);
    }
    return status;
  }

  async listLogs(workspaceId: string, query: AiQueryLogListDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
    const where: Prisma.AIQueryLogWhereInput = {
      workspaceId,
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.ficStatus ? { ficStatus: query.ficStatus } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.aIQueryLog.count({ where }),
      this.prisma.aIQueryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  // ----------------------------------------------------------------------
  // Internals
  // ----------------------------------------------------------------------

  private async runGate(
    workspaceId: string,
    userId: string,
    text: string,
    domain: string,
    signals: Record<string, boolean | number> | undefined,
    ctx?: MutationAuditContext,
  ) {
    const route = await this.sech.route(
      workspaceId,
      userId,
      {
        checkType: 'pre_execution',
        decisionContext: text.slice(0, 2000),
        domains: [domain],
        signals: signals ?? {},
      },
      ctx,
    );
    const status = mapRouteStatus(route.status);
    const gateResults = (route.gateResults ?? []) as Array<{
      checkType?: string;
      checkId?: string | null;
    }>;
    const preExecution = gateResults.find((g) => g.checkType === 'pre_execution');
    const ficCheckId =
      preExecution?.checkId ?? gateResults[gateResults.length - 1]?.checkId ?? null;

    let iurgNodeId: string | null = null;
    if (status === 'approved' && ficCheckId && this.iurg) {
      try {
        const node = await this.iurg.findNodeBySourceCheck(workspaceId, ficCheckId);
        iurgNodeId = node?.id ?? null;
      } catch {
        iurgNodeId = null;
      }
    }

    return {
      status,
      ficStatus: route.status as string,
      counterProposal: route.counterProposal as string | null,
      requiresHumanApproval: Boolean(route.requiresHumanApproval),
      refs: {
        ficStatus: route.status as string,
        ficCheckId,
        sechRouteId: route.id as string,
        iurgNodeId,
      },
    };
  }

  private async persistApproved(
    workspaceId: string,
    userId: string,
    query: string,
    domain: string,
    gate: Awaited<ReturnType<AiCoreService['runGate']>>,
    aiResponse: Awaited<ReturnType<AiRouterService['route']>>,
  ) {
    const log = await this.writeLog(workspaceId, userId, {
      query,
      domain,
      providerUsed: aiResponse.provider,
      modelUsed: aiResponse.model,
      response: aiResponse.content,
      tokensUsed: aiResponse.tokensUsed,
      latencyMs: aiResponse.latencyMs,
      evidenceTier: aiResponse.evidenceTier,
      gate,
    });
    await this.recordAudit('AI_QUERY_APPROVED', log.queryId, workspaceId, userId, undefined, true);
    return {
      status: 'approved' as const,
      queryId: log.queryId,
      response: aiResponse.content,
      provider: aiResponse.provider,
      model: aiResponse.model,
      evidenceTier: aiResponse.evidenceTier,
      tokensUsed: aiResponse.tokensUsed,
      latencyMs: aiResponse.latencyMs,
      mock: aiResponse.mock,
      ...gate.refs,
    };
  }

  private async persistBlocked(
    workspaceId: string,
    userId: string,
    query: string,
    domain: string,
    gate: Awaited<ReturnType<AiCoreService['runGate']>>,
  ) {
    const log = await this.writeLog(workspaceId, userId, {
      query,
      domain,
      providerUsed: 'none',
      modelUsed: 'none',
      response: gate.counterProposal ?? `Blocked by SECH pre_execution gate (${gate.ficStatus}).`,
      tokensUsed: 0,
      latencyMs: 0,
      evidenceTier: AI_EVIDENCE_TIER,
      gate,
    });
    await this.recordAudit(
      gate.status === 'flagged' ? 'AI_QUERY_FLAGGED' : 'AI_QUERY_REJECTED',
      log.queryId,
      workspaceId,
      userId,
      undefined,
      false,
    );
    return {
      status: gate.status,
      queryId: log.queryId,
      response: null,
      counterProposal:
        gate.counterProposal ?? `Blocked by SECH pre_execution gate (${gate.ficStatus}).`,
      requiresHumanApproval: gate.requiresHumanApproval,
      ...gate.refs,
    };
  }

  private async writeLog(
    workspaceId: string,
    userId: string,
    fields: {
      query: string;
      domain: string;
      providerUsed: string;
      modelUsed: string;
      response: string | null;
      tokensUsed: number;
      latencyMs: number;
      evidenceTier: string;
      gate: Awaited<ReturnType<AiCoreService['runGate']>>;
    },
  ) {
    return this.prisma.aIQueryLog.create({
      data: {
        queryId: randomUUID(),
        workspaceId,
        requesterId: userId,
        query: fields.query.slice(0, 8000),
        domain: fields.domain,
        providerUsed: fields.providerUsed,
        modelUsed: fields.modelUsed,
        response: fields.response,
        tokensUsed: fields.tokensUsed,
        latencyMs: fields.latencyMs,
        evidenceTier: fields.evidenceTier,
        ficStatus: fields.gate.ficStatus,
        ficCheckId: fields.gate.refs.ficCheckId,
        sechRouteId: fields.gate.refs.sechRouteId,
        iurgNodeId: fields.gate.refs.iurgNodeId,
      },
    });
  }

  private async recordAudit(
    action: string,
    queryId: string,
    workspaceId: string,
    userId: string,
    ctx: MutationAuditContext | undefined,
    success: boolean,
  ) {
    await this.audit.log({
      action,
      resourceType: 'AIQueryLog',
      resourceId: queryId,
      actorId: ctx?.actorId ?? userId,
      workspaceId,
      before: null,
      after: { queryId },
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      success,
    });
  }
}

function normalizeDomain(domain?: string): string {
  return domain?.trim().toLowerCase() || 'general';
}

function mapRouteStatus(routeStatus: string): DeliveryStatus {
  switch (routeStatus) {
    case 'APPROVED':
    case 'COMPLETED':
    case 'OVERRIDE':
      return 'approved';
    case 'CONFLICT':
      return 'flagged';
    case 'REJECTED':
    case 'FAILED':
    default:
      return 'rejected';
  }
}

function buildContext(
  raw: Record<string, unknown> | undefined,
  domain: string,
): AICompletionContext {
  const context: AICompletionContext = { domain };
  if (raw && typeof raw === 'object') {
    if (typeof raw.system === 'string') context.system = raw.system;
    if (typeof raw.temperature === 'number') context.temperature = raw.temperature;
    if (typeof raw.maxTokens === 'number') context.maxTokens = raw.maxTokens;
  }
  return context;
}

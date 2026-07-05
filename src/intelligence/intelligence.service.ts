import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { IntelligenceObjectType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { computeQualityIndices } from './intelligence-metrics.util';

type MutationAuditContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly objectTypes: IntelligenceObjectType[] = [
    'SIGNAL',
    'PATTERN',
    'JUDGMENT',
    'UNDERSTANDING',
    'WISDOM',
    'EXTERNAL_INTELLIGENCE',
  ];

  private canonicalizeQuestion(input: string) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private clamp01(value: number) {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  private validateCreateInput(data: {
    name: string;
    content: string;
    objectType: IntelligenceObjectType;
  }) {
    if (!data.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!data.content?.trim()) {
      throw new BadRequestException('content is required');
    }
    if (!this.objectTypes.includes(data.objectType)) {
      throw new BadRequestException('objectType is invalid');
    }
  }

  async create(
    data: {
      name: string;
      content: string;
      objectType: IntelligenceObjectType;
      layer?: string;
      originSource?: string;
      creatorIdentity?: string;
      ownershipClass?: string;
      amanahScore?: number;
      semanticSummary?: string;
      privacyLevel?: string;
      capitalCategory?: string;
      ownerId: string;
      creatorId: string;
      workspaceId: string;
    },
    auditContext?: MutationAuditContext,
  ) {
    try {
      this.validateCreateInput(data);

      const hash = crypto.createHash('sha256').update(data.content).digest('hex');

      const obj = await this.prisma.intelligenceObject.create({
        data: {
          name: data.name,
          content: data.content,
          contentHash: hash,
          objectType: data.objectType,
          semanticSummary: data.semanticSummary,
          layer: data.layer || 'L1_FOUNDATIONAL',
          originSource: data.originSource || 'L2_SIL',
          creatorIdentity: data.creatorIdentity || 'system',
          ownershipClass: (data.ownershipClass as any) || 'INSTITUTIONAL',
          privacyLevel: (data.privacyLevel as any) || 'INSTITUTIONAL',
          amanahScore: data.amanahScore ?? 0.5,
          capitalCategory: data.capitalCategory as any,
          ownerId: data.ownerId,
          creatorId: data.creatorId,
          workspaceId: data.workspaceId,
          sourceLayer: data.layer || 'L1_FOUNDATIONAL',
        },
      });

      await this.audit.log({
        action: 'INTELLIGENCE_CREATED',
        resourceType: 'IntelligenceObject',
        resourceId: obj.id,
        actorId: data.creatorId,
        workspaceId: data.workspaceId,
        before: null,
        after: {
          id: obj.id,
          name: obj.name,
          objectType: obj.objectType,
          state: obj.state,
        },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return obj;
    } catch (error: any) {
      await this.audit.log({
        action: 'INTELLIGENCE_CREATED',
        resourceType: 'IntelligenceObject',
        actorId: data.creatorId,
        workspaceId: data.workspaceId,
        before: null,
        after: null,
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }

  async findAll(
    workspaceId: string,
    actorId: string,
    filters?: {
      type?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
      limit?: number;
      offset?: number;
    },
  ) {
    const pageSize = Number(filters?.pageSize || filters?.limit || 50);
    const page = Number(filters?.page || 1);
    const offset = Number(filters?.offset ?? (page - 1) * pageSize);
    const sortBy = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'desc';
    const andFilters: Prisma.IntelligenceObjectWhereInput[] = [
      { OR: [{ ownerId: actorId }, { creatorId: actorId }] },
    ];

    if (filters?.search) {
      andFilters.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { content: { contains: filters.search, mode: 'insensitive' } },
          { semanticSummary: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    return this.prisma.intelligenceObject.findMany({
      where: {
        workspaceId,
        state: { not: 'ARCHIVED' },
        AND: andFilters,
        ...(filters?.type && { objectType: filters.type as IntelligenceObjectType }),
      },
      take: pageSize,
      skip: offset,
      orderBy: { [sortBy]: sortOrder } as any,
    });
  }

  async findOne(id: string, workspaceId: string, actorId: string) {
    const obj = await this.prisma.intelligenceObject.findFirst({
      where: {
        id,
        workspaceId,
        state: { not: 'ARCHIVED' },
        OR: [{ ownerId: actorId }, { creatorId: actorId }],
      },
    });
    if (!obj) throw new NotFoundException('Intelligence object not found');
    return obj;
  }

  async stats(workspaceId: string) {
    const all = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId, state: { not: 'ARCHIVED' } },
    });
    const byType: Record<string, number> = {};
    let totalCapital = 0;
    let reusableCount = 0;

    for (const obj of all) {
      byType[obj.objectType] = (byType[obj.objectType] || 0) + 1;
      totalCapital += obj.capitalValue;
      if (['PATTERN', 'JUDGMENT', 'UNDERSTANDING'].includes(obj.objectType)) {
        reusableCount++;
      }
    }

    return {
      total: all.length,
      byType,
      totalCapital,
      krr: all.length > 0 ? Math.round((reusableCount / all.length) * 10000) / 100 : 0,
    };
  }

  /** Real-time Intelligence Capital Index / Institutional Risk Score, computed live. */
  async qualityIndices(workspaceId: string) {
    const objects = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId, state: { not: 'ARCHIVED' } },
    });
    return computeQualityIndices(objects);
  }

  /** Recent autonomous-scheduler decisions (real ProvenanceRecord rows, not fabricated). */
  async governanceLog(workspaceId: string, limit = 50) {
    const events = await this.prisma.provenanceRecord.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return {
      total: events.length,
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        resource: e.resource,
        resourceId: e.resourceId,
        oldValue: e.oldValue,
        newValue: e.newValue,
        createdAt: e.createdAt,
      })),
    };
  }

  async answerFromKnowledge(workspaceId: string, userId: string, question: string) {
    if (!question?.trim()) {
      throw new BadRequestException('question is required');
    }

    const question_canonical = this.canonicalizeQuestion(question);
    const internal = await (this.prisma as any).aiKnowledgeAsset.findFirst({
      where: { workspace_id: workspaceId, question_canonical },
      orderBy: [{ confidence_score: 'desc' }, { created_at: 'desc' }],
    });

    const answer =
      internal?.answer ||
      'No internal knowledge answer was found. Fallback to external provider is required.';
    const source = internal ? 'internal_kb' : 'external_fallback';
    const confidence = internal?.confidence_score ?? 0.35;
    const amanah = internal?.constitutional_amanah ?? 0.4;

    const session = await (this.prisma as any).aiConversationSession.create({
      data: {
        session_id: crypto.randomUUID(),
        workspace_id: workspaceId,
        user_id: userId,
        question_canonical,
        answer,
        confidence_score: confidence,
        self_sufficiency_percent: internal ? 100 : 0,
        constitutional_amanah: amanah,
        provider_name: source,
        model_name: internal ? 'knowledge_asset' : 'external_unavailable',
      },
    });

    await (this.prisma as any).aiMessage.createMany({
      data: [
        {
          session_id: session.session_id,
          role: 'user',
          content: question,
          question_canonical,
          confidence_score: confidence,
          constitutional_amanah: amanah,
        },
        {
          session_id: session.session_id,
          role: 'assistant',
          content: answer,
          question_canonical,
          answer,
          confidence_score: confidence,
          constitutional_amanah: amanah,
        },
      ],
    });

    return {
      source,
      question_canonical,
      answer,
      confidence_score: confidence,
      session_id: session.session_id,
    };
  }

  async ingestKnowledgeAsset(
    workspaceId: string,
    userId: string,
    body: {
      question: string;
      answer: string;
      confidence_score?: number;
      constitutional_amanah?: number;
      asset_value_usd?: number;
      source?: string;
    },
  ) {
    if (!body?.question?.trim()) {
      throw new BadRequestException('question is required');
    }
    if (!body?.answer?.trim()) {
      throw new BadRequestException('answer is required');
    }

    const question_canonical = this.canonicalizeQuestion(body.question);
    const asset = await (this.prisma as any).aiKnowledgeAsset.create({
      data: {
        workspace_id: workspaceId,
        question_canonical,
        answer: body.answer,
        source: body.source || 'manual_ingest',
        confidence_score: this.clamp01(body.confidence_score ?? 0.8),
        constitutional_amanah: this.clamp01(body.constitutional_amanah ?? 0.85),
        asset_value_usd: Math.max(0, body.asset_value_usd ?? 0),
      },
    });

    await (this.prisma as any).aiDecisionLog.create({
      data: {
        workspace_id: workspaceId,
        decision_type: 'KNOWLEDGE_INGEST',
        question_canonical,
        answer: body.answer,
        confidence_score: asset.confidence_score,
        constitutional_amanah: asset.constitutional_amanah,
        rationale: `Asset ingested by ${userId}`,
      },
    });

    return asset;
  }

  async getSelfSufficiencyMetrics(workspaceId: string, days = 30) {
    const fromDate = new Date(Date.now() - Math.max(days, 1) * 24 * 60 * 60 * 1000);
    const sessions = await (this.prisma as any).aiConversationSession.findMany({
      where: { workspace_id: workspaceId, created_at: { gte: fromDate } },
      select: { provider_name: true },
    });

    const internal_answer_count = sessions.filter((s) => s.provider_name === 'internal_kb').length;
    const external_answer_count = sessions.length - internal_answer_count;
    const self_sufficiency_percent =
      sessions.length > 0 ? (internal_answer_count / sessions.length) * 100 : 0;

    const row = await (this.prisma as any).aiSelfSufficiencyMetric.create({
      data: {
        workspace_id: workspaceId,
        self_sufficiency_percent,
        internal_answer_count,
        external_answer_count,
        evaluation_window_days: Math.max(days, 1),
      },
    });

    return row;
  }

  async calculateKnowledgeValue(workspaceId: string) {
    const aggregates = await (this.prisma as any).aiKnowledgeAsset.aggregate({
      where: { workspace_id: workspaceId },
      _sum: { asset_value_usd: true },
      _avg: { asset_value_usd: true, constitutional_amanah: true },
      _count: { _all: true },
    });

    const row = await (this.prisma as any).aiKnowledgeValue.create({
      data: {
        workspace_id: workspaceId,
        total_corpus_value_usd: aggregates._sum.asset_value_usd ?? 0,
        valuation_method: 'sum_asset_value_usd',
        asset_count: aggregates._count._all,
        average_asset_value_usd: aggregates._avg.asset_value_usd ?? 0,
        constitutional_amanah: aggregates._avg.constitutional_amanah ?? 0.5,
      },
    });

    return row;
  }

  async runConstitutionalAudit(workspaceId: string) {
    const principles = [
      'amanah',
      'truthfulness',
      'justice',
      'non_maleficence',
      'privacy',
      'accountability',
      'self_sufficiency',
    ];

    const recent = await (this.prisma as any).aiConversationSession.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { constitutional_amanah: true, confidence_score: true },
    });

    const avgAmanah =
      recent.length > 0
        ? recent.reduce((sum, item) => sum + item.constitutional_amanah, 0) / recent.length
        : 0.5;
    const avgConfidence =
      recent.length > 0
        ? recent.reduce((sum, item) => sum + item.confidence_score, 0) / recent.length
        : 0.5;

    const seven_principles = principles.reduce<Record<string, number>>((acc, key) => {
      acc[key] = this.clamp01((avgAmanah + avgConfidence) / 2);
      return acc;
    }, {});

    const passed = Object.values(seven_principles).every((v) => v >= 0.7);

    return (this.prisma as any).aiConstitutionalAudit.create({
      data: {
        workspace_id: workspaceId,
        audit_scope: 'seven_principles',
        seven_principles,
        passed,
        confidence_score: avgConfidence,
        constitutional_amanah: avgAmanah,
        findings: {
          sample_size: recent.length,
          min_score_required: 0.7,
        },
      },
    });
  }

  async getProviderComparison(workspaceId: string) {
    const rows = await (this.prisma as any).aiProviderUsage.findMany({
      where: { workspace_id: workspaceId },
      orderBy: [{ total_cost_usd: 'asc' }, { avg_latency_ms: 'asc' }],
    });

    return {
      total_providers: rows.length,
      providers: rows.map((row) => ({
        provider_name: row.provider_name,
        model_name: row.model_name,
        request_count: row.request_count,
        total_cost_usd: row.total_cost_usd,
        avg_latency_ms: row.avg_latency_ms,
      })),
    };
  }

  async update(
    id: string,
    workspaceId: string,
    actorId: string,
    data: {
      name?: string;
      content?: string;
      objectType?: IntelligenceObjectType;
      semanticSummary?: string;
      state?: string;
      privacyLevel?: string;
      confidenceScore?: number;
      trustScore?: number;
      qualityIndex?: number;
    },
    auditContext?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      if (data.name !== undefined && !String(data.name).trim()) {
        throw new BadRequestException('name cannot be empty');
      }
      if (data.content !== undefined && !String(data.content).trim()) {
        throw new BadRequestException('content cannot be empty');
      }
      if (data.objectType !== undefined && !this.objectTypes.includes(data.objectType)) {
        throw new BadRequestException('objectType is invalid');
      }

      existing = await this.findOne(id, workspaceId, actorId);
      const contentHash =
        data.content !== undefined
          ? crypto.createHash('sha256').update(data.content).digest('hex')
          : existing.contentHash;

      const updated = await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.objectType !== undefined && { objectType: data.objectType }),
          ...(data.semanticSummary !== undefined && { semanticSummary: data.semanticSummary }),
          ...(data.state !== undefined && { state: data.state as any }),
          ...(data.privacyLevel !== undefined && { privacyLevel: data.privacyLevel as any }),
          ...(data.confidenceScore !== undefined && { confidenceScore: data.confidenceScore }),
          ...(data.trustScore !== undefined && { trustScore: data.trustScore }),
          ...(data.qualityIndex !== undefined && { qualityIndex: data.qualityIndex }),
          contentHash,
        },
      });

      await this.audit.log({
        action: 'INTELLIGENCE_UPDATED',
        resourceType: 'IntelligenceObject',
        resourceId: updated.id,
        actorId,
        workspaceId,
        before: {
          name: existing.name,
          objectType: existing.objectType,
          state: existing.state,
        },
        after: {
          name: updated.name,
          objectType: updated.objectType,
          state: updated.state,
        },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return updated;
    } catch (error: any) {
      await this.audit.log({
        action: 'INTELLIGENCE_UPDATED',
        resourceType: 'IntelligenceObject',
        resourceId: existing?.id ?? id,
        actorId,
        workspaceId,
        before: existing
          ? { name: existing.name, objectType: existing.objectType, state: existing.state }
          : null,
        after: null,
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }

  async remove(
    id: string,
    workspaceId: string,
    actorId: string,
    auditContext?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.findOne(id, workspaceId, actorId);

      await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: { state: 'ARCHIVED' },
      });

      await this.audit.log({
        action: 'INTELLIGENCE_DELETED',
        resourceType: 'IntelligenceObject',
        resourceId: existing.id,
        actorId,
        workspaceId,
        before: { name: existing.name, objectType: existing.objectType, state: existing.state },
        after: { state: 'ARCHIVED' },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.audit.log({
        action: 'INTELLIGENCE_DELETED',
        resourceType: 'IntelligenceObject',
        resourceId: existing?.id ?? id,
        actorId,
        workspaceId,
        before: existing
          ? { name: existing.name, objectType: existing.objectType, state: existing.state }
          : null,
        after: null,
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }
}

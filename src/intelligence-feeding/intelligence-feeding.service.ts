import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorityLevel,
  FeedShadowMode,
  FeedStage,
  Prisma,
  SourceCategory,
  SourceStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  AUTHORITY_TRUST_WEIGHT,
  FEED_VALIDATION_RULES,
  FeedValidationRule,
  isValidFeedStageTransition,
  MIN_TRUST_THRESHOLD,
  TRUST_WEIGHTS,
  FEED_STAGE_TRANSITIONS,
} from './intelligence-feeding.constants';
import {
  AdvanceFeedDto,
  CreateSourceDto,
  FeedListQueryDto,
  IngestFeedDto,
  SetShadowModeDto,
  SourceListQueryDto,
  UpdateSourceDto,
} from './dto/intelligence-feeding.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type ValidationCheck = { rule: FeedValidationRule; passed: boolean; message: string };

@Injectable()
export class IntelligenceFeedingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private assertScore(value: number | undefined, field: string) {
    if (value === undefined) {
      return;
    }
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
      throw new BadRequestException(`${field} must be a number between 0 and 1`);
    }
  }

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

  // ----------------------------------------------------------------------
  // Source Registry
  // ----------------------------------------------------------------------

  async createSource(
    workspaceId: string,
    userId: string,
    dto: CreateSourceDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.identity?.trim()) {
        throw new BadRequestException('identity is required');
      }
      this.assertScore(dto.trustScore, 'trustScore');
      this.assertScore(dto.confidenceScore, 'confidenceScore');

      const source = await this.prisma.intelligenceSource.create({
        data: {
          identity: dto.identity,
          description: dto.description,
          category: dto.category ?? SourceCategory.INTERNAL,
          authorityLevel: dto.authorityLevel ?? AuthorityLevel.OPERATIONAL,
          ...(dto.ownershipClass && { ownershipClass: dto.ownershipClass }),
          ...(dto.trustScore !== undefined && { trustScore: dto.trustScore }),
          ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
          status: dto.status ?? SourceStatus.ACTIVE,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          workspaceId,
          createdById: userId,
        },
      });

      await this.recordAudit(
        'INTELLIGENCE_SOURCE_CREATED',
        'IntelligenceSource',
        source.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: source.id, identity: source.identity, category: source.category },
        true,
      );

      return source;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_SOURCE_CREATED',
        'IntelligenceSource',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async listSources(workspaceId: string, query: SourceListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.IntelligenceSourceWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { identity: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.intelligenceSource.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.IntelligenceSourceOrderByWithRelationInput,
      }),
      this.prisma.intelligenceSource.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getSource(id: string, workspaceId: string) {
    const source = await this.prisma.intelligenceSource.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!source) {
      throw new NotFoundException('Intelligence source not found');
    }
    return source;
  }

  async updateSource(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateSourceDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceFeedingService['getSource']>> | null = null;
    try {
      if (dto.identity !== undefined && !dto.identity.trim()) {
        throw new BadRequestException('identity cannot be empty');
      }
      this.assertScore(dto.trustScore, 'trustScore');
      this.assertScore(dto.confidenceScore, 'confidenceScore');

      existing = await this.getSource(id, workspaceId);

      const updated = await this.prisma.intelligenceSource.update({
        where: { id: existing.id },
        data: {
          ...(dto.identity !== undefined && { identity: dto.identity }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.authorityLevel !== undefined && { authorityLevel: dto.authorityLevel }),
          ...(dto.trustScore !== undefined && { trustScore: dto.trustScore }),
          ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.metadata !== undefined && {
            metadata: dto.metadata as Prisma.InputJsonValue,
          }),
        },
      });

      await this.recordAudit(
        'INTELLIGENCE_SOURCE_UPDATED',
        'IntelligenceSource',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { identity: existing.identity, status: existing.status },
        { identity: updated.identity, status: updated.status },
        true,
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_SOURCE_UPDATED',
        'IntelligenceSource',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async removeSource(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    let existing: Awaited<ReturnType<IntelligenceFeedingService['getSource']>> | null = null;
    try {
      existing = await this.getSource(id, workspaceId);
      const removed = await this.prisma.intelligenceSource.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.recordAudit(
        'INTELLIGENCE_SOURCE_DELETED',
        'IntelligenceSource',
        removed.id,
        ctx,
        workspaceId,
        userId,
        { deletedAt: null },
        { deletedAt: removed.deletedAt },
        true,
      );

      return { success: true, id: removed.id };
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_SOURCE_DELETED',
        'IntelligenceSource',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async restoreSource(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    try {
      const existing = await this.prisma.intelligenceSource.findFirst({
        where: { id, workspaceId, deletedAt: { not: null } },
      });
      if (!existing) {
        throw new NotFoundException('Soft-deleted intelligence source not found');
      }

      const restored = await this.prisma.intelligenceSource.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });

      await this.recordAudit(
        'INTELLIGENCE_SOURCE_RESTORED',
        'IntelligenceSource',
        restored.id,
        ctx,
        workspaceId,
        userId,
        { deletedAt: existing.deletedAt },
        { deletedAt: null },
        true,
      );

      return restored;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_SOURCE_RESTORED',
        'IntelligenceSource',
        id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Trust Model
  // ----------------------------------------------------------------------

  /**
   * Composite trust score blending confidence, source authority, provenance
   * and verification signals (D11 trust model).
   */
  computeTrust(input: {
    confidence: number;
    authorityLevel: AuthorityLevel;
    provenance: number;
    verification: number;
  }): number {
    const authority = AUTHORITY_TRUST_WEIGHT[input.authorityLevel] ?? 0.5;
    const score =
      input.confidence * TRUST_WEIGHTS.confidence +
      authority * TRUST_WEIGHTS.authority +
      input.provenance * TRUST_WEIGHTS.provenance +
      input.verification * TRUST_WEIGHTS.verification;
    return Math.min(1, Math.max(0, Number(score.toFixed(4))));
  }

  // ----------------------------------------------------------------------
  // Feeding Pipeline
  // ----------------------------------------------------------------------

  async ingestFeed(
    workspaceId: string,
    userId: string,
    dto: IngestFeedDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.payload?.trim()) {
        throw new BadRequestException('payload is required');
      }
      this.assertScore(dto.confidenceScore, 'confidenceScore');
      this.assertScore(dto.provenanceScore, 'provenanceScore');
      this.assertScore(dto.verificationScore, 'verificationScore');

      const source = await this.getSource(dto.sourceId, workspaceId);
      if (source.status !== SourceStatus.ACTIVE) {
        throw new BadRequestException(`source ${source.id} is not ACTIVE`);
      }

      const confidence = dto.confidenceScore ?? source.confidenceScore;
      const provenance = dto.provenanceScore ?? 0.5;
      const verification = dto.verificationScore ?? 0.5;
      const trustScore = this.computeTrust({
        confidence,
        authorityLevel: source.authorityLevel,
        provenance,
        verification,
      });

      const feed = await this.prisma.$transaction(async (tx) => {
        const created = await tx.intelligenceFeed.create({
          data: {
            sourceId: source.id,
            payload: dto.payload,
            contentHash: this.hash(dto.payload),
            stage: FeedStage.RECEIVED,
            shadowMode: dto.shadowMode ?? FeedShadowMode.ACTIVE,
            classification: dto.classification,
            confidenceScore: confidence,
            provenanceScore: provenance,
            verificationScore: verification,
            trustScore,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
            workspaceId,
            createdById: userId,
          },
        });
        await tx.feedPipelineEvent.create({
          data: {
            feedId: created.id,
            fromStage: null,
            toStage: FeedStage.RECEIVED,
            actorId: userId,
            workspaceId,
            notes: 'Feed received',
          },
        });
        return created;
      });

      await this.recordAudit(
        'INTELLIGENCE_FEED_INGESTED',
        'IntelligenceFeed',
        feed.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: feed.id, sourceId: feed.sourceId, stage: feed.stage, shadowMode: feed.shadowMode },
        true,
      );

      return feed;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_FEED_INGESTED',
        'IntelligenceFeed',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error), sourceId: dto.sourceId },
      );
      throw error;
    }
  }

  async listFeeds(workspaceId: string, query: FeedListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.IntelligenceFeedWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.stage && { stage: query.stage }),
      ...(query.shadowMode && { shadowMode: query.shadowMode }),
      ...(query.sourceId && { sourceId: query.sourceId }),
      ...(query.search && {
        OR: [
          { payload: { contains: query.search, mode: 'insensitive' } },
          { classification: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.intelligenceFeed.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.IntelligenceFeedOrderByWithRelationInput,
      }),
      this.prisma.intelligenceFeed.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getFeed(id: string, workspaceId: string) {
    const feed = await this.prisma.intelligenceFeed.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!feed) {
      throw new NotFoundException('Intelligence feed not found');
    }
    return feed;
  }

  // ----------------------------------------------------------------------
  // Validation Gate
  // ----------------------------------------------------------------------

  /**
   * Runs the configurable validation gate (schema/authority/provenance/
   * duplication/trust/ownership) against a feed without mutating it.
   */
  async validateFeed(id: string, workspaceId: string) {
    const feed = await this.getFeed(id, workspaceId);
    const checks: ValidationCheck[] = [];

    // schema validation
    checks.push({
      rule: 'schema',
      passed: Boolean(feed.payload?.trim()) && Boolean(feed.contentHash),
      message: 'payload and contentHash must be present',
    });

    // ownership + authority depend on the source
    const source = await this.prisma.intelligenceSource.findFirst({
      where: { id: feed.sourceId, workspaceId },
    });

    checks.push({
      rule: 'authority',
      passed:
        Boolean(source) &&
        Object.values(AuthorityLevel).includes(source!.authorityLevel) &&
        source!.status === SourceStatus.ACTIVE,
      message: 'source must exist, be ACTIVE and carry a valid authority level',
    });

    checks.push({
      rule: 'provenance',
      passed: Boolean(source) && feed.provenanceScore > 0,
      message: 'feed must carry a traceable provenance signal',
    });

    // duplication detection
    const duplicate = await this.prisma.intelligenceFeed.findFirst({
      where: {
        workspaceId,
        contentHash: feed.contentHash,
        id: { not: feed.id },
        deletedAt: null,
        stage: { notIn: [FeedStage.REJECTED, FeedStage.ARCHIVED] },
      },
    });
    checks.push({
      rule: 'duplication',
      passed: !duplicate,
      message: duplicate
        ? `duplicate of feed ${duplicate.id}`
        : 'no active duplicate payload detected',
    });

    // trust validation
    checks.push({
      rule: 'trust',
      passed: feed.trustScore >= MIN_TRUST_THRESHOLD,
      message: `composite trust must be >= ${MIN_TRUST_THRESHOLD}`,
    });

    // ownership validation
    checks.push({
      rule: 'ownership',
      passed: Boolean(source) && source!.workspaceId === workspaceId && Boolean(feed.createdById),
      message: 'feed and source must belong to the same workspace',
    });

    const failed = checks.filter((c) => !c.passed).map((c) => c.rule);
    return {
      feedId: feed.id,
      valid: failed.length === 0,
      trustScore: feed.trustScore,
      checkedRules: FEED_VALIDATION_RULES,
      failedRules: failed,
      checks,
    };
  }

  async advanceFeed(
    id: string,
    workspaceId: string,
    userId: string,
    dto: AdvanceFeedDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceFeedingService['getFeed']>> | null = null;
    try {
      existing = await this.getFeed(id, workspaceId);
      const from = existing.stage;
      const to = dto.toStage;

      if (!isValidFeedStageTransition(from, to)) {
        throw new BadRequestException(
          `Invalid pipeline transition from ${from} to ${to}. Allowed: ${
            FEED_STAGE_TRANSITIONS[from]?.join(', ') || 'none'
          }`,
        );
      }

      // Validation gate is enforced when entering VALIDATED.
      let validationResult: Record<string, unknown> | undefined;
      if (to === FeedStage.VALIDATED) {
        const result = await this.validateFeed(id, workspaceId);
        validationResult = result as unknown as Record<string, unknown>;
        if (!result.valid) {
          throw new BadRequestException(`Validation gate failed: ${result.failedRules.join(', ')}`);
        }
      }

      if (to === FeedStage.LINKED) {
        if (!dto.linkedObjectId) {
          throw new BadRequestException('linkedObjectId is required to enter LINKED');
        }
        const target = await this.prisma.intelligenceObject.findFirst({
          where: { id: dto.linkedObjectId, workspaceId, deletedAt: null },
        });
        if (!target) {
          throw new BadRequestException(
            'linkedObjectId must reference an object in this workspace',
          );
        }
      }

      if (to === FeedStage.REJECTED && !dto.rejectionReason) {
        throw new BadRequestException('rejectionReason is required to reject a feed');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.intelligenceFeed.update({
          where: { id: existing!.id },
          data: {
            stage: to,
            ...(dto.classification !== undefined && { classification: dto.classification }),
            ...(to === FeedStage.LINKED && { linkedObjectId: dto.linkedObjectId }),
            ...(to === FeedStage.REJECTED && { rejectionReason: dto.rejectionReason }),
            ...(validationResult && {
              validationResult: validationResult as Prisma.InputJsonValue,
            }),
          },
        });
        await tx.feedPipelineEvent.create({
          data: {
            feedId: next.id,
            fromStage: from,
            toStage: to,
            actorId: userId,
            workspaceId,
            notes: dto.notes ?? dto.rejectionReason,
          },
        });
        return next;
      });

      await this.recordAudit(
        'INTELLIGENCE_FEED_STAGE_ADVANCED',
        'IntelligenceFeed',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { stage: from },
        { stage: to, shadowMode: updated.shadowMode },
        true,
        { notes: dto.notes, rejectionReason: dto.rejectionReason },
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_FEED_STAGE_ADVANCED',
        'IntelligenceFeed',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        existing ? { stage: existing.stage } : null,
        null,
        false,
        { error: String(error?.message ?? error), attemptedStage: dto.toStage },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Shadow Protocol
  // ----------------------------------------------------------------------

  async setShadowMode(
    id: string,
    workspaceId: string,
    userId: string,
    dto: SetShadowModeDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceFeedingService['getFeed']>> | null = null;
    try {
      existing = await this.getFeed(id, workspaceId);
      const updated = await this.prisma.intelligenceFeed.update({
        where: { id: existing.id },
        data: { shadowMode: dto.shadowMode },
      });

      await this.recordAudit(
        'INTELLIGENCE_FEED_SHADOW_SET',
        'IntelligenceFeed',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { shadowMode: existing.shadowMode },
        { shadowMode: updated.shadowMode },
        true,
        { reason: dto.reason },
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_FEED_SHADOW_SET',
        'IntelligenceFeed',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async listFeedEvents(id: string, workspaceId: string) {
    await this.getFeed(id, workspaceId);
    return this.prisma.feedPipelineEvent.findMany({
      where: { feedId: id, workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

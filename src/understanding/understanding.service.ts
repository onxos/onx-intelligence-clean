import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ContextMatchingService } from './context-matching.service';
import { MeaningExtractionService } from './meaning-extraction.service';
import { PatternDetectionService } from './pattern-detection.service';
import { RunPipelineDto, UnderstandingListQueryDto } from './dto/understanding.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class UnderstandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly t1: PatternDetectionService,
    private readonly t2: ContextMatchingService,
    private readonly t3: MeaningExtractionService,
  ) {}

  // ----------------------------------------------------------------------
  // POST /understanding/pipeline — full T1 -> T2 -> T3 (linear, acyclic)
  // ----------------------------------------------------------------------

  async runPipeline(
    workspaceId: string,
    userId: string,
    dto: RunPipelineDto,
    ctx?: MutationAuditContext,
  ) {
    const pattern = await this.t1.detectPatterns(
      workspaceId,
      userId,
      {
        perceptionIds: dto.perceptionIds,
        domain: dto.domain,
        patternType: dto.patternType,
        signals: dto.signals,
      },
      ctx,
    );
    if (pattern.status !== 'detected') {
      return { stage: 'T1', pattern, context: null, understanding: null };
    }

    const context = await this.t2.matchContext(
      workspaceId,
      userId,
      { patternId: pattern.patternId, signals: dto.signals },
      ctx,
    );
    if (context.status !== 'contextualized') {
      return { stage: 'T2', pattern, context, understanding: null };
    }

    const understanding = await this.t3.extractMeaning(
      workspaceId,
      userId,
      {
        contextId: context.contextId,
        meaning: dto.meaning,
        relatedIntents: dto.relatedIntents,
        signals: dto.signals,
      },
      ctx,
    );
    return { stage: 'T3', pattern, context, understanding };
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  private page(query?: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Number(query?.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query?.page) || 1, 1);
    return { pageSize, page, skip: (page - 1) * pageSize };
  }

  async listPatterns(workspaceId: string, query: UnderstandingListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const where: Prisma.DetectedPatternWhereInput = {
      workspaceId,
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.detectedPattern.count({ where }),
      this.prisma.detectedPattern.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async listContexts(workspaceId: string, query: UnderstandingListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const where: Prisma.ContextualizedPatternWhereInput = {
      workspaceId,
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.contextualizedPattern.count({ where }),
      this.prisma.contextualizedPattern.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async listObjects(workspaceId: string, query: UnderstandingListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const where: Prisma.UnderstandingObjectWhereInput = {
      workspaceId,
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.realityTier ? { realityTier: query.realityTier } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.understandingObject.count({ where }),
      this.prisma.understandingObject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async stats(workspaceId: string) {
    const [patterns, contexts, objects, byTier] = await Promise.all([
      this.prisma.detectedPattern.count({ where: { workspaceId } }),
      this.prisma.contextualizedPattern.count({ where: { workspaceId } }),
      this.prisma.understandingObject.count({ where: { workspaceId } }),
      this.prisma.understandingObject.groupBy({
        by: ['realityTier'],
        where: { workspaceId },
        _count: { _all: true },
      }),
    ]);
    return {
      transforms: { T1_patterns: patterns, T2_contexts: contexts, T3_understandings: objects },
      byRealityTier: Object.fromEntries(byTier.map((t) => [t.realityTier, t._count._all])),
      // Conversion ratio: how much perception became understanding.
      perceptionToUnderstandingRatio: patterns > 0 ? objects / patterns : null,
    };
  }
}

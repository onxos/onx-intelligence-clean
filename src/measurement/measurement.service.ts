import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorityLevel,
  MeasurementHistoryEventType,
  MeasurementIndexType,
  MeasurementProfile,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  AddMeasurementEvidenceDto,
  CalculateMeasurementDto,
  CreateBenchmarkDto,
  CreateMeasurementProfileDto,
  MeasurementListQueryDto,
  RecordFailureDto,
  RecordFeedbackDto,
  TrendQueryDto,
  UpdateMeasurementProfileDto,
} from './dto/measurement.dto';
import {
  aggregateScores,
  compareBenchmark,
  computeScore,
  isLowConfidence,
} from './measurement-engine';
import { MEASUREMENT_INDEX_TYPES, MEASUREMENT_SORT_FIELDS } from './measurement.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_TREND_LIMIT = 20;
const MAX_TREND_LIMIT = 200;

@Injectable()
export class MeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
  ) {}

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private round(value: number) {
    return Math.round(value * 1e6) / 1e6;
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

  private async loadProfileOrThrow(id: string, workspaceId: string) {
    const profile = await this.prisma.measurementProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!profile) {
      throw new NotFoundException('Measurement profile not found');
    }
    return profile;
  }

  private snapshot(profile: MeasurementProfile) {
    return {
      id: profile.id,
      profileId: profile.profileId,
      name: profile.name,
      indexType: profile.indexType,
      currentScore: profile.currentScore,
      currentConfidence: profile.currentConfidence,
      progressState: profile.progressState,
      trend: profile.trend,
      authority: profile.authority,
      status: profile.status,
      deletedAt: profile.deletedAt,
    };
  }

  // ----------------------------------------------------------------------
  // Part A — Measurement profile CRUD
  // ----------------------------------------------------------------------

  async createProfile(
    workspaceId: string,
    userId: string,
    dto: CreateMeasurementProfileDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      if (!MEASUREMENT_INDEX_TYPES.includes(dto.indexType)) {
        throw new BadRequestException('indexType is invalid');
      }
      const normalizationMin = dto.normalizationMin ?? 0;
      const normalizationMax = dto.normalizationMax ?? 100;
      if (normalizationMax <= normalizationMin) {
        throw new BadRequestException('normalizationMax must be greater than normalizationMin');
      }
      const ownerId = dto.ownerId?.trim() || userId;

      const created = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.measurementProfile.create({
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            indexType: dto.indexType,
            ownerId,
            workspaceId,
            targetValue: this.round(dto.targetValue ?? 1),
            minimumValue: this.round(dto.minimumValue ?? 0),
            weight: this.round(dto.weight ?? 1),
            normalizationMin: this.round(normalizationMin),
            normalizationMax: this.round(normalizationMax),
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await tx.measurementHistory.create({
          data: {
            profileId: profile.id,
            eventType: MeasurementHistoryEventType.PROFILE_CREATED,
            scoreAfter: profile.currentScore,
            confidenceAfter: profile.currentConfidence,
            progressState: profile.progressState,
            trend: profile.trend,
            actorId: ownerId,
            workspaceId,
            notes: 'Measurement profile initialised',
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        return profile;
      });

      await this.recordAudit(
        'MEASUREMENT_PROFILE_CREATED',
        'MeasurementProfile',
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
        `Measurement profile established: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'MEASUREMENT_PROFILE_CREATED',
        'MeasurementProfile',
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

  async listProfiles(workspaceId: string, query?: MeasurementListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = (MEASUREMENT_SORT_FIELDS as readonly string[]).includes(query?.sortBy as string)
      ? (query?.sortBy as string)
      : 'createdAt';
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';
    const search = query?.search?.trim();

    const where: Prisma.MeasurementProfileWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.indexType && { indexType: query.indexType }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.measurementProfile.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.MeasurementProfileOrderByWithRelationInput,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.measurementProfile.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getProfile(id: string, workspaceId: string) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    const [records, history, evidence, benchmarks, feedback] = await Promise.all([
      this.prisma.measurementRecord.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.measurementHistory.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.measurementEvidence.findMany({
        where: { profileId: profile.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.measurementBenchmark.findMany({
        where: { profileId: profile.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.measurementFeedback.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { ...profile, records, history, evidence, benchmarks, feedback };
  }

  async updateProfile(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateMeasurementProfileDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadProfileOrThrow(id, workspaceId);
    try {
      const normalizationMin = dto.normalizationMin ?? before.normalizationMin;
      const normalizationMax = dto.normalizationMax ?? before.normalizationMax;
      if (normalizationMax <= normalizationMin) {
        throw new BadRequestException('normalizationMax must be greater than normalizationMin');
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        const profile = await tx.measurementProfile.update({
          where: { id: before.id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.description !== undefined && {
              description: dto.description?.trim() || null,
            }),
            ...(dto.targetValue !== undefined && { targetValue: this.round(dto.targetValue) }),
            ...(dto.minimumValue !== undefined && { minimumValue: this.round(dto.minimumValue) }),
            ...(dto.weight !== undefined && { weight: this.round(dto.weight) }),
            ...(dto.normalizationMin !== undefined && {
              normalizationMin: this.round(dto.normalizationMin),
            }),
            ...(dto.normalizationMax !== undefined && {
              normalizationMax: this.round(dto.normalizationMax),
            }),
            ...(dto.authority !== undefined && { authority: dto.authority }),
            ...(dto.metadata !== undefined && {
              metadata: dto.metadata as Prisma.InputJsonValue,
            }),
          },
        });
        await tx.measurementHistory.create({
          data: {
            profileId: profile.id,
            eventType: MeasurementHistoryEventType.PROFILE_UPDATED,
            scoreAfter: profile.currentScore,
            confidenceAfter: profile.currentConfidence,
            progressState: profile.progressState,
            trend: profile.trend,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            notes: 'Measurement profile updated',
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        return profile;
      });
      await this.recordAudit(
        'MEASUREMENT_PROFILE_UPDATED',
        'MeasurementProfile',
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
        'MEASUREMENT_PROFILE_UPDATED',
        'MeasurementProfile',
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

  async removeProfile(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const before = await this.loadProfileOrThrow(id, workspaceId);
    try {
      const removed = await this.prisma.measurementProfile.update({
        where: { id: before.id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      });
      await this.recordAudit(
        'MEASUREMENT_PROFILE_ARCHIVED',
        'MeasurementProfile',
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
        'MEASUREMENT_PROFILE_ARCHIVED',
        'MeasurementProfile',
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
  // Part B/C — Scoring + progress tracking
  // ----------------------------------------------------------------------

  async calculate(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CalculateMeasurementDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    try {
      if (!dto.components?.length) {
        throw new BadRequestException('at least one component is required');
      }

      const recentRecords = await this.prisma.measurementRecord.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const previousNormalizedScore = recentRecords.length
        ? recentRecords[0].normalizedScore
        : null;
      const recentNormalizedScores = [...recentRecords]
        .reverse()
        .map((record) => record.normalizedScore);

      const result = computeScore({
        components: dto.components.map((component) => ({
          key: component.key,
          value: component.value,
          weight: component.weight,
          confidence: component.confidence,
        })),
        profileWeight: profile.weight,
        normalizationMin: profile.normalizationMin,
        normalizationMax: profile.normalizationMax,
        previousNormalizedScore,
        recentNormalizedScores,
        targetValue: profile.targetValue,
      });

      const { updatedProfile, record } = await this.prisma.$transaction(async (tx) => {
        const createdRecord = await tx.measurementRecord.create({
          data: {
            profileId: profile.id,
            rawScore: result.rawScore,
            weightedScore: result.weightedScore,
            normalizedScore: result.normalizedScore,
            confidence: result.confidence,
            delta: result.delta,
            trend: result.trend,
            progressState: result.progressState,
            components: dto.components as unknown as Prisma.InputJsonValue,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        const profileUpdate = await tx.measurementProfile.update({
          where: { id: profile.id },
          data: {
            currentScore: result.normalizedScore,
            currentConfidence: result.confidence,
            progressState: result.progressState,
            trend: result.trend,
          },
        });
        await tx.measurementHistory.create({
          data: {
            profileId: profile.id,
            recordId: createdRecord.id,
            eventType: MeasurementHistoryEventType.CALCULATED,
            scoreBefore: profile.currentScore,
            scoreAfter: result.normalizedScore,
            confidenceBefore: profile.currentConfidence,
            confidenceAfter: result.confidence,
            trend: result.trend,
            progressState: result.progressState,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            notes: dto.reason?.trim() || 'Measurement calculated',
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        return { updatedProfile: profileUpdate, record: createdRecord };
      });

      await this.recordAudit(
        'MEASUREMENT_CALCULATED',
        'MeasurementProfile',
        profile.id,
        ctx,
        workspaceId,
        userId,
        { currentScore: profile.currentScore, currentConfidence: profile.currentConfidence },
        {
          currentScore: updatedProfile.currentScore,
          currentConfidence: updatedProfile.currentConfidence,
          progressState: updatedProfile.progressState,
          trend: updatedProfile.trend,
        },
        true,
        { recordId: record.id, lowConfidence: isLowConfidence(result.confidence) },
      );
      await this.recordEvidence(
        workspaceId,
        profile.ownerId,
        `Measurement calculated for ${profile.name}: ${result.normalizedScore}`,
        ctx,
      );
      return { profile: updatedProfile, record };
    } catch (error) {
      await this.recordAudit(
        'MEASUREMENT_CALCULATED',
        'MeasurementProfile',
        profile.id,
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

  async history(id: string, workspaceId: string, query?: TrendQueryDto) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    const limit = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_TREND_LIMIT),
      MAX_TREND_LIMIT,
    );
    const events = await this.prisma.measurementHistory.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { profileId: profile.id, events };
  }

  async trend(id: string, workspaceId: string, query?: TrendQueryDto) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    const limit = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_TREND_LIMIT),
      MAX_TREND_LIMIT,
    );
    const records = await this.prisma.measurementRecord.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ordered = [...records].reverse();
    const series = ordered.map((record) => ({
      recordId: record.id,
      normalizedScore: record.normalizedScore,
      confidence: record.confidence,
      delta: record.delta,
      trend: record.trend,
      progressState: record.progressState,
      createdAt: record.createdAt,
    }));
    const averageScore = series.length
      ? this.round(series.reduce((sum, point) => sum + point.normalizedScore, 0) / series.length)
      : 0;
    return {
      profileId: profile.id,
      currentScore: profile.currentScore,
      currentConfidence: profile.currentConfidence,
      progressState: profile.progressState,
      trend: profile.trend,
      averageScore,
      points: series.length,
      series,
    };
  }

  // ----------------------------------------------------------------------
  // Benchmarks
  // ----------------------------------------------------------------------

  async createBenchmark(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CreateBenchmarkDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    try {
      const comparator = dto.comparator ?? 'GTE';
      if (!['GTE', 'LTE', 'EQ'].includes(comparator)) {
        throw new BadRequestException('comparator must be GTE, LTE or EQ');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const benchmark = await tx.measurementBenchmark.create({
          data: {
            profileId: profile.id,
            name: dto.name.trim(),
            value: this.round(dto.value),
            comparator,
            source: dto.source?.trim() || null,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await tx.measurementHistory.create({
          data: {
            profileId: profile.id,
            eventType: MeasurementHistoryEventType.BENCHMARK_SET,
            scoreAfter: profile.currentScore,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            notes: `Benchmark set: ${benchmark.name}`,
            metadata: { value: benchmark.value, comparator } as Prisma.InputJsonValue,
          },
        });
        return benchmark;
      });
      const comparison = compareBenchmark(profile.currentScore, created.value, comparator);
      await this.recordAudit(
        'MEASUREMENT_BENCHMARK_SET',
        'MeasurementBenchmark',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, value: created.value, comparator },
        true,
        comparison,
      );
      return { benchmark: created, comparison };
    } catch (error) {
      await this.recordAudit(
        'MEASUREMENT_BENCHMARK_SET',
        'MeasurementBenchmark',
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

  async listBenchmarks(id: string, workspaceId: string) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    const benchmarks = await this.prisma.measurementBenchmark.findMany({
      where: { profileId: profile.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      profileId: profile.id,
      currentScore: profile.currentScore,
      benchmarks: benchmarks.map((benchmark) => ({
        ...benchmark,
        comparison: compareBenchmark(
          profile.currentScore,
          benchmark.value,
          benchmark.comparator as 'GTE' | 'LTE' | 'EQ',
        ),
      })),
    };
  }

  // ----------------------------------------------------------------------
  // Evidence
  // ----------------------------------------------------------------------

  async addEvidence(
    id: string,
    workspaceId: string,
    userId: string,
    dto: AddMeasurementEvidenceDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    try {
      if (!dto.description?.trim()) {
        throw new BadRequestException('description is required');
      }
      const created = await this.prisma.measurementEvidence.create({
        data: {
          profileId: profile.id,
          evidenceRecordId: dto.evidenceRecordId?.trim() || null,
          objectId: dto.objectId?.trim() || null,
          description: dto.description.trim(),
          weight: this.round(dto.weight ?? 1),
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await this.recordAudit(
        'MEASUREMENT_EVIDENCE_ADDED',
        'MeasurementEvidence',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, profileId: profile.id },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        profile.ownerId,
        `Measurement evidence added for ${profile.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'MEASUREMENT_EVIDENCE_ADDED',
        'MeasurementEvidence',
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

  // ----------------------------------------------------------------------
  // Part D — Feedback loops
  // ----------------------------------------------------------------------

  async recordFeedback(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RecordFeedbackDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const feedback = await tx.measurementFeedback.create({
          data: {
            profileId: profile.id,
            feedbackType: dto.feedbackType,
            targetType: dto.targetType?.trim() || null,
            targetId: dto.targetId?.trim() || null,
            recommendation: dto.recommendation?.trim() || null,
            payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        await tx.measurementHistory.create({
          data: {
            profileId: profile.id,
            eventType: MeasurementHistoryEventType.FEEDBACK_RECORDED,
            scoreAfter: profile.currentScore,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            notes: `Feedback recorded: ${dto.feedbackType}`,
            metadata: {
              targetType: feedback.targetType,
              targetId: feedback.targetId,
            } as Prisma.InputJsonValue,
          },
        });
        return feedback;
      });
      await this.recordAudit(
        'MEASUREMENT_FEEDBACK_RECORDED',
        'MeasurementFeedback',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        {
          id: created.id,
          feedbackType: created.feedbackType,
          targetType: created.targetType,
          targetId: created.targetId,
        },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        profile.ownerId,
        `Measurement feedback emitted (${dto.feedbackType}) for ${profile.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'MEASUREMENT_FEEDBACK_RECORDED',
        'MeasurementFeedback',
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

  // ----------------------------------------------------------------------
  // Part E — Failure dimensions
  // ----------------------------------------------------------------------

  async recordFailure(
    id: string,
    workspaceId: string,
    userId: string,
    dto: RecordFailureDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    try {
      if (!dto.notes?.trim()) {
        throw new BadRequestException('notes is required');
      }
      const created = await this.prisma.measurementHistory.create({
        data: {
          profileId: profile.id,
          eventType: MeasurementHistoryEventType.FAILURE_RECORDED,
          scoreAfter: profile.currentScore,
          confidenceAfter: profile.currentConfidence,
          progressState: profile.progressState,
          trend: profile.trend,
          failureType: dto.failureType,
          severity: dto.severity?.trim() || 'MEDIUM',
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          notes: dto.notes.trim(),
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await this.recordAudit(
        'MEASUREMENT_FAILURE_RECORDED',
        'MeasurementProfile',
        profile.id,
        ctx,
        workspaceId,
        userId,
        null,
        { historyId: created.id, failureType: created.failureType, severity: created.severity },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        profile.ownerId,
        `Measurement failure recorded (${dto.failureType}) for ${profile.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'MEASUREMENT_FAILURE_RECORDED',
        'MeasurementProfile',
        profile.id,
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

  async failureReport(workspaceId: string) {
    const failures = await this.prisma.measurementHistory.findMany({
      where: { workspaceId, failureType: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const byType = failures.reduce<Record<string, number>>((acc, failure) => {
      const key = failure.failureType ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return { total: failures.length, byType, failures };
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const profiles = await this.prisma.measurementProfile.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const failures = await this.prisma.measurementHistory.count({
      where: { workspaceId, failureType: { not: null } },
    });

    const byIndexType: Record<string, { count: number; averageScore: number }> = {};
    for (const indexType of MEASUREMENT_INDEX_TYPES) {
      const group = profiles.filter((profile) => profile.indexType === indexType);
      if (!group.length) {
        continue;
      }
      byIndexType[indexType] = {
        count: group.length,
        averageScore: aggregateScores(
          group.map((profile) => ({
            normalizedScore: profile.currentScore,
            weight: profile.weight,
          })),
        ),
      };
    }

    const byProgressState = profiles.reduce<Record<string, number>>((acc, profile) => {
      acc[profile.progressState] = (acc[profile.progressState] ?? 0) + 1;
      return acc;
    }, {});

    const compositeScore = aggregateScores(
      profiles.map((profile) => ({
        normalizedScore: profile.currentScore,
        weight: profile.weight,
      })),
    );
    const averageConfidence = profiles.length
      ? this.round(
          profiles.reduce((sum, profile) => sum + profile.currentConfidence, 0) / profiles.length,
        )
      : 0;
    const lowConfidenceCount = profiles.filter((profile) =>
      isLowConfidence(profile.currentConfidence),
    ).length;

    return {
      workspaceId,
      totalProfiles: profiles.length,
      compositeScore,
      averageConfidence,
      lowConfidenceCount,
      totalFailures: failures,
      byIndexType,
      byProgressState,
      indexTypes: MEASUREMENT_INDEX_TYPES as MeasurementIndexType[],
    };
  }
}

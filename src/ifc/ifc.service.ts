import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  CalculateScoreDto,
  CapitalizationSignalDto,
  CreateDimensionDto,
  CreatePolicyDto,
  CreateProfileDto,
  ListQueryDto,
  OverrideDto,
  RecordIndicatorDto,
  StreamQueryDto,
  UpdateDimensionDto,
  UpdateProfileDto,
} from './dto/ifc.dto';
import {
  checkAlignment,
  computeFlourishing,
  deriveCapitalizationSignal,
  scoreDimension,
  shouldSignalAllocation,
  validateGovernance,
} from './ifc-engine';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  FLOURISHING_DIMENSIONS,
  IFC_ACTIONS,
  IFC_CONSTITUTIONAL_REF,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  REUSED_RUNTIMES,
} from './ifc.constants';

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
export class IfcService {
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
    ids: { profileId: string; workspaceId: string },
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
    await tx.iFCHistory.create({
      data: {
        profileId: ids.profileId,
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

  private async loadProfileOrThrow(id: string, workspaceId: string) {
    const profile = await this.prisma.iFCProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!profile) {
      throw new NotFoundException('IFC profile not found');
    }
    return profile;
  }

  // ----------------------------------------------------------------------
  // Part A / B — profile + dimensions
  // ----------------------------------------------------------------------

  async createProfile(
    workspaceId: string,
    userId: string,
    dto: CreateProfileDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const ownerId = dto.ownerId?.trim() || userId;
    const seed = dto.seedDimensions !== false;

    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.iFCProfile.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          workspaceId,
          ownerId,
          status: 'ACTIVE',
          intentReferenceId: dto.intentReferenceId?.trim() || null,
          objectiveReference: dto.objectiveReference?.trim() || null,
          constitutionalRef: IFC_CONSTITUTIONAL_REF.PROFILE,
          metadata: jsonify(dto.metadata),
        },
      });
      if (seed) {
        for (const dim of FLOURISHING_DIMENSIONS) {
          await tx.iFCDimension.create({
            data: {
              profileId: profile.id,
              workspaceId,
              kind: dim.kind,
              name: dim.name,
              weight: dim.weight,
              constitutionalRef: dim.constitutionalRef,
              actorId: userId,
            },
          });
        }
      }
      await tx.iFCEvidence.create({
        data: {
          profileId: profile.id,
          workspaceId,
          evidenceType: 'PROFILE_CREATED',
          summary: profile.name,
          payload: jsonify({ seeded: seed, dimensions: seed ? FLOURISHING_DIMENSIONS.length : 0 }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        'PROFILE_CREATED',
        userId,
        { constitutionalRef: IFC_CONSTITUTIONAL_REF.PROFILE, notes: profile.name },
      );
      return profile;
    });

    await this.recordAudit(
      IFC_ACTIONS.CREATE_PROFILE,
      'IFCProfile',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, status: created.status },
      true,
    );
    await this.recordEvidence(workspaceId, ownerId, `ifc:profile:create:${created.id}`, ctx);
    return created;
  }

  async updateProfile(
    workspaceId: string,
    userId: string,
    profileId: string,
    dto: UpdateProfileDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    if (profile.overridden) {
      throw new BadRequestException('Profile is under an immutable founder override');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.iFCProfile.update({
        where: { id: profile.id },
        data: {
          name: dto.name?.trim() || profile.name,
          description: dto.description?.trim() ?? profile.description,
          intentReferenceId: dto.intentReferenceId?.trim() ?? profile.intentReferenceId,
          objectiveReference: dto.objectiveReference?.trim() ?? profile.objectiveReference,
          metadata: dto.metadata ? jsonify(dto.metadata) : (profile.metadata ?? Prisma.JsonNull),
        },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        'PROFILE_UPDATED',
        userId,
        { constitutionalRef: IFC_CONSTITUTIONAL_REF.PROFILE },
      );
      return next;
    });

    await this.recordAudit(
      IFC_ACTIONS.UPDATE_PROFILE,
      'IFCProfile',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { name: profile.name },
      { name: updated.name },
      true,
    );
    await this.recordEvidence(
      workspaceId,
      profile.ownerId,
      `ifc:profile:update:${profile.id}`,
      ctx,
    );
    return updated;
  }

  async listProfiles(workspaceId: string, query: ListQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.IFCProfileWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.iFCProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getProfile(workspaceId: string, id: string) {
    const profile = await this.loadProfileOrThrow(id, workspaceId);
    const [dimensions, latestScore] = await Promise.all([
      this.prisma.iFCDimension.findMany({
        where: { profileId: id, workspaceId, deletedAt: null },
        orderBy: { kind: 'asc' },
      }),
      this.prisma.iFCScore.findFirst({
        where: { profileId: id, workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { profile, dimensions, latestScore };
  }

  async createDimension(
    workspaceId: string,
    userId: string,
    profileId: string,
    dto: CreateDimensionDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    if (profile.overridden) {
      throw new BadRequestException('Profile is under an immutable founder override');
    }
    const existing = await this.prisma.iFCDimension.findFirst({
      where: { profileId: profile.id, kind: dto.kind, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`Dimension ${dto.kind} already exists on this profile`);
    }
    const preset = FLOURISHING_DIMENSIONS.find((d) => d.kind === dto.kind);
    const dimension = await this.prisma.iFCDimension.create({
      data: {
        profileId: profile.id,
        workspaceId,
        kind: dto.kind,
        name: dto.name?.trim() || preset?.name || dto.kind,
        description: dto.description?.trim() || null,
        weight: dto.weight ?? preset?.weight ?? 0.125,
        constitutionalRef: preset?.constitutionalRef ?? IFC_CONSTITUTIONAL_REF.DIMENSION,
        actorId: userId,
        metadata: jsonify(dto.metadata),
      },
    });
    await this.recordAudit(
      IFC_ACTIONS.CREATE_DIMENSION,
      'IFCDimension',
      dimension.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: dimension.id, kind: dimension.kind },
      true,
    );
    await this.recordEvidence(workspaceId, profile.ownerId, `ifc:dimension:${dimension.id}`, ctx);
    return dimension;
  }

  async updateDimension(
    workspaceId: string,
    userId: string,
    dimensionId: string,
    dto: UpdateDimensionDto,
    ctx?: MutationAuditContext,
  ) {
    const dimension = await this.prisma.iFCDimension.findFirst({
      where: { id: dimensionId, workspaceId, deletedAt: null },
    });
    if (!dimension) {
      throw new NotFoundException('IFC dimension not found');
    }
    const updated = await this.prisma.iFCDimension.update({
      where: { id: dimension.id },
      data: {
        name: dto.name?.trim() || dimension.name,
        description: dto.description?.trim() ?? dimension.description,
        weight: dto.weight ?? dimension.weight,
        status: dto.status ?? dimension.status,
      },
    });
    await this.recordAudit(
      IFC_ACTIONS.UPDATE_DIMENSION,
      'IFCDimension',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { weight: dimension.weight, status: dimension.status },
      { weight: updated.weight, status: updated.status },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `ifc:dimension:update:${updated.id}`, ctx);
    return updated;
  }

  async recordIndicator(
    workspaceId: string,
    userId: string,
    profileId: string,
    dto: RecordIndicatorDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    if (profile.overridden) {
      throw new BadRequestException('Profile is under an immutable founder override');
    }
    const dimension = await this.prisma.iFCDimension.findFirst({
      where: { profileId: profile.id, kind: dto.kind, deletedAt: null },
    });
    if (!dimension) {
      throw new BadRequestException(`Dimension ${dto.kind} does not exist on this profile`);
    }

    const indicator = await this.prisma.$transaction(async (tx) => {
      const created = await tx.iFCIndicator.create({
        data: {
          profileId: profile.id,
          dimensionId: dimension.id,
          workspaceId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          value: dto.value,
          weight: dto.weight ?? 0.5,
          confidence: dto.confidence ?? 0,
          referenceId: dto.referenceId?.trim() || null,
          referenceType: dto.referenceType?.trim() || null,
          constitutionalRef: IFC_CONSTITUTIONAL_REF.INDICATOR,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });

      // Recompute the dimension roll-up from its active indicators.
      const indicators = await tx.iFCIndicator.findMany({
        where: { dimensionId: dimension.id, workspaceId, deletedAt: null },
      });
      const rolled = scoreDimension(
        indicators.map((i) => ({
          value: i.value,
          weight: i.weight,
          confidence: i.confidence,
          status: i.status,
        })),
      );
      await tx.iFCDimension.update({
        where: { id: dimension.id },
        data: { score: rolled.score, confidence: rolled.confidence },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        'INDICATOR_RECORDED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'IFCIndicator',
          constitutionalRef: IFC_CONSTITUTIONAL_REF.INDICATOR,
        },
      );
      return created;
    });

    await this.recordAudit(
      IFC_ACTIONS.RECORD_INDICATOR,
      'IFCIndicator',
      indicator.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: indicator.id, dimension: dto.kind, value: indicator.value },
      true,
    );
    await this.recordEvidence(workspaceId, profile.ownerId, `ifc:indicator:${indicator.id}`, ctx);
    return indicator;
  }

  // ----------------------------------------------------------------------
  // Part C — scoring
  // ----------------------------------------------------------------------

  async calculateScore(
    workspaceId: string,
    userId: string,
    profileId: string,
    dto: CalculateScoreDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    if (profile.overridden) {
      throw new BadRequestException('Profile is under an immutable founder override');
    }
    const dimensions = await this.prisma.iFCDimension.findMany({
      where: { profileId: profile.id, workspaceId, deletedAt: null },
    });
    if (!dimensions.length) {
      throw new BadRequestException('Profile has no dimensions to score');
    }

    const result = computeFlourishing({
      dimensions: dimensions.map((d) => ({
        kind: d.kind,
        weight: d.weight,
        score: d.score,
        confidence: d.confidence,
        status: d.status,
      })),
      previousIndex: profile.scoreSeq > 0 ? profile.flourishingIndex : null,
    });

    const score = await this.prisma.$transaction(async (tx) => {
      const created = await tx.iFCScore.create({
        data: {
          profileId: profile.id,
          workspaceId,
          flourishingIndex: result.flourishingIndex,
          confidence: result.confidence,
          trend: result.trend,
          delta: result.delta,
          risk: result.risk,
          degraded: result.degraded,
          dimensionScores: jsonify(result.dimensionScores),
          reason: result.reason,
          constitutionalRef: result.constitutionalRef,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.iFCProfile.update({
        where: { id: profile.id },
        data: {
          flourishingIndex: result.flourishingIndex,
          confidence: result.confidence,
          trend: result.trend,
          risk: result.risk,
          degraded: result.degraded,
          status: result.degraded ? 'DEGRADED' : 'ACTIVE',
          scoreSeq: { increment: 1 },
        },
      });
      await tx.iFCEvidence.create({
        data: {
          profileId: profile.id,
          workspaceId,
          evidenceType: 'FLOURISHING_SCORE',
          referenceId: created.id,
          referenceType: 'IFCScore',
          summary: result.reason,
          payload: jsonify(result),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        result.degraded ? 'DEGRADATION_DETECTED' : 'SCORE_CALCULATED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'IFCScore',
          constitutionalRef: result.constitutionalRef,
          notes: result.reason,
        },
      );
      return created;
    });

    await this.recordAudit(
      IFC_ACTIONS.CALCULATE_SCORE,
      'IFCScore',
      score.id,
      ctx,
      workspaceId,
      userId,
      null,
      {
        id: score.id,
        flourishingIndex: result.flourishingIndex,
        risk: result.risk,
        degraded: result.degraded,
      },
      true,
    );
    await this.recordEvidence(workspaceId, profile.ownerId, `ifc:score:${score.id}`, ctx);
    return { score, result };
  }

  async listScores(workspaceId: string, profileId: string, query: StreamQueryDto) {
    await this.loadProfileOrThrow(profileId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.iFCScore.findMany({
      where: { profileId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part D — capitalization signal
  // ----------------------------------------------------------------------

  async capitalizationSignal(
    workspaceId: string,
    userId: string,
    profileId: string,
    dto: CapitalizationSignalDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    const signalSpec = deriveCapitalizationSignal({
      flourishingIndex: profile.flourishingIndex,
      confidence: profile.confidence,
      trend: profile.trend,
      degraded: profile.degraded,
    });
    const allocationRecommended = shouldSignalAllocation({
      flourishingIndex: profile.flourishingIndex,
      confidence: profile.confidence,
      degraded: profile.degraded,
    });

    const signal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.iFCSignal.create({
        data: {
          profileId: profile.id,
          workspaceId,
          kind: signalSpec.kind,
          magnitude: signalSpec.magnitude,
          confidence: signalSpec.confidence,
          capitalReference: dto.capitalReference?.trim() || null,
          reason: signalSpec.reason,
          constitutionalRef: signalSpec.constitutionalRef,
          actorId: userId,
          metadata: jsonify({ ...dto.metadata, allocationRecommended }),
        },
      });
      await tx.iFCEvidence.create({
        data: {
          profileId: profile.id,
          workspaceId,
          evidenceType: 'CAPITALIZATION_SIGNAL',
          referenceId: created.id,
          referenceType: 'IFCSignal',
          summary: signalSpec.reason,
          payload: jsonify({ ...signalSpec, allocationRecommended }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        'CAPITALIZATION_SIGNAL',
        userId,
        {
          referenceId: created.id,
          referenceType: 'IFCSignal',
          constitutionalRef: IFC_CONSTITUTIONAL_REF.CAPITAL,
          notes: signalSpec.kind,
        },
      );
      return created;
    });

    await this.recordAudit(
      IFC_ACTIONS.CAPITALIZATION_SIGNAL,
      'IFCSignal',
      signal.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: signal.id, kind: signal.kind, allocationRecommended },
      true,
    );
    await this.recordEvidence(workspaceId, profile.ownerId, `ifc:signal:${signal.id}`, ctx);
    return { signal, allocationRecommended };
  }

  // ----------------------------------------------------------------------
  // Part E — founder alignment
  // ----------------------------------------------------------------------

  async alignmentCheck(
    workspaceId: string,
    userId: string,
    profileId: string,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    const alignmentDim = await this.prisma.iFCDimension.findFirst({
      where: { profileId: profile.id, kind: 'FOUNDER_ALIGNMENT', deletedAt: null },
    });
    const alignment = checkAlignment({
      flourishingIndex: profile.flourishingIndex,
      founderAlignmentScore: alignmentDim?.score ?? 0,
      degraded: profile.degraded,
      intentReferenceId: profile.intentReferenceId,
      objectiveReference: profile.objectiveReference,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.iFCEvidence.create({
        data: {
          profileId: profile.id,
          workspaceId,
          evidenceType: 'FOUNDER_ALIGNMENT_CHECK',
          summary: alignment.aligned ? 'aligned' : 'misaligned',
          payload: jsonify(alignment),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        'ALIGNMENT_CHECK',
        userId,
        {
          constitutionalRef: IFC_CONSTITUTIONAL_REF.ALIGNMENT,
          notes: alignment.aligned ? 'aligned' : alignment.issues.join('; '),
        },
      );
    });

    await this.recordAudit(
      IFC_ACTIONS.ALIGNMENT_CHECK,
      'IFCProfile',
      profile.id,
      ctx,
      workspaceId,
      userId,
      null,
      { aligned: alignment.aligned, alignmentScore: alignment.alignmentScore },
      true,
    );
    await this.recordEvidence(workspaceId, profile.ownerId, `ifc:alignment:${profile.id}`, ctx);
    return { profile: { id: profile.id }, alignment };
  }

  // ----------------------------------------------------------------------
  // Part F — governance: policy, override, history, evidence
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
    const policy = await this.prisma.iFCPolicy.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        minIndex: dto.minIndex ?? 0,
        minConfidence: dto.minConfidence ?? 0,
        degradationDelta: dto.degradationDelta ?? -0.1,
        constitutionalRef: IFC_CONSTITUTIONAL_REF.PROFILE,
        rules: jsonify(dto.rules),
        actorId: userId,
      },
    });
    await this.recordAudit(
      IFC_ACTIONS.CREATE_POLICY,
      'IFCPolicy',
      policy.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: policy.id, minIndex: policy.minIndex },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `ifc:policy:${policy.id}`, ctx);
    return policy;
  }

  async validateProfile(workspaceId: string, profileId: string) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    const policy = await this.prisma.iFCPolicy.findFirst({
      where: { workspaceId, status: 'ACTIVE', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const validation = validateGovernance({
      overridden: profile.overridden,
      flourishingIndex: profile.flourishingIndex,
      confidence: profile.confidence,
      degraded: profile.degraded,
      minIndex: policy?.minIndex,
      minConfidence: policy?.minConfidence,
    });
    return { profile: { id: profile.id, status: profile.status }, validation };
  }

  async listHistory(workspaceId: string, profileId: string, query: StreamQueryDto) {
    await this.loadProfileOrThrow(profileId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.iFCHistory.findMany({
      where: { profileId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listEvidence(workspaceId: string, profileId: string, query: StreamQueryDto) {
    await this.loadProfileOrThrow(profileId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.iFCEvidence.findMany({
      where: { profileId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async override(
    workspaceId: string,
    userId: string,
    profileId: string,
    dto: OverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const profile = await this.loadProfileOrThrow(profileId, workspaceId);
    if (!dto.directive?.trim()) {
      throw new BadRequestException('directive is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.iFCProfile.update({
        where: { id: profile.id },
        data: { overridden: true, status: 'OVERRIDDEN' },
      });
      await tx.iFCEvidence.create({
        data: {
          profileId: profile.id,
          workspaceId,
          evidenceType: 'FOUNDER_OVERRIDE',
          summary: dto.directive.trim(),
          payload: jsonify({ directive: dto.directive.trim(), reason: dto.reason }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { profileId: profile.id, workspaceId },
        'FOUNDER_OVERRIDE',
        userId,
        {
          constitutionalRef:
            dto.constitutionalRef?.trim() || IFC_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
          notes: dto.directive.trim(),
        },
      );
      return next;
    });

    await this.recordAudit(
      IFC_ACTIONS.OVERRIDE,
      'IFCProfile',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: profile.status },
      { status: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, profile.ownerId, `ifc:override:${profile.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [profiles, active, degraded, overridden, dimensions, signals, scores, policies] =
      await Promise.all([
        this.prisma.iFCProfile.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.iFCProfile.count({
          where: { workspaceId, deletedAt: null, status: 'ACTIVE' },
        }),
        this.prisma.iFCProfile.count({
          where: { workspaceId, deletedAt: null, degraded: true },
        }),
        this.prisma.iFCProfile.count({
          where: { workspaceId, deletedAt: null, overridden: true },
        }),
        this.prisma.iFCDimension.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.iFCSignal.count({ where: { workspaceId } }),
        this.prisma.iFCScore.count({ where: { workspaceId } }),
        this.prisma.iFCPolicy.count({ where: { workspaceId, deletedAt: null } }),
      ]);

    return {
      profiles: { total: profiles, active, degraded, overridden },
      dimensions: { total: dimensions, supportedKinds: FLOURISHING_DIMENSIONS.map((d) => d.kind) },
      signals,
      scores,
      policies,
      reusedRuntimes: REUSED_RUNTIMES,
    };
  }
}

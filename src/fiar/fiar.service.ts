import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  AssignOwnershipDto,
  ClassifyAssetDto,
  CreateCategoryDto,
  CreatePolicyDto,
  CreateRelationshipDto,
  LifecycleTransitionDto,
  ListAssetsQueryDto,
  OverrideDto,
  RegisterAssetDto,
  StreamQueryDto,
  UpdateAssetDto,
} from './dto/fiar.dto';
import {
  buildDependencyGraph,
  deriveLineage,
  nextVersion,
  resolveLifecycleTransition,
  resolveSourceRuntime,
  validateAsset,
  type GraphEdge,
} from './fiar-engine';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_STREAM_LIMIT,
  FIAR_ACTIONS,
  FIAR_ASSET_CLASSES,
  FIAR_CONSTITUTIONAL_REF,
  FiarLifecycleTransition,
  MAX_PAGE_SIZE,
  MAX_STREAM_LIMIT,
  REUSED_RUNTIMES,
} from './fiar.constants';

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
export class FiarService {
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
    ids: { assetId: string; workspaceId: string },
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
    await tx.fIARHistory.create({
      data: {
        assetId: ids.assetId,
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

  private async loadAssetOrThrow(id: string, workspaceId: string) {
    const asset = await this.prisma.fIARAsset.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!asset) {
      throw new NotFoundException('FIAR asset not found');
    }
    return asset;
  }

  // ----------------------------------------------------------------------
  // Part A / C — registration
  // ----------------------------------------------------------------------

  async registerAsset(
    workspaceId: string,
    userId: string,
    dto: RegisterAssetDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    const ownerId = dto.ownerId?.trim() || userId;
    const sourceRuntime = resolveSourceRuntime(dto.assetClass);

    if (dto.categoryId) {
      await this.loadCategoryOrThrow(dto.categoryId, workspaceId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.fIARAsset.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          workspaceId,
          ownerId,
          assetClass: dto.assetClass,
          status: 'DRAFT',
          sourceRuntime,
          referenceId: dto.referenceId?.trim() || null,
          referenceType: dto.referenceType?.trim() || null,
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.ASSET,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.fIARClassification.create({
        data: {
          assetId: asset.id,
          workspaceId,
          assetClass: dto.assetClass,
          categoryId: dto.categoryId || null,
          confidence: 1,
          rationale: 'Initial registration classification',
          active: true,
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.CLASSIFICATION,
          actorId: userId,
        },
      });
      await tx.fIAROwnership.create({
        data: {
          assetId: asset.id,
          workspaceId,
          ownerId,
          ownershipKind: dto.ownershipKind ?? 'WORKSPACE',
          active: true,
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.OWNERSHIP,
          actorId: userId,
        },
      });
      await tx.fIAREvidence.create({
        data: {
          assetId: asset.id,
          workspaceId,
          evidenceType: 'ASSET_REGISTERED',
          summary: asset.name,
          payload: jsonify({ assetClass: dto.assetClass, sourceRuntime }),
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { assetId: asset.id, workspaceId }, 'ASSET_REGISTERED', userId, {
        constitutionalRef: FIAR_CONSTITUTIONAL_REF.ASSET,
        notes: `${dto.assetClass} (${sourceRuntime})`,
      });
      return asset;
    });

    await this.recordAudit(
      FIAR_ACTIONS.REGISTER_ASSET,
      'FIARAsset',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, assetClass: created.assetClass, status: created.status },
      true,
    );
    await this.recordEvidence(workspaceId, ownerId, `fiar:asset:register:${created.id}`, ctx);
    return created;
  }

  async updateAsset(
    workspaceId: string,
    userId: string,
    assetId: string,
    dto: UpdateAssetDto,
    ctx?: MutationAuditContext,
  ) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    if (asset.overridden) {
      throw new BadRequestException('Asset is under an immutable founder override');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.fIARAsset.update({
        where: { id: asset.id },
        data: {
          name: dto.name?.trim() || asset.name,
          description: dto.description?.trim() ?? asset.description,
          referenceId: dto.referenceId?.trim() ?? asset.referenceId,
          referenceType: dto.referenceType?.trim() ?? asset.referenceType,
          metadata: dto.metadata ? jsonify(dto.metadata) : (asset.metadata ?? Prisma.JsonNull),
        },
      });
      await this.writeHistory(tx, { assetId: asset.id, workspaceId }, 'ASSET_UPDATED', userId, {
        constitutionalRef: FIAR_CONSTITUTIONAL_REF.ASSET,
      });
      return next;
    });

    await this.recordAudit(
      FIAR_ACTIONS.UPDATE_ASSET,
      'FIARAsset',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { name: asset.name },
      { name: updated.name },
      true,
    );
    await this.recordEvidence(workspaceId, asset.ownerId, `fiar:asset:update:${asset.id}`, ctx);
    return updated;
  }

  async listAssets(workspaceId: string, query: ListAssetsQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.FIARAssetWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.assetClass ? { assetClass: query.assetClass } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.fIARAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getAsset(workspaceId: string, id: string) {
    const asset = await this.loadAssetOrThrow(id, workspaceId);
    const [classification, ownership, relationships] = await Promise.all([
      this.prisma.fIARClassification.findFirst({
        where: { assetId: id, workspaceId, active: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fIAROwnership.findFirst({
        where: { assetId: id, workspaceId, active: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fIARRelationship.findMany({
        where: { assetId: id, workspaceId, active: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { asset, classification, ownership, relationships };
  }

  // ----------------------------------------------------------------------
  // Part B / C — classification / reclassification
  // ----------------------------------------------------------------------

  async classifyAsset(
    workspaceId: string,
    userId: string,
    assetId: string,
    dto: ClassifyAssetDto,
    ctx?: MutationAuditContext,
  ) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    if (asset.overridden) {
      throw new BadRequestException('Asset is under an immutable founder override');
    }
    if (dto.categoryId) {
      await this.loadCategoryOrThrow(dto.categoryId, workspaceId);
    }
    const reclassified = asset.assetClass !== dto.assetClass;
    const sourceRuntime = resolveSourceRuntime(dto.assetClass);

    const classification = await this.prisma.$transaction(async (tx) => {
      // Supersede the currently active classification.
      await tx.fIARClassification.updateMany({
        where: { assetId: asset.id, workspaceId, active: true },
        data: { active: false },
      });
      const created = await tx.fIARClassification.create({
        data: {
          assetId: asset.id,
          workspaceId,
          assetClass: dto.assetClass,
          categoryId: dto.categoryId || null,
          confidence: dto.confidence ?? 1,
          rationale: dto.rationale?.trim() || null,
          active: true,
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.CLASSIFICATION,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.fIARAsset.update({
        where: { id: asset.id },
        data: {
          assetClass: dto.assetClass,
          sourceRuntime,
          version: nextVersion(asset.version),
        },
      });
      await tx.fIAREvidence.create({
        data: {
          assetId: asset.id,
          workspaceId,
          evidenceType: reclassified ? 'ASSET_RECLASSIFIED' : 'ASSET_CLASSIFIED',
          referenceId: created.id,
          referenceType: 'FIARClassification',
          summary: `${asset.assetClass} -> ${dto.assetClass}`,
          payload: jsonify({ from: asset.assetClass, to: dto.assetClass, sourceRuntime }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { assetId: asset.id, workspaceId },
        reclassified ? 'ASSET_RECLASSIFIED' : 'ASSET_CLASSIFIED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'FIARClassification',
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.CLASSIFICATION,
          notes: `${asset.assetClass} -> ${dto.assetClass}`,
        },
      );
      return created;
    });

    await this.recordAudit(
      FIAR_ACTIONS.CLASSIFY_ASSET,
      'FIARClassification',
      classification.id,
      ctx,
      workspaceId,
      userId,
      { assetClass: asset.assetClass },
      { assetClass: dto.assetClass, reclassified },
      true,
    );
    await this.recordEvidence(
      workspaceId,
      asset.ownerId,
      `fiar:classify:${classification.id}`,
      ctx,
    );
    return classification;
  }

  // ----------------------------------------------------------------------
  // Part C — ownership
  // ----------------------------------------------------------------------

  async assignOwnership(
    workspaceId: string,
    userId: string,
    assetId: string,
    dto: AssignOwnershipDto,
    ctx?: MutationAuditContext,
  ) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    if (asset.overridden) {
      throw new BadRequestException('Asset is under an immutable founder override');
    }
    if (!dto.ownerId?.trim()) {
      throw new BadRequestException('ownerId is required');
    }

    const ownership = await this.prisma.$transaction(async (tx) => {
      await tx.fIAROwnership.updateMany({
        where: { assetId: asset.id, workspaceId, active: true },
        data: { active: false },
      });
      const created = await tx.fIAROwnership.create({
        data: {
          assetId: asset.id,
          workspaceId,
          ownerId: dto.ownerId.trim(),
          ownershipKind: dto.ownershipKind ?? 'WORKSPACE',
          active: true,
          constitutionalRef: dto.constitutionalRef?.trim() || FIAR_CONSTITUTIONAL_REF.OWNERSHIP,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.fIARAsset.update({
        where: { id: asset.id },
        data: { ownerId: dto.ownerId.trim() },
      });
      await this.writeHistory(
        tx,
        { assetId: asset.id, workspaceId },
        'OWNERSHIP_ASSIGNED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'FIAROwnership',
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.OWNERSHIP,
          notes: dto.ownershipKind ?? 'WORKSPACE',
        },
      );
      return created;
    });

    await this.recordAudit(
      FIAR_ACTIONS.ASSIGN_OWNERSHIP,
      'FIAROwnership',
      ownership.id,
      ctx,
      workspaceId,
      userId,
      { ownerId: asset.ownerId },
      { ownerId: ownership.ownerId, ownershipKind: ownership.ownershipKind },
      true,
    );
    await this.recordEvidence(workspaceId, asset.ownerId, `fiar:ownership:${ownership.id}`, ctx);
    return ownership;
  }

  // ----------------------------------------------------------------------
  // Part C — relationships / dependency graph / lineage
  // ----------------------------------------------------------------------

  async createRelationship(
    workspaceId: string,
    userId: string,
    assetId: string,
    dto: CreateRelationshipDto,
    ctx?: MutationAuditContext,
  ) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    if (asset.overridden) {
      throw new BadRequestException('Asset is under an immutable founder override');
    }
    if (dto.targetAssetId === asset.id) {
      throw new BadRequestException('An asset cannot relate to itself');
    }
    await this.loadAssetOrThrow(dto.targetAssetId, workspaceId);

    const existing = await this.prisma.fIARRelationship.findFirst({
      where: { assetId: asset.id, targetAssetId: dto.targetAssetId, kind: dto.kind },
    });
    if (existing) {
      throw new BadRequestException('This relationship already exists');
    }

    const relationship = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fIARRelationship.create({
        data: {
          assetId: asset.id,
          targetAssetId: dto.targetAssetId,
          workspaceId,
          kind: dto.kind,
          active: true,
          rationale: dto.rationale?.trim() || null,
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.RELATIONSHIP,
          actorId: userId,
          metadata: jsonify(dto.metadata),
        },
      });
      await this.writeHistory(
        tx,
        { assetId: asset.id, workspaceId },
        'RELATIONSHIP_CREATED',
        userId,
        {
          referenceId: created.id,
          referenceType: 'FIARRelationship',
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.RELATIONSHIP,
          notes: `${dto.kind} -> ${dto.targetAssetId}`,
        },
      );
      return created;
    });

    await this.recordAudit(
      FIAR_ACTIONS.CREATE_RELATIONSHIP,
      'FIARRelationship',
      relationship.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: relationship.id, kind: relationship.kind, targetAssetId: relationship.targetAssetId },
      true,
    );
    await this.recordEvidence(
      workspaceId,
      asset.ownerId,
      `fiar:relationship:${relationship.id}`,
      ctx,
    );
    return relationship;
  }

  private async loadWorkspaceEdges(workspaceId: string): Promise<GraphEdge[]> {
    const relationships = await this.prisma.fIARRelationship.findMany({
      where: { workspaceId, active: true },
      select: { assetId: true, targetAssetId: true, kind: true },
    });
    return relationships.map((r) => ({
      assetId: r.assetId,
      targetAssetId: r.targetAssetId,
      kind: r.kind,
    }));
  }

  async getRelationshipGraph(workspaceId: string, assetId: string) {
    await this.loadAssetOrThrow(assetId, workspaceId);
    const edges = await this.loadWorkspaceEdges(workspaceId);
    return buildDependencyGraph(assetId, edges);
  }

  async getLineage(workspaceId: string, assetId: string) {
    await this.loadAssetOrThrow(assetId, workspaceId);
    const edges = await this.loadWorkspaceEdges(workspaceId);
    return deriveLineage(assetId, edges);
  }

  // ----------------------------------------------------------------------
  // Part D — lifecycle
  // ----------------------------------------------------------------------

  async transitionLifecycle(
    workspaceId: string,
    userId: string,
    assetId: string,
    dto: LifecycleTransitionDto,
    ctx?: MutationAuditContext,
  ) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    if (asset.overridden) {
      throw new BadRequestException('Asset is under an immutable founder override');
    }
    const resolution = resolveLifecycleTransition(asset.status, dto.transition);
    if (!resolution.allowed) {
      throw new BadRequestException(resolution.reason);
    }

    let replacementAssetId: string | null = null;
    if (dto.transition === FiarLifecycleTransition.REPLACE) {
      if (!dto.replacementAssetId?.trim()) {
        throw new BadRequestException('replacementAssetId is required for REPLACE');
      }
      if (dto.replacementAssetId.trim() === asset.id) {
        throw new BadRequestException('An asset cannot replace itself');
      }
      await this.loadAssetOrThrow(dto.replacementAssetId.trim(), workspaceId);
      replacementAssetId = dto.replacementAssetId.trim();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.fIARAsset.update({
        where: { id: asset.id },
        data: {
          status: resolution.targetStatus,
          version: nextVersion(asset.version),
          replacedById: replacementAssetId ?? asset.replacedById,
        },
      });
      if (replacementAssetId) {
        const dupe = await tx.fIARRelationship.findFirst({
          where: { assetId: replacementAssetId, targetAssetId: asset.id, kind: 'REPLACES' },
        });
        if (!dupe) {
          await tx.fIARRelationship.create({
            data: {
              assetId: replacementAssetId,
              targetAssetId: asset.id,
              workspaceId,
              kind: 'REPLACES',
              active: true,
              constitutionalRef: FIAR_CONSTITUTIONAL_REF.RELATIONSHIP,
              actorId: userId,
            },
          });
        }
      }
      await tx.fIAREvidence.create({
        data: {
          assetId: asset.id,
          workspaceId,
          evidenceType: 'LIFECYCLE_TRANSITION',
          summary: resolution.reason,
          payload: jsonify({
            transition: dto.transition,
            from: resolution.currentStatus,
            to: resolution.targetStatus,
            replacementAssetId,
          }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { assetId: asset.id, workspaceId },
        `LIFECYCLE_${dto.transition}`,
        userId,
        {
          referenceId: replacementAssetId,
          referenceType: replacementAssetId ? 'FIARAsset' : null,
          constitutionalRef: FIAR_CONSTITUTIONAL_REF.ASSET,
          notes: resolution.reason,
        },
      );
      return next;
    });

    await this.recordAudit(
      FIAR_ACTIONS.LIFECYCLE_TRANSITION,
      'FIARAsset',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: asset.status },
      { status: updated.status, transition: dto.transition },
      true,
    );
    await this.recordEvidence(workspaceId, asset.ownerId, `fiar:lifecycle:${asset.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Part B — categories
  // ----------------------------------------------------------------------

  private async loadCategoryOrThrow(id: string, workspaceId: string) {
    const category = await this.prisma.fIARCategory.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException('FIAR category not found');
    }
    return category;
  }

  async createCategory(
    workspaceId: string,
    userId: string,
    dto: CreateCategoryDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim() || !dto.code?.trim()) {
      throw new BadRequestException('name and code are required');
    }
    const existing = await this.prisma.fIARCategory.findFirst({
      where: { workspaceId, code: dto.code.trim(), deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`Category code ${dto.code.trim()} already exists`);
    }
    const category = await this.prisma.fIARCategory.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: dto.description?.trim() || null,
        assetClass: dto.assetClass ?? null,
        constitutionalRef: FIAR_CONSTITUTIONAL_REF.CATEGORY,
        actorId: userId,
        metadata: jsonify(dto.metadata),
      },
    });
    await this.recordAudit(
      FIAR_ACTIONS.CREATE_CATEGORY,
      'FIARCategory',
      category.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: category.id, code: category.code },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `fiar:category:${category.id}`, ctx);
    return category;
  }

  async listCategories(workspaceId: string, query: StreamQueryDto) {
    const take = clampStream(query.limit);
    return this.prisma.fIARCategory.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part F — governance: policy, validation, override, history, evidence
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
    const policy = await this.prisma.fIARPolicy.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        requireOwnership: dto.requireOwnership ?? true,
        requireReference: dto.requireReference ?? false,
        allowedClasses: jsonify(dto.allowedClasses ?? []),
        constitutionalRef: FIAR_CONSTITUTIONAL_REF.POLICY,
        rules: jsonify(dto.rules),
        actorId: userId,
      },
    });
    await this.recordAudit(
      FIAR_ACTIONS.CREATE_POLICY,
      'FIARPolicy',
      policy.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: policy.id, requireOwnership: policy.requireOwnership },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `fiar:policy:${policy.id}`, ctx);
    return policy;
  }

  async validateAsset(workspaceId: string, assetId: string) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    const [ownership, policy] = await Promise.all([
      this.prisma.fIAROwnership.findFirst({
        where: { assetId, workspaceId, active: true },
      }),
      this.prisma.fIARPolicy.findFirst({
        where: { workspaceId, status: 'ACTIVE', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const allowed = Array.isArray(policy?.allowedClasses)
      ? (policy?.allowedClasses as string[])
      : [];
    const validation = validateAsset({
      assetClass: asset.assetClass,
      hasActiveOwnership: Boolean(ownership),
      referenceId: asset.referenceId,
      requireOwnership: policy?.requireOwnership ?? true,
      requireReference: policy?.requireReference ?? false,
      allowedClasses: allowed,
    });
    return {
      asset: { id: asset.id, status: asset.status, assetClass: asset.assetClass },
      validation,
    };
  }

  async listHistory(workspaceId: string, assetId: string, query: StreamQueryDto) {
    await this.loadAssetOrThrow(assetId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.fIARHistory.findMany({
      where: { assetId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listEvidence(workspaceId: string, assetId: string, query: StreamQueryDto) {
    await this.loadAssetOrThrow(assetId, workspaceId);
    const take = clampStream(query.limit);
    return this.prisma.fIAREvidence.findMany({
      where: { assetId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async override(
    workspaceId: string,
    userId: string,
    assetId: string,
    dto: OverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const asset = await this.loadAssetOrThrow(assetId, workspaceId);
    if (!dto.directive?.trim()) {
      throw new BadRequestException('directive is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.fIARAsset.update({
        where: { id: asset.id },
        data: { overridden: true, status: 'OVERRIDDEN' },
      });
      await tx.fIAREvidence.create({
        data: {
          assetId: asset.id,
          workspaceId,
          evidenceType: 'FOUNDER_OVERRIDE',
          summary: dto.directive.trim(),
          payload: jsonify({ directive: dto.directive.trim(), reason: dto.reason }),
          actorId: userId,
        },
      });
      await this.writeHistory(tx, { assetId: asset.id, workspaceId }, 'FOUNDER_OVERRIDE', userId, {
        constitutionalRef:
          dto.constitutionalRef?.trim() || FIAR_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
        notes: dto.directive.trim(),
      });
      return next;
    });

    await this.recordAudit(
      FIAR_ACTIONS.OVERRIDE,
      'FIARAsset',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: asset.status },
      { status: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, asset.ownerId, `fiar:override:${asset.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [total, active, deprecated, archived, overridden, categories, relationships, policies] =
      await Promise.all([
        this.prisma.fIARAsset.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.fIARAsset.count({
          where: { workspaceId, deletedAt: null, status: 'ACTIVE' },
        }),
        this.prisma.fIARAsset.count({
          where: { workspaceId, deletedAt: null, status: 'DEPRECATED' },
        }),
        this.prisma.fIARAsset.count({
          where: { workspaceId, deletedAt: null, status: 'ARCHIVED' },
        }),
        this.prisma.fIARAsset.count({
          where: { workspaceId, deletedAt: null, overridden: true },
        }),
        this.prisma.fIARCategory.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.fIARRelationship.count({ where: { workspaceId, active: true } }),
        this.prisma.fIARPolicy.count({ where: { workspaceId, deletedAt: null } }),
      ]);

    const byClassRaw = await this.prisma.fIARAsset.groupBy({
      by: ['assetClass'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byClass = byClassRaw.map((row) => ({
      assetClass: row.assetClass,
      count: row._count._all,
    }));

    return {
      assets: { total, active, deprecated, archived, overridden },
      byClass,
      categories,
      relationships,
      policies,
      supportedClasses: FIAR_ASSET_CLASSES.map((c) => ({
        assetClass: c.assetClass,
        sourceRuntime: c.sourceRuntime,
        future: c.future,
      })),
      reusedRuntimes: [...REUSED_RUNTIMES],
    };
  }
}

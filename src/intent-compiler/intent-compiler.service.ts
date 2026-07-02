import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  FounderIntentConflictSeverity,
  FounderIntentConflictStatus,
  FounderIntentConflictType,
  FounderIntentLifecycle,
  FounderIntentPriority,
  FounderIntentRelationType,
  FounderIntentReviewDecision,
  FounderIntentVersionType,
  FounderOverrideType,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { IurgService } from '../iurg/iurg.service';
import {
  authorityRank,
  FIC_CONFLICT_SEVERITY_ORDER,
  FIC_DEPENDENCY_RELATION_TYPES,
  FIC_PRIORITY_RANK,
  isValidLifecycleTransition,
} from './intent-compiler.constants';
import {
  ApproveIntentDto,
  CompareVersionsQueryDto,
  ConflictListQueryDto,
  CreateFounderIntentDto,
  CreateRelationshipDto,
  CreateReviewDto,
  FounderIntentListQueryDto,
  OverrideIntentDto,
  ResolveConflictDto,
  TransitionLifecycleDto,
  UpdateFounderIntentDto,
  VersionFounderIntentDto,
} from './dto/intent-compiler.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type IntentSnapshot = {
  title: string;
  description: string;
  rationale: string | null;
  constitutionalAuthority: string;
  priority: FounderIntentPriority;
  ownerId: string;
  dependencies: string[];
  affectedDomains: string[];
  lifecycle: FounderIntentLifecycle;
  status: string;
  version: number;
  majorVersion: number;
  minorVersion: number;
  revisionVersion: number;
  parentIntentId: string | null;
  supersededById: string | null;
  metadata: Record<string, unknown>;
};

@Injectable()
export class IntentCompilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    @Optional() private readonly iurg?: IurgService,
  ) {}

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private normalizeStringArray(values: string[] = []) {
    return Array.from(
      new Set(
        (values ?? [])
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private computeContentHash(snapshot: Partial<IntentSnapshot>) {
    const canonical = JSON.stringify({
      title: (snapshot.title ?? '').trim().toLowerCase(),
      description: (snapshot.description ?? '').trim().toLowerCase(),
      rationale: (snapshot.rationale ?? '')?.toString().trim().toLowerCase(),
      constitutionalAuthority: (snapshot.constitutionalAuthority ?? '').trim().toUpperCase(),
      priority: snapshot.priority,
      dependencies: [...(snapshot.dependencies ?? [])].sort(),
      affectedDomains: [...(snapshot.affectedDomains ?? [])].map((d) => d.toUpperCase()).sort(),
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  private toSnapshot(intent: any): IntentSnapshot {
    return {
      title: intent.title,
      description: intent.description,
      rationale: intent.rationale ?? null,
      constitutionalAuthority: intent.constitutionalAuthority,
      priority: intent.priority,
      ownerId: intent.ownerId,
      dependencies: intent.dependencies ?? [],
      affectedDomains: intent.affectedDomains ?? [],
      lifecycle: intent.lifecycle,
      status: intent.status,
      version: intent.version,
      majorVersion: intent.majorVersion,
      minorVersion: intent.minorVersion,
      revisionVersion: intent.revisionVersion,
      parentIntentId: intent.parentIntentId ?? null,
      supersededById: intent.supersededById ?? null,
      metadata: (intent.metadata as Record<string, unknown>) ?? {},
    };
  }

  private computeDiff(before: IntentSnapshot | null, after: IntentSnapshot) {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const keys = Object.keys(after) as Array<keyof IntentSnapshot>;
    for (const key of keys) {
      const prev = before ? before[key] : undefined;
      const next = after[key];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        diff[key as string] = { from: prev ?? null, to: next ?? null };
      }
    }
    return diff;
  }

  private bumpVersion(
    current: { majorVersion: number; minorVersion: number; revisionVersion: number },
    type: FounderIntentVersionType,
  ) {
    if (type === 'MAJOR') {
      return { majorVersion: current.majorVersion + 1, minorVersion: 0, revisionVersion: 0 };
    }
    if (type === 'MINOR') {
      return {
        majorVersion: current.majorVersion,
        minorVersion: current.minorVersion + 1,
        revisionVersion: 0,
      };
    }
    return {
      majorVersion: current.majorVersion,
      minorVersion: current.minorVersion,
      revisionVersion: current.revisionVersion + 1,
    };
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

  private async recordGovernanceEvidence(
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

  private async loadIntentOrThrow(id: string, workspaceId: string) {
    const intent = await this.prisma.founderIntent.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!intent) {
      throw new NotFoundException('Founder intent not found');
    }
    return intent;
  }

  // ----------------------------------------------------------------------
  // Intent CRUD + versioning
  // ----------------------------------------------------------------------

  async createIntent(
    workspaceId: string,
    userId: string,
    dto: CreateFounderIntentDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.title?.trim()) {
        throw new BadRequestException('title is required');
      }
      if (!dto.description?.trim()) {
        throw new BadRequestException('description is required');
      }
      if (!dto.constitutionalAuthority?.trim()) {
        throw new BadRequestException('constitutionalAuthority is required');
      }

      const dependencies = this.normalizeStringArray(dto.dependencies);
      const affectedDomains = this.normalizeStringArray(dto.affectedDomains);
      const ownerId = dto.ownerId?.trim() || userId;
      const priority = dto.priority ?? FounderIntentPriority.MEDIUM;

      if (dto.parentIntentId) {
        await this.loadIntentOrThrow(dto.parentIntentId, workspaceId);
      }

      const contentHash = this.computeContentHash({
        title: dto.title,
        description: dto.description,
        rationale: dto.rationale ?? null,
        constitutionalAuthority: dto.constitutionalAuthority,
        priority,
        dependencies,
        affectedDomains,
      });

      const intent = await this.prisma.$transaction(async (tx) => {
        const created = await tx.founderIntent.create({
          data: {
            title: dto.title.trim(),
            description: dto.description.trim(),
            rationale: dto.rationale?.trim(),
            constitutionalAuthority: dto.constitutionalAuthority.trim(),
            priority,
            ownerId,
            dependencies,
            affectedDomains,
            lifecycle: FounderIntentLifecycle.DRAFT,
            status: FounderIntentLifecycle.DRAFT,
            version: 1,
            majorVersion: 1,
            minorVersion: 0,
            revisionVersion: 0,
            parentIntentId: dto.parentIntentId,
            contentHash,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
            workspaceId,
            createdById: userId,
          },
        });

        const snapshot = this.toSnapshot(created);
        await tx.founderIntentVersion.create({
          data: {
            intentId: created.id,
            versionNumber: 1,
            versionType: FounderIntentVersionType.MAJOR,
            majorVersion: 1,
            minorVersion: 0,
            revision: 0,
            title: created.title,
            description: created.description,
            rationale: created.rationale,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            diff: this.computeDiff(null, snapshot) as unknown as Prisma.InputJsonValue,
            changeSummary: 'Initial founder intent version',
            isActive: true,
            authorId: userId,
            workspaceId,
          },
        });

        return created;
      });

      await this.recordAudit(
        'FOUNDER_INTENT_CREATED',
        'FounderIntent',
        intent.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: intent.id, lifecycle: intent.lifecycle, version: intent.version },
        true,
      );
      await this.recordGovernanceEvidence(
        workspaceId,
        ownerId,
        `Founder intent compiled: ${intent.title}`,
        ctx,
      );

      return intent;
    } catch (error: any) {
      await this.recordAudit(
        'FOUNDER_INTENT_CREATED',
        'FounderIntent',
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

  async listIntents(workspaceId: string, query: FounderIntentListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.FounderIntentWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.lifecycle && { lifecycle: query.lifecycle }),
      ...(query.priority && { priority: query.priority }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.founderIntent.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.FounderIntentOrderByWithRelationInput,
      }),
      this.prisma.founderIntent.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getIntent(id: string, workspaceId: string) {
    return this.loadIntentOrThrow(id, workspaceId);
  }

  async updateIntent(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateFounderIntentDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.loadIntentOrThrow(id, workspaceId);

      if (existing.lifecycle === FounderIntentLifecycle.ARCHIVED) {
        throw new BadRequestException('Archived intents are immutable');
      }
      if (dto.title !== undefined && !dto.title.trim()) {
        throw new BadRequestException('title cannot be empty');
      }
      if (dto.description !== undefined && !dto.description.trim()) {
        throw new BadRequestException('description cannot be empty');
      }

      const beforeSnapshot = this.toSnapshot(existing);
      const versionType = dto.versionType ?? FounderIntentVersionType.REVISION;
      const bumped = this.bumpVersion(existing, versionType);

      const dependencies =
        dto.dependencies !== undefined
          ? this.normalizeStringArray(dto.dependencies)
          : existing.dependencies;
      const affectedDomains =
        dto.affectedDomains !== undefined
          ? this.normalizeStringArray(dto.affectedDomains)
          : existing.affectedDomains;

      const nextContent = {
        title: dto.title?.trim() ?? existing.title,
        description: dto.description?.trim() ?? existing.description,
        rationale: dto.rationale?.trim() ?? existing.rationale,
        constitutionalAuthority:
          dto.constitutionalAuthority?.trim() ?? existing.constitutionalAuthority,
        priority: dto.priority ?? existing.priority,
        dependencies,
        affectedDomains,
      };
      const contentHash = this.computeContentHash(nextContent);

      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.founderIntent.update({
          where: { id: existing.id },
          data: {
            ...(dto.title !== undefined && { title: nextContent.title }),
            ...(dto.description !== undefined && { description: nextContent.description }),
            ...(dto.rationale !== undefined && { rationale: nextContent.rationale }),
            ...(dto.constitutionalAuthority !== undefined && {
              constitutionalAuthority: nextContent.constitutionalAuthority,
            }),
            ...(dto.priority !== undefined && { priority: nextContent.priority }),
            ...(dto.dependencies !== undefined && { dependencies }),
            ...(dto.affectedDomains !== undefined && { affectedDomains }),
            ...(dto.metadata !== undefined && {
              metadata: dto.metadata as Prisma.InputJsonValue,
            }),
            version: existing.version + 1,
            majorVersion: bumped.majorVersion,
            minorVersion: bumped.minorVersion,
            revisionVersion: bumped.revisionVersion,
            contentHash,
          },
        });

        const afterSnapshot = this.toSnapshot(result);
        await tx.founderIntentVersion.updateMany({
          where: { intentId: result.id, isActive: true },
          data: { isActive: false },
        });
        await tx.founderIntentVersion.create({
          data: {
            intentId: result.id,
            versionNumber: result.version,
            versionType,
            majorVersion: bumped.majorVersion,
            minorVersion: bumped.minorVersion,
            revision: bumped.revisionVersion,
            title: result.title,
            description: result.description,
            rationale: result.rationale,
            snapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
            diff: this.computeDiff(
              beforeSnapshot,
              afterSnapshot,
            ) as unknown as Prisma.InputJsonValue,
            changeSummary: dto.changeSummary?.trim() ?? 'Intent updated',
            isActive: true,
            authorId: userId,
            workspaceId,
          },
        });

        return result;
      });

      await this.recordAudit(
        'FOUNDER_INTENT_UPDATED',
        'FounderIntent',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { version: existing.version },
        { version: updated.version, versionType },
        true,
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'FOUNDER_INTENT_UPDATED',
        'FounderIntent',
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

  async removeIntent(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const existing = await this.loadIntentOrThrow(id, workspaceId);
    const updated = await this.prisma.founderIntent.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await this.recordAudit(
      'FOUNDER_INTENT_DELETED',
      'FounderIntent',
      id,
      ctx,
      workspaceId,
      userId,
      { deletedAt: null },
      { deletedAt: updated.deletedAt },
      true,
    );
    return { id, deleted: true };
  }

  async versionIntent(
    id: string,
    workspaceId: string,
    userId: string,
    dto: VersionFounderIntentDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.loadIntentOrThrow(id, workspaceId);
    const bumped = this.bumpVersion(existing, dto.versionType);
    const beforeSnapshot = this.toSnapshot(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.founderIntent.update({
        where: { id: existing.id },
        data: {
          version: existing.version + 1,
          majorVersion: bumped.majorVersion,
          minorVersion: bumped.minorVersion,
          revisionVersion: bumped.revisionVersion,
        },
      });
      const afterSnapshot = this.toSnapshot(result);
      await tx.founderIntentVersion.updateMany({
        where: { intentId: result.id, isActive: true },
        data: { isActive: false },
      });
      await tx.founderIntentVersion.create({
        data: {
          intentId: result.id,
          versionNumber: result.version,
          versionType: dto.versionType,
          majorVersion: bumped.majorVersion,
          minorVersion: bumped.minorVersion,
          revision: bumped.revisionVersion,
          title: result.title,
          description: result.description,
          rationale: result.rationale,
          snapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
          diff: this.computeDiff(beforeSnapshot, afterSnapshot) as unknown as Prisma.InputJsonValue,
          changeSummary: dto.changeSummary?.trim() ?? `Explicit ${dto.versionType} version`,
          isActive: true,
          authorId: userId,
          workspaceId,
        },
      });
      return result;
    });

    await this.recordAudit(
      'FOUNDER_INTENT_VERSIONED',
      'FounderIntentVersion',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { version: existing.version },
      { version: updated.version, versionType: dto.versionType },
      true,
    );

    // IW-24: bind the amendment into the IURG (Amendment object + amended_by + supersedes).
    if (this.iurg) {
      try {
        await this.iurg.bindAmendmentEvent({
          workspaceId,
          actorId: userId,
          intentRef: updated.intentId,
          fromVersion: existing.version,
          toVersion: updated.version,
        });
      } catch {
        // IURG binding is governance-supporting; never block the version mutation.
      }
    }

    return updated;
  }

  async listVersions(id: string, workspaceId: string) {
    await this.loadIntentOrThrow(id, workspaceId);
    const versions = await this.prisma.founderIntentVersion.findMany({
      where: { intentId: id, workspaceId },
      orderBy: { versionNumber: 'asc' },
    });
    return {
      intentId: id,
      total: versions.length,
      active: versions.find((v) => v.isActive)?.versionNumber ?? null,
      versions,
    };
  }

  async compareVersions(id: string, workspaceId: string, query: CompareVersionsQueryDto) {
    await this.loadIntentOrThrow(id, workspaceId);
    const [from, to] = await Promise.all([
      this.prisma.founderIntentVersion.findFirst({
        where: { intentId: id, workspaceId, versionNumber: Number(query.from) },
      }),
      this.prisma.founderIntentVersion.findFirst({
        where: { intentId: id, workspaceId, versionNumber: Number(query.to) },
      }),
    ]);
    if (!from || !to) {
      throw new NotFoundException('One or both versions were not found');
    }
    const diff = this.computeDiff(
      from.snapshot as unknown as IntentSnapshot,
      to.snapshot as unknown as IntentSnapshot,
    );
    return {
      intentId: id,
      from: { versionNumber: from.versionNumber, snapshot: from.snapshot },
      to: { versionNumber: to.versionNumber, snapshot: to.snapshot },
      diff,
      changedFields: Object.keys(diff),
    };
  }

  // ----------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------

  async transitionLifecycle(
    id: string,
    workspaceId: string,
    userId: string,
    dto: TransitionLifecycleDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.loadIntentOrThrow(id, workspaceId);
      if (!isValidLifecycleTransition(existing.lifecycle, dto.to)) {
        throw new BadRequestException(
          `Invalid lifecycle transition: ${existing.lifecycle} -> ${dto.to}`,
        );
      }
      const updated = await this.prisma.founderIntent.update({
        where: { id: existing.id },
        data: { lifecycle: dto.to, status: dto.to },
      });
      await this.recordAudit(
        'FOUNDER_INTENT_LIFECYCLE_TRANSITION',
        'FounderIntent',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { lifecycle: existing.lifecycle },
        { lifecycle: updated.lifecycle, reason: dto.reason },
        true,
      );
      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'FOUNDER_INTENT_LIFECYCLE_TRANSITION',
        'FounderIntent',
        id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error), to: dto.to },
      );
      throw error;
    }
  }

  async approveIntent(
    id: string,
    workspaceId: string,
    userId: string,
    dto: ApproveIntentDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.loadIntentOrThrow(id, workspaceId);
    if (!isValidLifecycleTransition(existing.lifecycle, FounderIntentLifecycle.APPROVED)) {
      throw new BadRequestException(
        `Intent must be REVIEWED before approval (current: ${existing.lifecycle})`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.founderIntent.update({
        where: { id: existing.id },
        data: {
          lifecycle: FounderIntentLifecycle.APPROVED,
          status: FounderIntentLifecycle.APPROVED,
        },
      });
      const review = await tx.founderIntentReview.create({
        data: {
          intentId: existing.id,
          reviewerId: userId,
          decision: FounderIntentReviewDecision.APPROVED,
          constitutionalReferences: this.normalizeStringArray(dto.constitutionalReferences),
          notes: dto.notes?.trim() ?? 'Approved by founder authority',
          workspaceId,
        },
      });
      return { updated, review };
    });

    await this.recordAudit(
      'FOUNDER_INTENT_APPROVED',
      'FounderIntent',
      existing.id,
      ctx,
      workspaceId,
      userId,
      { lifecycle: existing.lifecycle },
      { lifecycle: FounderIntentLifecycle.APPROVED, reviewId: result.review.id },
      true,
    );
    await this.recordGovernanceEvidence(
      workspaceId,
      existing.ownerId,
      `Founder intent approved: ${existing.title}`,
      ctx,
    );

    return result.updated;
  }

  // ----------------------------------------------------------------------
  // Relationship graph
  // ----------------------------------------------------------------------

  async createRelationship(
    sourceIntentId: string,
    workspaceId: string,
    userId: string,
    dto: CreateRelationshipDto,
    ctx?: MutationAuditContext,
  ) {
    if (sourceIntentId === dto.targetIntentId) {
      throw new BadRequestException('An intent cannot relate to itself');
    }
    await this.loadIntentOrThrow(sourceIntentId, workspaceId);
    await this.loadIntentOrThrow(dto.targetIntentId, workspaceId);

    const created = await this.prisma.founderIntentRelationship.create({
      data: {
        sourceIntentId,
        targetIntentId: dto.targetIntentId,
        relationType: dto.relationType,
        notes: dto.notes?.trim(),
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        workspaceId,
        createdById: userId,
      },
    });

    await this.recordAudit(
      'FOUNDER_INTENT_RELATIONSHIP_CREATED',
      'FounderIntentRelationship',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, relationType: created.relationType },
      true,
    );

    return created;
  }

  async getRelationshipGraph(workspaceId: string) {
    const [intents, relationships] = await Promise.all([
      this.prisma.founderIntent.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          id: true,
          title: true,
          lifecycle: true,
          priority: true,
          dependencies: true,
        },
      }),
      this.prisma.founderIntentRelationship.findMany({
        where: { workspaceId, deletedAt: null },
      }),
    ]);

    const nodes = intents.map((intent) => ({
      id: intent.id,
      title: intent.title,
      lifecycle: intent.lifecycle,
      priority: intent.priority,
    }));
    const edges = relationships.map((rel) => ({
      id: rel.id,
      source: rel.sourceIntentId,
      target: rel.targetIntentId,
      relationType: rel.relationType,
    }));

    const cycles = this.detectCyclesFromGraph(intents, relationships);

    return { nodes, edges, cycles, hasCycles: cycles.length > 0 };
  }

  private buildDependencyAdjacency(
    intents: Array<{ id: string; dependencies: string[] }>,
    relationships: Array<{
      sourceIntentId: string;
      targetIntentId: string;
      relationType: FounderIntentRelationType;
    }>,
  ) {
    const adjacency = new Map<string, Set<string>>();
    const knownIds = new Set(intents.map((i) => i.id));
    const ensure = (id: string) => {
      if (!adjacency.has(id)) {
        adjacency.set(id, new Set());
      }
      return adjacency.get(id)!;
    };

    for (const intent of intents) {
      const set = ensure(intent.id);
      for (const dep of intent.dependencies ?? []) {
        if (knownIds.has(dep)) {
          set.add(dep);
        }
      }
    }
    for (const rel of relationships) {
      if (FIC_DEPENDENCY_RELATION_TYPES.includes(rel.relationType)) {
        ensure(rel.sourceIntentId).add(rel.targetIntentId);
      }
    }
    return adjacency;
  }

  private detectCyclesFromGraph(
    intents: Array<{ id: string; dependencies: string[] }>,
    relationships: Array<{
      sourceIntentId: string;
      targetIntentId: string;
      relationType: FounderIntentRelationType;
    }>,
  ): string[][] {
    const adjacency = this.buildDependencyAdjacency(intents, relationships);
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack: string[] = [];
    const inStack = new Set<string>();

    const dfs = (node: string) => {
      visited.add(node);
      stack.push(node);
      inStack.add(node);
      for (const next of adjacency.get(node) ?? []) {
        if (inStack.has(next)) {
          const idx = stack.indexOf(next);
          cycles.push(stack.slice(idx).concat(next));
        } else if (!visited.has(next)) {
          dfs(next);
        }
      }
      stack.pop();
      inStack.delete(node);
    };

    for (const intent of intents) {
      if (!visited.has(intent.id)) {
        dfs(intent.id);
      }
    }
    return cycles;
  }

  // ----------------------------------------------------------------------
  // Constitutional review
  // ----------------------------------------------------------------------

  async createReview(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CreateReviewDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.loadIntentOrThrow(id, workspaceId);

    const result = await this.prisma.$transaction(async (tx) => {
      const review = await tx.founderIntentReview.create({
        data: {
          intentId: existing.id,
          reviewerId: userId,
          decision: dto.decision,
          constitutionalReferences: this.normalizeStringArray(dto.constitutionalReferences),
          notes: dto.notes?.trim(),
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          workspaceId,
        },
      });

      // When a SUBMITTED intent is reviewed, advance lifecycle to REVIEWED.
      let updatedIntent = existing;
      if (
        existing.lifecycle === FounderIntentLifecycle.SUBMITTED &&
        (dto.decision === FounderIntentReviewDecision.APPROVED ||
          dto.decision === FounderIntentReviewDecision.REJECTED ||
          dto.decision === FounderIntentReviewDecision.CHANGES_REQUESTED)
      ) {
        updatedIntent = await tx.founderIntent.update({
          where: { id: existing.id },
          data: {
            lifecycle: FounderIntentLifecycle.REVIEWED,
            status: FounderIntentLifecycle.REVIEWED,
          },
        });
      }
      return { review, updatedIntent };
    });

    await this.recordAudit(
      'FOUNDER_INTENT_REVIEWED',
      'FounderIntentReview',
      result.review.id,
      ctx,
      workspaceId,
      userId,
      { lifecycle: existing.lifecycle },
      { decision: dto.decision, lifecycle: result.updatedIntent.lifecycle },
      true,
    );

    // IW-24: bind the review into the IURG (Review object + reviewed_under edge).
    if (this.iurg) {
      try {
        await this.iurg.bindReviewEvent({
          workspaceId,
          actorId: userId,
          intentRef: existing.intentId,
          decision: dto.decision,
          result: result.updatedIntent.lifecycle,
        });
      } catch {
        // IURG binding is governance-supporting; never block the review mutation.
      }
    }

    return result.review;
  }

  async listReviews(id: string, workspaceId: string) {
    await this.loadIntentOrThrow(id, workspaceId);
    const reviews = await this.prisma.founderIntentReview.findMany({
      where: { intentId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return { intentId: id, total: reviews.length, reviews };
  }

  // ----------------------------------------------------------------------
  // Founder override
  // ----------------------------------------------------------------------

  async overrideIntent(
    id: string,
    workspaceId: string,
    userId: string,
    dto: OverrideIntentDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.loadIntentOrThrow(id, workspaceId);
      if (!dto.reason?.trim()) {
        throw new BadRequestException('Override reason is required');
      }

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const data: Prisma.FounderIntentUpdateInput = {};

      switch (dto.overrideType) {
        case FounderOverrideType.PRIORITY:
          if (!dto.priority) {
            throw new BadRequestException('priority is required for a PRIORITY override');
          }
          before.priority = existing.priority;
          after.priority = dto.priority;
          data.priority = dto.priority;
          break;
        case FounderOverrideType.OWNERSHIP:
          if (!dto.ownerId?.trim()) {
            throw new BadRequestException('ownerId is required for an OWNERSHIP override');
          }
          before.ownerId = existing.ownerId;
          after.ownerId = dto.ownerId.trim();
          data.ownerId = dto.ownerId.trim();
          break;
        case FounderOverrideType.DEPENDENCY:
          if (dto.dependencies === undefined) {
            throw new BadRequestException('dependencies are required for a DEPENDENCY override');
          }
          before.dependencies = existing.dependencies;
          after.dependencies = this.normalizeStringArray(dto.dependencies);
          data.dependencies = after.dependencies as string[];
          break;
        case FounderOverrideType.STATUS:
          if (!dto.lifecycle) {
            throw new BadRequestException('lifecycle is required for a STATUS override');
          }
          before.lifecycle = existing.lifecycle;
          after.lifecycle = dto.lifecycle;
          data.lifecycle = dto.lifecycle;
          data.status = dto.lifecycle;
          break;
        case FounderOverrideType.CONSTITUTIONAL_ROUTING:
          if (!dto.constitutionalAuthority?.trim()) {
            throw new BadRequestException(
              'constitutionalAuthority is required for a CONSTITUTIONAL_ROUTING override',
            );
          }
          before.constitutionalAuthority = existing.constitutionalAuthority;
          after.constitutionalAuthority = dto.constitutionalAuthority.trim();
          data.constitutionalAuthority = dto.constitutionalAuthority.trim();
          break;
        default:
          throw new BadRequestException('Unsupported override type');
      }

      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.founderIntent.update({ where: { id: existing.id }, data });
        const event = await tx.founderOverrideEvent.create({
          data: {
            intentId: existing.id,
            overrideType: dto.overrideType,
            reason: dto.reason.trim(),
            before: before as Prisma.InputJsonValue,
            after: after as Prisma.InputJsonValue,
            operatorId: userId,
            workspaceId,
          },
        });
        return { updated, event };
      });

      await this.recordAudit(
        'FOUNDER_INTENT_OVERRIDDEN',
        'FounderOverrideEvent',
        result.event.id,
        ctx,
        workspaceId,
        userId,
        before,
        { ...after, overrideType: dto.overrideType, reason: dto.reason.trim() },
        true,
      );
      await this.recordGovernanceEvidence(
        workspaceId,
        result.updated.ownerId,
        `Founder override (${dto.overrideType}) applied to intent: ${existing.title}`,
        ctx,
      );

      return { intent: result.updated, override: result.event };
    } catch (error: any) {
      await this.recordAudit(
        'FOUNDER_INTENT_OVERRIDDEN',
        'FounderOverrideEvent',
        id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error), overrideType: dto.overrideType },
      );
      throw error;
    }
  }

  async listOverrides(id: string, workspaceId: string) {
    await this.loadIntentOrThrow(id, workspaceId);
    const overrides = await this.prisma.founderOverrideEvent.findMany({
      where: { intentId: id, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return { intentId: id, total: overrides.length, overrides };
  }

  // ----------------------------------------------------------------------
  // Conflict resolution engine
  // ----------------------------------------------------------------------

  private severityForType(type: FounderIntentConflictType): FounderIntentConflictSeverity {
    switch (type) {
      case FounderIntentConflictType.CIRCULAR_DEPENDENCY:
      case FounderIntentConflictType.AUTHORITY_CONFLICT:
        return FounderIntentConflictSeverity.CRITICAL;
      case FounderIntentConflictType.CONTRADICTION:
        return FounderIntentConflictSeverity.HIGH;
      case FounderIntentConflictType.DUPLICATE:
      case FounderIntentConflictType.PRIORITY_CONFLICT:
        return FounderIntentConflictSeverity.MEDIUM;
      case FounderIntentConflictType.SUPERSEDED:
      default:
        return FounderIntentConflictSeverity.LOW;
    }
  }

  async detectConflicts(
    id: string,
    workspaceId: string,
    userId: string,
    ctx?: MutationAuditContext,
  ) {
    const intent = await this.loadIntentOrThrow(id, workspaceId);

    const [others, relationships] = await Promise.all([
      this.prisma.founderIntent.findMany({
        where: { workspaceId, deletedAt: null, NOT: { id } },
      }),
      this.prisma.founderIntentRelationship.findMany({
        where: { workspaceId, deletedAt: null },
      }),
    ]);

    type DetectedConflict = {
      conflictType: FounderIntentConflictType;
      counterpartIntentId: string | null;
      description: string;
      recommendedResolution: string;
    };
    const detected: DetectedConflict[] = [];

    // 1. Duplicate — identical content hash or normalized title.
    const normalizedTitle = intent.title.trim().toLowerCase();
    for (const other of others) {
      if (
        other.contentHash === intent.contentHash ||
        other.title.trim().toLowerCase() === normalizedTitle
      ) {
        detected.push({
          conflictType: FounderIntentConflictType.DUPLICATE,
          counterpartIntentId: other.id,
          description: `Intent duplicates "${other.title}" (${other.id}).`,
          recommendedResolution:
            'Founder to merge intents or supersede one with the other; no automatic merge performed.',
        });
      }
    }

    // 2. Superseded — this intent is superseded, or depends on a superseded/deprecated intent.
    if (intent.supersededById) {
      detected.push({
        conflictType: FounderIntentConflictType.SUPERSEDED,
        counterpartIntentId: intent.supersededById,
        description: 'Intent has been superseded by a newer intent but is still active.',
        recommendedResolution: 'Founder to deprecate or archive the superseded intent.',
      });
    }
    const othersById = new Map(others.map((o) => [o.id, o]));
    for (const dep of intent.dependencies ?? []) {
      const target = othersById.get(dep);
      if (
        target &&
        (target.lifecycle === FounderIntentLifecycle.SUPERSEDED ||
          target.lifecycle === FounderIntentLifecycle.DEPRECATED ||
          target.lifecycle === FounderIntentLifecycle.ARCHIVED)
      ) {
        detected.push({
          conflictType: FounderIntentConflictType.SUPERSEDED,
          counterpartIntentId: target.id,
          description: `Intent depends on a retired intent "${target.title}" (${target.lifecycle}).`,
          recommendedResolution:
            'Founder to repoint the dependency to an active intent or retire this intent.',
        });
      }
    }

    // 3. Contradiction — mutual REPLACES, or mutual BLOCKS between this intent and another.
    const relsBySource = new Map<string, Set<string>>();
    for (const rel of relationships) {
      const key = `${rel.relationType}:${rel.sourceIntentId}`;
      if (!relsBySource.has(key)) {
        relsBySource.set(key, new Set());
      }
      relsBySource.get(key)!.add(rel.targetIntentId);
    }
    for (const rel of relationships) {
      if (
        rel.sourceIntentId === id &&
        (rel.relationType === FounderIntentRelationType.REPLACES ||
          rel.relationType === FounderIntentRelationType.BLOCKS)
      ) {
        const reverseKey = `${rel.relationType}:${rel.targetIntentId}`;
        if (relsBySource.get(reverseKey)?.has(id)) {
          detected.push({
            conflictType: FounderIntentConflictType.CONTRADICTION,
            counterpartIntentId: rel.targetIntentId,
            description: `Intent and ${rel.targetIntentId} mutually ${rel.relationType} each other.`,
            recommendedResolution:
              'Founder to choose a single authoritative intent; mutual contradiction cannot stand.',
          });
        }
      }
    }

    // 4. Circular dependency — cycle that includes this intent.
    const cycles = this.detectCyclesFromGraph(
      [intent, ...others].map((i) => ({ id: i.id, dependencies: i.dependencies ?? [] })),
      relationships,
    );
    for (const cycle of cycles) {
      if (cycle.includes(id)) {
        detected.push({
          conflictType: FounderIntentConflictType.CIRCULAR_DEPENDENCY,
          counterpartIntentId: cycle.find((c) => c !== id) ?? null,
          description: `Circular dependency detected: ${cycle.join(' -> ')}.`,
          recommendedResolution:
            'Founder to break the cycle by removing or re-typing one dependency edge.',
        });
      }
    }

    // 5. Priority conflict — intent DEPENDS_ON a lower-priority intent.
    for (const dep of intent.dependencies ?? []) {
      const target = othersById.get(dep);
      if (!target) {
        continue;
      }
      const intentRank = FIC_PRIORITY_RANK[intent.priority] ?? 99;
      const targetRank = FIC_PRIORITY_RANK[target.priority] ?? 99;
      if (targetRank > intentRank) {
        detected.push({
          conflictType: FounderIntentConflictType.PRIORITY_CONFLICT,
          counterpartIntentId: target.id,
          description: `Intent (${intent.priority}) depends on lower-priority intent "${target.title}" (${target.priority}).`,
          recommendedResolution:
            'Founder to raise the dependency priority or lower this intent priority.',
        });
      }
    }

    // 6. Authority conflict — this intent GOVERNS/REPLACES a higher-authority intent.
    for (const rel of relationships) {
      if (
        rel.sourceIntentId === id &&
        (rel.relationType === FounderIntentRelationType.GOVERNS ||
          rel.relationType === FounderIntentRelationType.REPLACES)
      ) {
        const target = othersById.get(rel.targetIntentId);
        if (
          target &&
          authorityRank(target.constitutionalAuthority) >
            authorityRank(intent.constitutionalAuthority)
        ) {
          detected.push({
            conflictType: FounderIntentConflictType.AUTHORITY_CONFLICT,
            counterpartIntentId: target.id,
            description: `Intent (${intent.constitutionalAuthority}) attempts to ${rel.relationType} higher-authority intent "${target.title}" (${target.constitutionalAuthority}).`,
            recommendedResolution:
              'Founder to escalate constitutional authority or withdraw the governing relationship.',
          });
        }
      }
    }

    // Persist newly detected conflicts (idempotent on open conflicts of same type+counterpart).
    const existingOpen = await this.prisma.founderIntentConflict.findMany({
      where: { intentId: id, workspaceId, status: FounderIntentConflictStatus.OPEN },
    });
    const openKey = new Set(
      existingOpen.map((c) => `${c.conflictType}:${c.counterpartIntentId ?? ''}`),
    );

    const persisted = [] as Array<{ id: string; conflictType: FounderIntentConflictType }>;
    for (const conflict of detected) {
      const key = `${conflict.conflictType}:${conflict.counterpartIntentId ?? ''}`;
      if (openKey.has(key)) {
        continue;
      }
      openKey.add(key);
      const severity = this.severityForType(conflict.conflictType);
      const record = await this.prisma.founderIntentConflict.create({
        data: {
          intentId: id,
          counterpartIntentId: conflict.counterpartIntentId,
          conflictType: conflict.conflictType,
          severity,
          status: FounderIntentConflictStatus.OPEN,
          description: conflict.description,
          recommendedResolution: conflict.recommendedResolution,
          workspaceId,
          detectedById: userId,
        },
      });
      persisted.push({ id: record.id, conflictType: record.conflictType });
    }

    await this.recordAudit(
      'FOUNDER_INTENT_CONFLICTS_DETECTED',
      'FounderIntentConflict',
      id,
      ctx,
      workspaceId,
      userId,
      null,
      { detected: detected.length, persisted: persisted.length },
      true,
    );

    return {
      intentId: id,
      totalDetected: detected.length,
      newlyPersisted: persisted.length,
      autoResolution: false,
      report: detected
        .map((conflict) => ({
          ...conflict,
          severity: this.severityForType(conflict.conflictType),
        }))
        .sort(
          (a, b) =>
            FIC_CONFLICT_SEVERITY_ORDER[b.severity] - FIC_CONFLICT_SEVERITY_ORDER[a.severity],
        ),
    };
  }

  async listConflicts(workspaceId: string, query: ConflictListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.FounderIntentConflictWhereInput = {
      workspaceId,
      ...(query.status && { status: query.status }),
      ...(query.severity && { severity: query.severity }),
    };

    const [items, total] = await Promise.all([
      this.prisma.founderIntentConflict.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.FounderIntentConflictOrderByWithRelationInput,
      }),
      this.prisma.founderIntentConflict.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async resolveConflict(
    conflictId: string,
    workspaceId: string,
    userId: string,
    dto: ResolveConflictDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.prisma.founderIntentConflict.findFirst({
      where: { id: conflictId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Conflict not found');
    }
    if (
      dto.status !== FounderIntentConflictStatus.RESOLVED &&
      dto.status !== FounderIntentConflictStatus.DISMISSED &&
      dto.status !== FounderIntentConflictStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException('Conflicts can only be acknowledged, resolved, or dismissed');
    }

    const resolved = dto.status === FounderIntentConflictStatus.RESOLVED;
    const updated = await this.prisma.founderIntentConflict.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        resolvedById: resolved ? userId : existing.resolvedById,
        resolvedAt: resolved ? new Date() : existing.resolvedAt,
        metadata: {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          ...(dto.notes ? { resolutionNotes: dto.notes } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    await this.recordAudit(
      'FOUNDER_INTENT_CONFLICT_RESOLVED',
      'FounderIntentConflict',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: existing.status },
      { status: updated.status },
      true,
    );

    return updated;
  }

  // ----------------------------------------------------------------------
  // History
  // ----------------------------------------------------------------------

  async getHistory(id: string, workspaceId: string) {
    await this.loadIntentOrThrow(id, workspaceId);
    const [versions, reviews, overrides, conflicts] = await Promise.all([
      this.prisma.founderIntentVersion.findMany({
        where: { intentId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.founderIntentReview.findMany({
        where: { intentId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.founderOverrideEvent.findMany({
        where: { intentId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.founderIntentConflict.findMany({
        where: { intentId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const timeline = [
      ...versions.map((v) => ({
        type: 'VERSION' as const,
        at: v.createdAt,
        ref: v.id,
        detail: { versionNumber: v.versionNumber, versionType: v.versionType },
      })),
      ...reviews.map((r) => ({
        type: 'REVIEW' as const,
        at: r.createdAt,
        ref: r.id,
        detail: { decision: r.decision },
      })),
      ...overrides.map((o) => ({
        type: 'OVERRIDE' as const,
        at: o.createdAt,
        ref: o.id,
        detail: { overrideType: o.overrideType },
      })),
      ...conflicts.map((c) => ({
        type: 'CONFLICT' as const,
        at: c.createdAt,
        ref: c.id,
        detail: { conflictType: c.conflictType, severity: c.severity, status: c.status },
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      intentId: id,
      counts: {
        versions: versions.length,
        reviews: reviews.length,
        overrides: overrides.length,
        conflicts: conflicts.length,
      },
      timeline,
    };
  }
}

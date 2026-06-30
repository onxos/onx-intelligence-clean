import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorityLevel,
  IntelligenceLifecycleState,
  IntelligenceObjectType,
  IntelligenceRelationshipType,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  D16_OBJECT_TYPES,
  D16_PROVENANCE_DIMENSIONS,
  isValidLifecycleTransition,
  LIFECYCLE_TRANSITIONS,
} from './intelligence-object.constants';
import {
  CreateIntelligenceObjectDto,
  CreateProvenanceDto,
  CreateRelationshipDto,
  IntelligenceObjectListQueryDto,
  LifecycleTransitionDto,
  UpdateIntelligenceObjectDto,
} from './dto/intelligence-object.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type ValidationIssue = { rule: string; message: string };

@Injectable()
export class IntelligenceObjectService {
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
      resourceType: 'IntelligenceObject',
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

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateIntelligenceObjectDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      if (!dto.content?.trim()) {
        throw new BadRequestException('content is required');
      }
      if (!Object.values(IntelligenceObjectType).includes(dto.objectType)) {
        throw new BadRequestException('objectType is invalid');
      }
      this.assertScore(dto.trustScore, 'trustScore');
      this.assertScore(dto.confidenceScore, 'confidenceScore');
      this.assertScore(dto.amanahScore, 'amanahScore');
      this.assertScore(dto.qualityIndex, 'qualityIndex');

      const lifecycleState = dto.lifecycleState ?? 'DRAFT';

      const created = await this.prisma.$transaction(async (tx) => {
        const obj = await tx.intelligenceObject.create({
          data: {
            name: dto.name,
            content: dto.content,
            contentHash: this.hash(dto.content),
            objectType: dto.objectType,
            semanticSummary: dto.semanticSummary,
            lifecycleState,
            authorityLevel: dto.authorityLevel ?? 'OPERATIONAL',
            ...(dto.ownershipClass && { ownershipClass: dto.ownershipClass }),
            ...(dto.privacyLevel && { privacyLevel: dto.privacyLevel }),
            ...(dto.capitalCategory && { capitalCategory: dto.capitalCategory }),
            ...(dto.trustScore !== undefined && { trustScore: dto.trustScore }),
            ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
            ...(dto.amanahScore !== undefined && { amanahScore: dto.amanahScore }),
            ...(dto.qualityIndex !== undefined && { qualityIndex: dto.qualityIndex }),
            ownerId: userId,
            creatorId: userId,
            workspaceId,
          },
        });

        await tx.intelligenceObjectLifecycleEvent.create({
          data: {
            objectId: obj.id,
            fromState: null,
            toState: lifecycleState,
            actorId: userId,
            workspaceId,
            reason: 'Object created',
          },
        });

        return obj;
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_CREATED',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, objectType: created.objectType, lifecycleState: created.lifecycleState },
        true,
      );

      return created;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_OBJECT_CREATED',
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

  async findAll(workspaceId: string, userId: string, query: IntelligenceObjectListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const and: Prisma.IntelligenceObjectWhereInput[] = [
      { OR: [{ ownerId: userId }, { creatorId: userId }] },
    ];
    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { content: { contains: query.search, mode: 'insensitive' } },
          { semanticSummary: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.IntelligenceObjectWhereInput = {
      workspaceId,
      deletedAt: null,
      AND: and,
      ...(query.type && { objectType: query.type }),
      ...(query.lifecycleState && { lifecycleState: query.lifecycleState }),
    };

    const [items, total] = await Promise.all([
      this.prisma.intelligenceObject.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.IntelligenceObjectOrderByWithRelationInput,
      }),
      this.prisma.intelligenceObject.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, workspaceId: string, userId: string) {
    const obj = await this.prisma.intelligenceObject.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
        OR: [{ ownerId: userId }, { creatorId: userId }],
      },
    });
    if (!obj) {
      throw new NotFoundException('Intelligence object not found');
    }
    return obj;
  }

  async update(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateIntelligenceObjectDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceObjectService['findOne']>> | null = null;
    try {
      if (dto.name !== undefined && !dto.name.trim()) {
        throw new BadRequestException('name cannot be empty');
      }
      if (dto.content !== undefined && !dto.content.trim()) {
        throw new BadRequestException('content cannot be empty');
      }
      if (
        dto.objectType !== undefined &&
        !Object.values(IntelligenceObjectType).includes(dto.objectType)
      ) {
        throw new BadRequestException('objectType is invalid');
      }
      this.assertScore(dto.trustScore, 'trustScore');
      this.assertScore(dto.confidenceScore, 'confidenceScore');
      this.assertScore(dto.qualityIndex, 'qualityIndex');

      existing = await this.findOne(id, workspaceId, userId);

      const updated = await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.content !== undefined && {
            content: dto.content,
            contentHash: this.hash(dto.content),
          }),
          ...(dto.objectType !== undefined && { objectType: dto.objectType }),
          ...(dto.semanticSummary !== undefined && { semanticSummary: dto.semanticSummary }),
          ...(dto.authorityLevel !== undefined && { authorityLevel: dto.authorityLevel }),
          ...(dto.privacyLevel !== undefined && { privacyLevel: dto.privacyLevel }),
          ...(dto.capitalCategory !== undefined && { capitalCategory: dto.capitalCategory }),
          ...(dto.trustScore !== undefined && { trustScore: dto.trustScore }),
          ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
          ...(dto.qualityIndex !== undefined && { qualityIndex: dto.qualityIndex }),
        },
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_UPDATED',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { name: existing.name, objectType: existing.objectType },
        { name: updated.name, objectType: updated.objectType },
        true,
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_OBJECT_UPDATED',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        existing ? { name: existing.name } : null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async remove(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    let existing: Awaited<ReturnType<IntelligenceObjectService['findOne']>> | null = null;
    try {
      existing = await this.findOne(id, workspaceId, userId);
      const removed = await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_DELETED',
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
        'INTELLIGENCE_OBJECT_DELETED',
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

  async restore(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    try {
      const existing = await this.prisma.intelligenceObject.findFirst({
        where: {
          id,
          workspaceId,
          deletedAt: { not: null },
          OR: [{ ownerId: userId }, { creatorId: userId }],
        },
      });
      if (!existing) {
        throw new NotFoundException('Soft-deleted intelligence object not found');
      }

      const restored = await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_RESTORED',
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
        'INTELLIGENCE_OBJECT_RESTORED',
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

  async transitionLifecycle(
    id: string,
    workspaceId: string,
    userId: string,
    dto: LifecycleTransitionDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceObjectService['findOne']>> | null = null;
    try {
      existing = await this.findOne(id, workspaceId, userId);
      const from = existing.lifecycleState;
      const to = dto.toState;

      if (!isValidLifecycleTransition(from, to)) {
        throw new BadRequestException(
          `Invalid lifecycle transition from ${from} to ${to}. Allowed: ${
            LIFECYCLE_TRANSITIONS[from]?.join(', ') || 'none'
          }`,
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.intelligenceObject.update({
          where: { id: existing!.id },
          data: { lifecycleState: to },
        });
        await tx.intelligenceObjectLifecycleEvent.create({
          data: {
            objectId: next.id,
            fromState: from,
            toState: to,
            actorId: userId,
            workspaceId,
            reason: dto.reason,
          },
        });
        return next;
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_LIFECYCLE_CHANGED',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { lifecycleState: from },
        { lifecycleState: to },
        true,
        { reason: dto.reason },
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_OBJECT_LIFECYCLE_CHANGED',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        existing ? { lifecycleState: existing.lifecycleState } : null,
        null,
        false,
        { error: String(error?.message ?? error), attemptedState: dto.toState },
      );
      throw error;
    }
  }

  async listLifecycleEvents(id: string, workspaceId: string, userId: string) {
    await this.findOne(id, workspaceId, userId);
    return this.prisma.intelligenceObjectLifecycleEvent.findMany({
      where: { objectId: id, workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRelationship(
    sourceObjectId: string,
    workspaceId: string,
    userId: string,
    dto: CreateRelationshipDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!Object.values(IntelligenceRelationshipType).includes(dto.relationshipType)) {
        throw new BadRequestException('relationshipType is invalid');
      }
      if (sourceObjectId === dto.targetObjectId) {
        throw new BadRequestException('A relationship cannot reference the same object');
      }

      const source = await this.findOne(sourceObjectId, workspaceId, userId);
      const target = await this.prisma.intelligenceObject.findFirst({
        where: { id: dto.targetObjectId, workspaceId, deletedAt: null },
      });
      if (!target) {
        throw new BadRequestException('targetObjectId must reference an object in this workspace');
      }

      const relationship = await this.prisma.intelligenceObjectRelationship.create({
        data: {
          sourceObjectId: source.id,
          targetObjectId: target.id,
          relationshipType: dto.relationshipType,
          workspaceId,
          createdById: userId,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_RELATIONSHIP_CREATED',
        relationship.id,
        ctx,
        workspaceId,
        userId,
        null,
        {
          id: relationship.id,
          sourceObjectId: relationship.sourceObjectId,
          targetObjectId: relationship.targetObjectId,
          relationshipType: relationship.relationshipType,
        },
        true,
      );

      return relationship;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_OBJECT_RELATIONSHIP_CREATED',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error), sourceObjectId },
      );
      throw error;
    }
  }

  async listRelationships(id: string, workspaceId: string, userId: string) {
    await this.findOne(id, workspaceId, userId);
    const [outgoing, incoming] = await Promise.all([
      this.prisma.intelligenceObjectRelationship.findMany({
        where: { sourceObjectId: id, workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.intelligenceObjectRelationship.findMany({
        where: { targetObjectId: id, workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { outgoing, incoming };
  }

  async addProvenance(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CreateProvenanceDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      const missing = D16_PROVENANCE_DIMENSIONS.filter(
        (dim) =>
          dim !== 'verificationStatus' &&
          dim !== 'confidence' &&
          dim !== 'authorityLevel' &&
          dim !== 'recordedAt',
      ).filter((dim) => !String((dto as unknown as Record<string, unknown>)[dim] ?? '').trim());
      if (missing.length > 0) {
        throw new BadRequestException(`Missing provenance dimensions: ${missing.join(', ')}`);
      }
      this.assertScore(dto.confidence, 'confidence');

      const object = await this.findOne(id, workspaceId, userId);

      const provenance = await this.prisma.intelligenceObjectProvenance.create({
        data: {
          objectId: object.id,
          sourceIdentity: dto.sourceIdentity,
          origin: dto.origin,
          creator: dto.creator,
          extractionMethod: dto.extractionMethod,
          verificationStatus: dto.verificationStatus ?? 'UNVERIFIED',
          confidence: dto.confidence ?? 0.5,
          authorityLevel: dto.authorityLevel ?? 'OPERATIONAL',
          workspaceId,
          createdById: userId,
        },
      });

      await this.recordAudit(
        'INTELLIGENCE_OBJECT_PROVENANCE_RECORDED',
        provenance.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: provenance.id, objectId: provenance.objectId },
        true,
      );

      return provenance;
    } catch (error: any) {
      await this.recordAudit(
        'INTELLIGENCE_OBJECT_PROVENANCE_RECORDED',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error), objectId: id },
      );
      throw error;
    }
  }

  async retrieveProvenance(id: string, workspaceId: string, userId: string) {
    await this.findOne(id, workspaceId, userId);
    return this.prisma.intelligenceObjectProvenance.findMany({
      where: { objectId: id, workspaceId },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async retrieveLineage(id: string, workspaceId: string, userId: string) {
    const root = await this.findOne(id, workspaceId, userId);
    const lineageTypes: IntelligenceRelationshipType[] = ['DERIVES_FROM', 'DEPENDS_ON', 'REFINES'];

    const visited = new Set<string>([root.id]);
    const ancestors: Array<{
      objectId: string;
      via: IntelligenceRelationshipType;
      targetObjectId: string;
      depth: number;
    }> = [];

    let frontier = [root.id];
    let depth = 0;
    const maxDepth = 25;

    while (frontier.length > 0 && depth < maxDepth) {
      depth += 1;
      const edges = await this.prisma.intelligenceObjectRelationship.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          sourceObjectId: { in: frontier },
          relationshipType: { in: lineageTypes },
        },
      });

      const next: string[] = [];
      for (const edge of edges) {
        ancestors.push({
          objectId: edge.sourceObjectId,
          via: edge.relationshipType,
          targetObjectId: edge.targetObjectId,
          depth,
        });
        if (!visited.has(edge.targetObjectId)) {
          visited.add(edge.targetObjectId);
          next.push(edge.targetObjectId);
        }
      }
      frontier = next;
    }

    return { objectId: root.id, depth: depth, lineage: ancestors };
  }

  /**
   * Runs the full D16 validation rule set against an object without mutating it.
   */
  async validate(id: string, workspaceId: string, userId: string) {
    const object = await this.findOne(id, workspaceId, userId);
    const issues: ValidationIssue[] = [];

    // required field validation
    if (!object.name?.trim()) {
      issues.push({ rule: 'required_field', message: 'name is required' });
    }
    if (!object.content?.trim()) {
      issues.push({ rule: 'required_field', message: 'content is required' });
    }
    if (!object.contentHash) {
      issues.push({ rule: 'required_field', message: 'contentHash is required' });
    }

    // type validation
    if (!Object.values(IntelligenceObjectType).includes(object.objectType)) {
      issues.push({ rule: 'type', message: 'objectType is not a recognised type' });
    }
    const isCanonicalD16Type = D16_OBJECT_TYPES.includes(object.objectType);

    // lifecycle validation
    if (!Object.values(IntelligenceLifecycleState).includes(object.lifecycleState)) {
      issues.push({ rule: 'lifecycle', message: 'lifecycleState is not a recognised state' });
    }

    // trust score validation
    for (const [field, value] of Object.entries({
      trustScore: object.trustScore,
      confidenceScore: object.confidenceScore,
      amanahScore: object.amanahScore,
      qualityIndex: object.qualityIndex,
    })) {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        issues.push({ rule: 'trust_score', message: `${field} must be between 0 and 1` });
      }
    }

    // authority level validation
    if (!Object.values(AuthorityLevel).includes(object.authorityLevel)) {
      issues.push({ rule: 'authority_level', message: 'authorityLevel is invalid' });
    }

    // ownership validation
    if (!object.ownerId) {
      issues.push({ rule: 'ownership', message: 'ownerId is required' });
    }
    const owner = await this.prisma.user.findFirst({
      where: { id: object.ownerId, workspaceId },
    });
    if (!owner) {
      issues.push({ rule: 'ownership', message: 'owner must belong to the object workspace' });
    }

    // relationship validation
    const relationships = await this.prisma.intelligenceObjectRelationship.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [{ sourceObjectId: object.id }, { targetObjectId: object.id }],
      },
    });
    for (const rel of relationships) {
      if (rel.sourceObjectId === rel.targetObjectId) {
        issues.push({
          rule: 'relationship',
          message: `relationship ${rel.id} is self-referential`,
        });
      }
      if (!Object.values(IntelligenceRelationshipType).includes(rel.relationshipType)) {
        issues.push({
          rule: 'relationship',
          message: `relationship ${rel.id} has an invalid type`,
        });
      }
    }

    // provenance validation
    const provenance = await this.prisma.intelligenceObjectProvenance.findMany({
      where: { objectId: object.id, workspaceId },
    });
    for (const prov of provenance) {
      const provMissing = ['sourceIdentity', 'origin', 'creator', 'extractionMethod'].filter(
        (dim) => !String((prov as unknown as Record<string, unknown>)[dim] ?? '').trim(),
      );
      if (provMissing.length > 0) {
        issues.push({
          rule: 'provenance',
          message: `provenance ${prov.id} missing: ${provMissing.join(', ')}`,
        });
      }
    }

    return {
      objectId: object.id,
      valid: issues.length === 0,
      canonicalD16Type: isCanonicalD16Type,
      provenanceCount: provenance.length,
      relationshipCount: relationships.length,
      issues,
    };
  }
}

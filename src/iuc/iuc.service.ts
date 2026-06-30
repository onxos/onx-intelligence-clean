import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuthorityLevel,
  IUCEntity,
  Prisma,
  UnderstandingEventType,
  UnderstandingStateType,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  IUC_SORT_FIELDS,
  isValidUnderstandingTransition,
  UNDERSTANDING_ESTABLISHED_MIN_PROGRESS,
  UNDERSTANDING_INSTITUTIONALIZED_MIN_PROGRESS,
} from './iuc.constants';
import {
  AddUnderstandingEvidenceDto,
  CreateIUCDto,
  CreateUnderstandingRelationshipDto,
  EvolveUnderstandingDto,
  IUCListQueryDto,
  TransitionUnderstandingStateDto,
  UpdateConfidenceDto,
  UpdateIUCDto,
  UpdateProgressDto,
} from './dto/iuc.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class IUCService {
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

  private async loadIucOrThrow(id: string, workspaceId: string) {
    const iuc = await this.prisma.iUCEntity.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!iuc) {
      throw new NotFoundException('IUC entity not found');
    }
    return iuc;
  }

  private snapshot(iuc: IUCEntity) {
    return {
      id: iuc.id,
      iucId: iuc.iucId,
      title: iuc.title,
      domain: iuc.domain,
      state: iuc.state,
      progress: iuc.progress,
      confidence: iuc.confidence,
      authority: iuc.authority,
      capitalId: iuc.capitalId,
      deletedAt: iuc.deletedAt,
    };
  }

  // ----------------------------------------------------------------------
  // Part D.1 — IUC entity CRUD
  // ----------------------------------------------------------------------

  async createIuc(
    workspaceId: string,
    userId: string,
    dto: CreateIUCDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.title?.trim()) {
        throw new BadRequestException('title is required');
      }
      const ownerId = dto.ownerId?.trim() || userId;

      if (dto.capitalId) {
        const capital = await this.prisma.intelligenceCapital.findFirst({
          where: { id: dto.capitalId, workspaceId, deletedAt: null },
        });
        if (!capital) {
          throw new BadRequestException('capitalId must reference active intelligence capital');
        }
      }

      const created = await this.prisma.$transaction(async (tx) => {
        const iuc = await tx.iUCEntity.create({
          data: {
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            domain: dto.domain?.trim() || null,
            ownerId,
            workspaceId,
            state: UnderstandingStateType.NASCENT,
            progress: this.round(dto.progress ?? 0),
            confidence: this.round(dto.confidence ?? 0),
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            capitalId: dto.capitalId || null,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await tx.understandingEvent.create({
          data: {
            iucId: iuc.id,
            eventType: UnderstandingEventType.STATE_TRANSITION,
            toState: UnderstandingStateType.NASCENT,
            progressAfter: iuc.progress,
            confidenceAfter: iuc.confidence,
            actorId: ownerId,
            workspaceId,
            notes: 'Understanding initialised',
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        return iuc;
      });

      await this.recordAudit(
        'IUC_CREATED',
        'IUCEntity',
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
        `Intelligence understanding established: ${created.title}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'IUC_CREATED',
        'IUCEntity',
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

  async listIuc(workspaceId: string, query?: IUCListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = (IUC_SORT_FIELDS as readonly string[]).includes(query?.sortBy as string)
      ? (query?.sortBy as string)
      : 'createdAt';
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';
    const search = query?.search?.trim();

    const where: Prisma.IUCEntityWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.state && { state: query.state }),
      ...(query?.domain && { domain: query.domain }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.iUCEntity.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.IUCEntityOrderByWithRelationInput,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.iUCEntity.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getIuc(id: string, workspaceId: string) {
    const iuc = await this.loadIucOrThrow(id, workspaceId);
    const [events, evidence, outgoing, incoming] = await Promise.all([
      this.prisma.understandingEvent.findMany({
        where: { iucId: iuc.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.understandingEvidence.findMany({
        where: { iucId: iuc.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.understandingRelationship.findMany({
        where: { sourceIucId: iuc.id, deletedAt: null },
      }),
      this.prisma.understandingRelationship.findMany({
        where: { targetIucId: iuc.id, deletedAt: null },
      }),
    ]);
    return { ...iuc, events, evidence, outgoingRelations: outgoing, incomingRelations: incoming };
  }

  async updateIuc(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateIUCDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    try {
      if (dto.capitalId) {
        const capital = await this.prisma.intelligenceCapital.findFirst({
          where: { id: dto.capitalId, workspaceId, deletedAt: null },
        });
        if (!capital) {
          throw new BadRequestException('capitalId must reference active intelligence capital');
        }
      }
      const updated = await this.prisma.iUCEntity.update({
        where: { id: before.id },
        data: {
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.domain !== undefined && { domain: dto.domain?.trim() || null }),
          ...(dto.authority !== undefined && { authority: dto.authority }),
          ...(dto.capitalId !== undefined && { capitalId: dto.capitalId || null }),
          ...(dto.metadata !== undefined && {
            metadata: dto.metadata as Prisma.InputJsonValue,
          }),
        },
      });
      await this.recordAudit(
        'IUC_UPDATED',
        'IUCEntity',
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
        'IUC_UPDATED',
        'IUCEntity',
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

  async removeIuc(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    const updated = await this.prisma.iUCEntity.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
    await this.recordAudit(
      'IUC_ARCHIVED',
      'IUCEntity',
      updated.id,
      ctx,
      workspaceId,
      userId,
      this.snapshot(before),
      this.snapshot(updated),
      true,
    );
    return { id: updated.id, deletedAt: updated.deletedAt, status: updated.status };
  }

  // ----------------------------------------------------------------------
  // Part D.2 — Understanding state machine
  // ----------------------------------------------------------------------

  async transitionState(
    id: string,
    workspaceId: string,
    userId: string,
    dto: TransitionUnderstandingStateDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    try {
      if (!isValidUnderstandingTransition(before.state, dto.state)) {
        throw new BadRequestException(
          `Invalid understanding state transition: ${before.state} -> ${dto.state}`,
        );
      }
      if (dto.state === 'ESTABLISHED' && before.progress < UNDERSTANDING_ESTABLISHED_MIN_PROGRESS) {
        throw new BadRequestException(
          `Understanding must reach ${UNDERSTANDING_ESTABLISHED_MIN_PROGRESS} progress before it can be ESTABLISHED`,
        );
      }
      if (
        dto.state === 'INSTITUTIONALIZED' &&
        before.progress < UNDERSTANDING_INSTITUTIONALIZED_MIN_PROGRESS
      ) {
        throw new BadRequestException(
          `Understanding must reach ${UNDERSTANDING_INSTITUTIONALIZED_MIN_PROGRESS} progress before it can be INSTITUTIONALIZED`,
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const entity = await tx.iUCEntity.update({
          where: { id: before.id },
          data: { state: dto.state },
        });
        await tx.understandingEvent.create({
          data: {
            iucId: before.id,
            eventType: UnderstandingEventType.STATE_TRANSITION,
            fromState: before.state,
            toState: dto.state,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            notes: dto.notes?.trim() || null,
            metadata: {} as Prisma.InputJsonValue,
          },
        });
        return entity;
      });

      await this.recordAudit(
        'IUC_STATE_TRANSITIONED',
        'IUCEntity',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(updated),
        true,
        { from: before.state, to: dto.state },
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'IUC_STATE_TRANSITIONED',
        'IUCEntity',
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
  // Part D.3 — Progress + confidence
  // ----------------------------------------------------------------------

  async updateProgress(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateProgressDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    const progress = this.round(dto.progress);
    const updated = await this.prisma.$transaction(async (tx) => {
      const entity = await tx.iUCEntity.update({
        where: { id: before.id },
        data: { progress },
      });
      await tx.understandingEvent.create({
        data: {
          iucId: before.id,
          eventType: UnderstandingEventType.PROGRESS_UPDATE,
          progressBefore: before.progress,
          progressAfter: progress,
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          notes: dto.notes?.trim() || null,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
      return entity;
    });
    await this.recordAudit(
      'IUC_PROGRESS_UPDATED',
      'IUCEntity',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { progress: before.progress },
      { progress },
      true,
    );
    return updated;
  }

  async updateConfidence(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateConfidenceDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    const confidence = this.round(dto.confidence);
    const updated = await this.prisma.$transaction(async (tx) => {
      const entity = await tx.iUCEntity.update({
        where: { id: before.id },
        data: { confidence },
      });
      await tx.understandingEvent.create({
        data: {
          iucId: before.id,
          eventType: UnderstandingEventType.CONFIDENCE_UPDATE,
          confidenceBefore: before.confidence,
          confidenceAfter: confidence,
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          notes: dto.notes?.trim() || null,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
      return entity;
    });
    await this.recordAudit(
      'IUC_CONFIDENCE_UPDATED',
      'IUCEntity',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { confidence: before.confidence },
      { confidence },
      true,
    );
    return updated;
  }

  // ----------------------------------------------------------------------
  // Part D.4 — Evolution
  // ----------------------------------------------------------------------

  async evolve(
    id: string,
    workspaceId: string,
    userId: string,
    dto: EvolveUnderstandingDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    try {
      if (!dto.reason?.trim()) {
        throw new BadRequestException('reason is required to evolve an understanding');
      }
      if (before.state === 'DEPRECATED') {
        throw new BadRequestException('A deprecated understanding cannot evolve');
      }
      const progress = dto.progress !== undefined ? this.round(dto.progress) : before.progress;
      const confidence =
        dto.confidence !== undefined ? this.round(dto.confidence) : before.confidence;

      const updated = await this.prisma.$transaction(async (tx) => {
        const entity = await tx.iUCEntity.update({
          where: { id: before.id },
          data: { state: UnderstandingStateType.EVOLVING, progress, confidence },
        });
        await tx.understandingEvent.create({
          data: {
            iucId: before.id,
            eventType: UnderstandingEventType.EVOLUTION,
            fromState: before.state,
            toState: UnderstandingStateType.EVOLVING,
            progressBefore: before.progress,
            progressAfter: progress,
            confidenceBefore: before.confidence,
            confidenceAfter: confidence,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            notes: dto.reason.trim(),
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        return entity;
      });

      await this.recordAudit(
        'IUC_EVOLVED',
        'IUCEntity',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(updated),
        true,
        { reason: dto.reason.trim() },
      );
      await this.recordEvidence(
        workspaceId,
        before.ownerId,
        `Understanding evolved: ${before.title}`,
        ctx,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'IUC_EVOLVED',
        'IUCEntity',
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
  // Part D.5 — Evidence
  // ----------------------------------------------------------------------

  async addEvidence(
    id: string,
    workspaceId: string,
    userId: string,
    dto: AddUnderstandingEvidenceDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadIucOrThrow(id, workspaceId);
    if (!dto.description?.trim()) {
      throw new BadRequestException('description is required');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.understandingEvidence.create({
        data: {
          iucId: before.id,
          evidenceRecordId: dto.evidenceRecordId || null,
          objectId: dto.objectId || null,
          description: dto.description.trim(),
          weight: this.round(dto.weight ?? 1),
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await tx.understandingEvent.create({
        data: {
          iucId: before.id,
          eventType: UnderstandingEventType.EVIDENCE_LINKED,
          actorId: ctx?.actorId ?? userId,
          workspaceId,
          notes: dto.description.trim(),
          metadata: { evidenceId: record.id } as Prisma.InputJsonValue,
        },
      });
      return record;
    });

    await this.recordAudit(
      'IUC_EVIDENCE_ADDED',
      'UnderstandingEvidence',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, iucId: before.id, weight: created.weight },
      true,
    );
    await this.recordEvidence(
      workspaceId,
      before.ownerId,
      `Evidence linked to understanding: ${before.title}`,
      ctx,
    );
    return created;
  }

  // ----------------------------------------------------------------------
  // Part D.6 — Relationships
  // ----------------------------------------------------------------------

  async createRelationship(
    id: string,
    workspaceId: string,
    userId: string,
    dto: CreateUnderstandingRelationshipDto,
    ctx?: MutationAuditContext,
  ) {
    const source = await this.loadIucOrThrow(id, workspaceId);
    try {
      if (dto.targetIucId === source.id) {
        throw new BadRequestException('An understanding cannot relate to itself');
      }
      await this.loadIucOrThrow(dto.targetIucId, workspaceId);

      const existing = await this.prisma.understandingRelationship.findFirst({
        where: {
          sourceIucId: source.id,
          targetIucId: dto.targetIucId,
          relationType: dto.relationType,
          deletedAt: null,
        },
      });
      if (existing) {
        throw new BadRequestException('This relationship already exists');
      }

      const created = await this.prisma.understandingRelationship.create({
        data: {
          sourceIucId: source.id,
          targetIucId: dto.targetIucId,
          relationType: dto.relationType,
          notes: dto.notes?.trim() || null,
          workspaceId,
          createdById: ctx?.actorId ?? userId,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      await this.recordAudit(
        'IUC_RELATIONSHIP_CREATED',
        'UnderstandingRelationship',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        {
          id: created.id,
          sourceIucId: source.id,
          targetIucId: dto.targetIucId,
          relationType: dto.relationType,
        },
        true,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'IUC_RELATIONSHIP_CREATED',
        'UnderstandingRelationship',
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

  async listEvents(id: string, workspaceId: string) {
    const iuc = await this.loadIucOrThrow(id, workspaceId);
    return this.prisma.understandingEvent.findMany({
      where: { iucId: iuc.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}

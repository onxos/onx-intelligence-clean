import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { IntelligenceObjectType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

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

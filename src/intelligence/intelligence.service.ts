import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { IntelligenceObjectType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(data: {
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
  }) {
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
      resource: 'IntelligenceObject',
      resourceId: obj.id,
      actorId: data.creatorId,
      workspaceId: data.workspaceId,
    });

    return obj;
  }

  async findAll(workspaceId: string, filters?: { type?: string; limit?: number; offset?: number }) {
    return this.prisma.intelligenceObject.findMany({
      where: {
        workspaceId,
        ...(filters?.type && { objectType: filters.type as IntelligenceObjectType }),
      },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string) {
    const obj = await this.prisma.intelligenceObject.findFirst({
      where: { id, workspaceId },
    });
    if (!obj) throw new NotFoundException('Intelligence object not found');
    return obj;
  }

  async stats(workspaceId: string) {
    const all = await this.prisma.intelligenceObject.findMany({ where: { workspaceId } });
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
}

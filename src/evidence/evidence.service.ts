import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

type MutationAuditContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    workspaceId: string,
    ownerId: string,
    query?: {
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const pageSize = Number(query?.pageSize || 50);
    const page = Number(query?.page || 1);
    const skip = (page - 1) * pageSize;
    const sortBy = query?.sortBy || 'createdAt';
    const sortOrder = query?.sortOrder || 'desc';

    return this.prisma.evidenceRecord.findMany({
      where: {
        workspaceId,
        ownerId,
        deletedAt: null,
        ...(query?.search && {
          OR: [
            { intent: { contains: query.search, mode: 'insensitive' } },
            { judgment: { contains: query.search, mode: 'insensitive' } },
            { outcome: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      take: pageSize,
      skip,
    });
  }

  async create(
    data: {
      intent: string;
      confidence?: number;
      ownerId: string;
      workspaceId: string;
    },
    auditContext?: MutationAuditContext,
  ) {
    try {
      const created = await this.prisma.evidenceRecord.create({
        data: {
          intent: data.intent,
          confidence: data.confidence || 0,
          ownerId: data.ownerId,
          workspaceId: data.workspaceId,
          providerCandidates: [],
          toolCandidates: [],
        },
      });

      await this.audit.log({
        actorId: data.ownerId,
        action: 'EVIDENCE_CREATED',
        resourceType: 'EvidenceRecord',
        resourceId: created.id,
        workspaceId: data.workspaceId,
        before: null,
        after: { id: created.id, intent: created.intent, deletedAt: created.deletedAt },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return created;
    } catch (error: any) {
      await this.audit.log({
        actorId: data.ownerId,
        action: 'EVIDENCE_CREATED',
        resourceType: 'EvidenceRecord',
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

  async update(
    id: string,
    workspaceId: string,
    ownerId: string,
    data: {
      intent?: string;
      confidence?: number;
      judgment?: string;
      outcome?: string;
      learning?: string;
    },
    auditContext?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.evidenceRecord.findFirst({
        where: { id, workspaceId, ownerId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Evidence record not found');
      }

      const updated = await this.prisma.evidenceRecord.update({
        where: { id: existing.id },
        data: {
          ...(data.intent !== undefined && { intent: data.intent }),
          ...(data.confidence !== undefined && { confidence: data.confidence }),
          ...(data.judgment !== undefined && { judgment: data.judgment }),
          ...(data.outcome !== undefined && { outcome: data.outcome }),
          ...(data.learning !== undefined && { learning: data.learning }),
        },
      });

      await this.audit.log({
        actorId: ownerId,
        action: 'EVIDENCE_UPDATED',
        resourceType: 'EvidenceRecord',
        resourceId: updated.id,
        workspaceId,
        before: { intent: existing.intent, deletedAt: existing.deletedAt },
        after: { intent: updated.intent, deletedAt: updated.deletedAt },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return updated;
    } catch (error: any) {
      await this.audit.log({
        actorId: ownerId,
        action: 'EVIDENCE_UPDATED',
        resourceType: 'EvidenceRecord',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { intent: existing.intent, deletedAt: existing.deletedAt } : null,
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
    ownerId: string,
    auditContext?: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.evidenceRecord.findFirst({
        where: { id, workspaceId, ownerId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Evidence record not found');
      }

      await this.prisma.evidenceRecord.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.audit.log({
        actorId: ownerId,
        action: 'EVIDENCE_DELETED',
        resourceType: 'EvidenceRecord',
        resourceId: existing.id,
        workspaceId,
        before: { intent: existing.intent, deletedAt: existing.deletedAt },
        after: { deletedAt: true },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.audit.log({
        actorId: ownerId,
        action: 'EVIDENCE_DELETED',
        resourceType: 'EvidenceRecord',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { intent: existing.intent, deletedAt: existing.deletedAt } : null,
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

type MutationAuditContext = {
  actorId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class ToolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    workspaceId: string,
    query?: {
      search?: string;
      status?: string;
      category?: string;
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

    return this.prisma.toolProfile.findMany({
      where: {
        workspaceId,
        ...(query?.status ? { status: query.status as any } : { status: { not: 'INACTIVE' } }),
        ...(query?.category && { category: query.category as any }),
        ...(query?.search && {
          OR: [
            { toolName: { contains: query.search, mode: 'insensitive' } },
            { toolId: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async findOne(workspaceId: string, id: string) {
    const tool = await this.prisma.toolProfile.findFirst({
      where: { id, workspaceId, status: { not: 'INACTIVE' } },
    });

    if (!tool) {
      throw new NotFoundException('Tool profile not found');
    }

    return tool;
  }

  async create(workspaceId: string, data: any, auditContext: MutationAuditContext) {
    try {
      const created = await this.prisma.toolProfile.create({
        data: {
          toolId: data.toolId,
          toolName: data.toolName,
          category: (data.category as any) || 'ANALYTICS',
          status: (data.status as any) || 'ACTIVE',
          capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
          costPerCall: data.costPerCall ?? 0,
          totalCapital: data.totalCapital ?? 0,
          workspaceId,
        },
      });

      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_CREATED',
        resourceType: 'ToolProfile',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, toolId: created.toolId, status: created.status },
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return created;
    } catch (error: any) {
      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_CREATED',
        resourceType: 'ToolProfile',
        workspaceId,
        before: null,
        after: null,
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }

  async update(workspaceId: string, id: string, data: any, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.toolProfile.findFirst({
        where: { id, workspaceId, status: { not: 'INACTIVE' } },
      });
      if (!existing) {
        throw new NotFoundException('Tool profile not found');
      }

      const updated = await this.prisma.toolProfile.update({
        where: { id: existing.id },
        data: {
          ...(data.toolName !== undefined && { toolName: data.toolName }),
          ...(data.category !== undefined && { category: data.category as any }),
          ...(data.status !== undefined && { status: data.status as any }),
          ...(data.capabilities !== undefined && {
            capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
          }),
          ...(data.costPerCall !== undefined && { costPerCall: data.costPerCall }),
          ...(data.totalCapital !== undefined && { totalCapital: data.totalCapital }),
        },
      });

      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_UPDATED',
        resourceType: 'ToolProfile',
        resourceId: updated.id,
        workspaceId,
        before: { toolName: existing.toolName, status: existing.status },
        after: { toolName: updated.toolName, status: updated.status },
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return updated;
    } catch (error: any) {
      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_UPDATED',
        resourceType: 'ToolProfile',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { toolName: existing.toolName, status: existing.status } : null,
        after: null,
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }

  async remove(workspaceId: string, id: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.toolProfile.findFirst({
        where: { id, workspaceId, status: { not: 'INACTIVE' } },
      });
      if (!existing) {
        throw new NotFoundException('Tool profile not found');
      }

      await this.prisma.toolProfile.update({
        where: { id: existing.id },
        data: { status: 'INACTIVE' },
      });

      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_DELETED',
        resourceType: 'ToolProfile',
        resourceId: existing.id,
        workspaceId,
        before: { toolName: existing.toolName, status: existing.status },
        after: { status: 'INACTIVE' },
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_DELETED',
        resourceType: 'ToolProfile',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { toolName: existing.toolName, status: existing.status } : null,
        after: null,
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }
}

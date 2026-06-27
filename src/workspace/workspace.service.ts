import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import * as crypto from 'crypto';

type MutationAuditContext = {
  actorId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async logMutationSuccess(args: {
    action: string;
    resourceType: string;
    resourceId?: string;
    workspaceId?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    context: MutationAuditContext;
    metadata?: Record<string, unknown>;
  }) {
    await this.audit.log({
      actorId: args.context.actorId,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      workspaceId: args.workspaceId,
      before: args.before,
      after: args.after,
      requestId: args.context.requestId,
      ip: args.context.ip,
      userAgent: args.context.userAgent,
      status: 'SUCCESS',
      success: true,
      metadata: args.metadata,
    });
  }

  private async logMutationFailure(args: {
    action: string;
    resourceType: string;
    resourceId?: string;
    workspaceId?: string;
    before?: Record<string, unknown> | null;
    context: MutationAuditContext;
    error: unknown;
    metadata?: Record<string, unknown>;
  }) {
    await this.audit.log({
      actorId: args.context.actorId,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      workspaceId: args.workspaceId,
      before: args.before,
      after: null,
      requestId: args.context.requestId,
      ip: args.context.ip,
      userAgent: args.context.userAgent,
      status: 'FAILED',
      success: false,
      metadata: {
        ...(args.metadata ?? {}),
        error: String((args.error as any)?.message ?? args.error),
      },
    });
  }

  private assertNonEmpty(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  private parseModelKey(id: string) {
    const [providerId, ...rest] = id.split('::');
    const model = rest.join('::');
    if (!providerId || !model) {
      throw new BadRequestException('Invalid model id format. Expected providerId::model');
    }
    return { providerId, model };
  }

  async getHome(workspaceId: string) {
    const [
      intelligenceCount,
      evidenceCount,
      providerCount,
      toolCount,
      recentIntelligence,
      recentEvidence,
    ] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId, state: { not: 'ARCHIVED' } } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.providerProfile.count({ where: { workspaceId, status: { not: 'INACTIVE' } } }),
      this.prisma.toolProfile.count({ where: { workspaceId, status: { not: 'INACTIVE' } } }),
      this.prisma.intelligenceObject.findMany({
        where: { workspaceId, state: { not: 'ARCHIVED' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.evidenceRecord.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      workspace: {
        intelligenceCount,
        evidenceCount,
        providerCount,
        toolCount,
      },
      recentIntelligence,
      recentEvidence,
    };
  }

  async listProjects(
    workspaceId: string,
    query?: {
      search?: string;
      status?: string;
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

    return this.prisma.project.findMany({
      where: {
        workspaceId,
        ...(query?.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
        ...(query?.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async createProject(
    workspaceId: string,
    ownerId: string,
    data: { name: string; description?: string; status?: string },
    auditContext: MutationAuditContext,
  ) {
    try {
      this.assertNonEmpty(data.name, 'name');

      const created = await this.prisma.project.create({
        data: {
          name: data.name.trim(),
          description: data.description,
          status: data.status || 'ACTIVE',
          workspaceId,
          ownerId,
        },
      });

      await this.logMutationSuccess({
        action: 'PROJECT_CREATED',
        resourceType: 'Project',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, name: created.name, status: created.status },
        context: auditContext,
      });

      return created;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'PROJECT_CREATED',
        resourceType: 'Project',
        workspaceId,
        before: null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async getProjectDetails(projectId: string, workspaceId: string) {
    const item = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId, status: { not: 'ARCHIVED' } },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('Project not found');
    }
    return item;
  }

  async updateProject(
    projectId: string,
    workspaceId: string,
    data: { name?: string; description?: string; status?: string },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.project.findFirst({
        where: { id: projectId, workspaceId, status: { not: 'ARCHIVED' } },
      });
      if (!existing) {
        throw new NotFoundException('Project not found');
      }

      const updated = await this.prisma.project.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status !== undefined && { status: data.status }),
        },
      });

      await this.logMutationSuccess({
        action: 'PROJECT_UPDATED',
        resourceType: 'Project',
        resourceId: updated.id,
        workspaceId,
        before: { name: existing.name, status: existing.status },
        after: { name: updated.name, status: updated.status },
        context: auditContext,
      });

      return updated;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'PROJECT_UPDATED',
        resourceType: 'Project',
        resourceId: existing?.id ?? projectId,
        workspaceId,
        before: existing ? { name: existing.name, status: existing.status } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteProject(projectId: string, workspaceId: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.project.findFirst({
        where: { id: projectId, workspaceId, status: { not: 'ARCHIVED' } },
      });
      if (!existing) {
        throw new NotFoundException('Project not found');
      }
      await this.prisma.project.update({
        where: { id: existing.id },
        data: { status: 'ARCHIVED' },
      });

      await this.logMutationSuccess({
        action: 'PROJECT_DELETED',
        resourceType: 'Project',
        resourceId: existing.id,
        workspaceId,
        before: { name: existing.name, status: existing.status },
        after: { status: 'ARCHIVED' },
        context: auditContext,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'PROJECT_DELETED',
        resourceType: 'Project',
        resourceId: existing?.id ?? projectId,
        workspaceId,
        before: existing ? { name: existing.name, status: existing.status } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async listKnowledgeAssets(
    workspaceId: string,
    query?: {
      search?: string;
      objectType?: string;
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

    const items = await this.prisma.intelligenceObject.findMany({
      where: {
        workspaceId,
        state: { not: 'ARCHIVED' },
        ...(query?.objectType && { objectType: query.objectType as any }),
        ...(query?.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { content: { contains: query.search, mode: 'insensitive' } },
            { semanticSummary: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });

    return items;
  }

  async createKnowledgeAsset(
    workspaceId: string,
    ownerId: string,
    data: {
      name: string;
      content: string;
      objectType?: string;
      semanticSummary?: string;
      privacyLevel?: string;
    },
    auditContext: MutationAuditContext,
  ) {
    try {
      this.assertNonEmpty(data.name, 'name');
      this.assertNonEmpty(data.content, 'content');

      const contentHash = crypto.createHash('sha256').update(data.content).digest('hex');
      const created = await this.prisma.intelligenceObject.create({
        data: {
          name: data.name.trim(),
          content: data.content,
          contentHash,
          objectType: (data.objectType as any) || 'UNDERSTANDING',
          semanticSummary: data.semanticSummary,
          privacyLevel: (data.privacyLevel as any) || 'INSTITUTIONAL',
          ownerId,
          creatorId: ownerId,
          workspaceId,
        },
      });

      await this.logMutationSuccess({
        action: 'KNOWLEDGE_CREATED',
        resourceType: 'IntelligenceObject',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, name: created.name, state: created.state },
        context: auditContext,
      });

      return created;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'KNOWLEDGE_CREATED',
        resourceType: 'IntelligenceObject',
        workspaceId,
        before: null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async getKnowledgeAssetDetails(id: string, workspaceId: string) {
    const item = await this.prisma.intelligenceObject.findFirst({
      where: { id, workspaceId, state: { not: 'ARCHIVED' } },
    });
    if (!item) {
      throw new NotFoundException('Knowledge asset not found');
    }
    return item;
  }

  async updateKnowledgeAsset(
    id: string,
    workspaceId: string,
    data: {
      name?: string;
      content?: string;
      objectType?: string;
      semanticSummary?: string;
      privacyLevel?: string;
      state?: string;
    },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.intelligenceObject.findFirst({
        where: { id, workspaceId, state: { not: 'ARCHIVED' } },
      });
      if (!existing) {
        throw new NotFoundException('Knowledge asset not found');
      }

      const contentHash =
        data.content !== undefined
          ? crypto.createHash('sha256').update(data.content).digest('hex')
          : existing.contentHash;

      const updated = await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.objectType !== undefined && { objectType: data.objectType as any }),
          ...(data.semanticSummary !== undefined && { semanticSummary: data.semanticSummary }),
          ...(data.privacyLevel !== undefined && { privacyLevel: data.privacyLevel as any }),
          ...(data.state !== undefined && { state: data.state as any }),
          contentHash,
        },
      });

      await this.logMutationSuccess({
        action: 'KNOWLEDGE_UPDATED',
        resourceType: 'IntelligenceObject',
        resourceId: updated.id,
        workspaceId,
        before: { name: existing.name, state: existing.state },
        after: { name: updated.name, state: updated.state },
        context: auditContext,
      });

      return updated;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'KNOWLEDGE_UPDATED',
        resourceType: 'IntelligenceObject',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { name: existing.name, state: existing.state } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteKnowledgeAsset(id: string, workspaceId: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.intelligenceObject.findFirst({
        where: { id, workspaceId, state: { not: 'ARCHIVED' } },
      });
      if (!existing) {
        throw new NotFoundException('Knowledge asset not found');
      }
      await this.prisma.intelligenceObject.update({
        where: { id: existing.id },
        data: { state: 'ARCHIVED' },
      });

      await this.logMutationSuccess({
        action: 'KNOWLEDGE_DELETED',
        resourceType: 'IntelligenceObject',
        resourceId: existing.id,
        workspaceId,
        before: { name: existing.name, state: existing.state },
        after: { state: 'ARCHIVED' },
        context: auditContext,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'KNOWLEDGE_DELETED',
        resourceType: 'IntelligenceObject',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { name: existing.name, state: existing.state } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async listSources(
    workspaceId: string,
    query?: {
      search?: string;
      action?: string;
      resource?: string;
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

    const items = await this.prisma.provenanceRecord.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query?.action && { action: { equals: query.action, mode: 'insensitive' } }),
        ...(query?.resource && { resource: { equals: query.resource, mode: 'insensitive' } }),
        ...(query?.search && {
          OR: [
            { action: { contains: query.search, mode: 'insensitive' } },
            { resource: { contains: query.search, mode: 'insensitive' } },
            { resourceId: { contains: query.search, mode: 'insensitive' } },
            { actorId: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });

    return items;
  }

  async createSource(
    workspaceId: string,
    actorId: string,
    data: {
      action: string;
      resource: string;
      resourceId?: string;
      oldValue?: string;
      newValue?: string;
    },
    auditContext: MutationAuditContext,
  ) {
    try {
      this.assertNonEmpty(data.action, 'action');
      this.assertNonEmpty(data.resource, 'resource');

      if (data.resourceId) {
        const linked = await this.prisma.intelligenceObject.findFirst({
          where: { id: data.resourceId, workspaceId, state: { not: 'ARCHIVED' } },
        });
        if (!linked) {
          throw new BadRequestException(
            'resourceId must reference an existing intelligence object',
          );
        }
      }

      const created = await this.prisma.provenanceRecord.create({
        data: {
          action: data.action.trim(),
          resource: data.resource.trim(),
          resourceId: data.resourceId,
          actorId,
          workspaceId,
          oldValue: data.oldValue,
          newValue: data.newValue,
        },
      });

      await this.logMutationSuccess({
        action: 'SOURCE_CREATED',
        resourceType: 'ProvenanceRecord',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, action: created.action, resource: created.resource },
        context: auditContext,
      });

      return created;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'SOURCE_CREATED',
        resourceType: 'ProvenanceRecord',
        workspaceId,
        before: null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async getSourceDetails(id: string, workspaceId: string) {
    const item = await this.prisma.provenanceRecord.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException('Source record not found');
    }
    return item;
  }

  async updateSource(
    id: string,
    workspaceId: string,
    data: {
      action?: string;
      resource?: string;
      resourceId?: string;
      oldValue?: string;
      newValue?: string;
    },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.provenanceRecord.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Source record not found');
      }

      if (data.resourceId !== undefined && data.resourceId !== null && data.resourceId !== '') {
        const linked = await this.prisma.intelligenceObject.findFirst({
          where: { id: data.resourceId, workspaceId, state: { not: 'ARCHIVED' } },
        });
        if (!linked) {
          throw new BadRequestException(
            'resourceId must reference an existing intelligence object',
          );
        }
      }

      const updated = await this.prisma.provenanceRecord.update({
        where: { id: existing.id },
        data: {
          ...(data.action !== undefined && { action: data.action }),
          ...(data.resource !== undefined && { resource: data.resource }),
          ...(data.resourceId !== undefined && { resourceId: data.resourceId }),
          ...(data.oldValue !== undefined && { oldValue: data.oldValue }),
          ...(data.newValue !== undefined && { newValue: data.newValue }),
        },
      });

      await this.logMutationSuccess({
        action: 'SOURCE_UPDATED',
        resourceType: 'ProvenanceRecord',
        resourceId: updated.id,
        workspaceId,
        before: { action: existing.action, resource: existing.resource },
        after: { action: updated.action, resource: updated.resource },
        context: auditContext,
      });

      return updated;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'SOURCE_UPDATED',
        resourceType: 'ProvenanceRecord',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { action: existing.action, resource: existing.resource } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteSource(id: string, workspaceId: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.provenanceRecord.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Source record not found');
      }
      await this.prisma.provenanceRecord.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.logMutationSuccess({
        action: 'SOURCE_DELETED',
        resourceType: 'ProvenanceRecord',
        resourceId: existing.id,
        workspaceId,
        before: { action: existing.action, resource: existing.resource },
        after: { deletedAt: true },
        context: auditContext,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'SOURCE_DELETED',
        resourceType: 'ProvenanceRecord',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { action: existing.action, resource: existing.resource } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async listAgents(
    workspaceId: string,
    query?: {
      search?: string;
      status?: string;
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

    return this.prisma.agent.findMany({
      where: {
        workspaceId,
        ...(query?.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
        ...(query?.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async createAgent(
    workspaceId: string,
    ownerId: string,
    data: {
      name: string;
      description?: string;
      status?: string;
      model?: string;
      providerId?: string;
      config?: Record<string, any>;
    },
    auditContext: MutationAuditContext,
  ) {
    try {
      this.assertNonEmpty(data.name, 'name');

      const created = await this.prisma.agent.create({
        data: {
          name: data.name.trim(),
          description: data.description,
          status: data.status || 'ACTIVE',
          model: data.model,
          providerId: data.providerId,
          config: data.config || {},
          workspaceId,
          ownerId,
        },
      });

      await this.logMutationSuccess({
        action: 'AGENT_CREATED',
        resourceType: 'Agent',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, name: created.name, status: created.status },
        context: auditContext,
      });

      return created;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'AGENT_CREATED',
        resourceType: 'Agent',
        workspaceId,
        before: null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async updateAgent(
    agentId: string,
    workspaceId: string,
    data: {
      name?: string;
      description?: string;
      status?: string;
      model?: string;
      providerId?: string;
      config?: Record<string, any>;
    },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.agent.findFirst({
        where: { id: agentId, workspaceId, status: { not: 'ARCHIVED' } },
      });
      if (!existing) {
        throw new NotFoundException('Agent not found');
      }

      const updated = await this.prisma.agent.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.model !== undefined && { model: data.model }),
          ...(data.providerId !== undefined && { providerId: data.providerId }),
          ...(data.config !== undefined && { config: data.config }),
        },
      });

      await this.logMutationSuccess({
        action: 'AGENT_UPDATED',
        resourceType: 'Agent',
        resourceId: updated.id,
        workspaceId,
        before: { name: existing.name, status: existing.status },
        after: { name: updated.name, status: updated.status },
        context: auditContext,
      });

      return updated;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'AGENT_UPDATED',
        resourceType: 'Agent',
        resourceId: existing?.id ?? agentId,
        workspaceId,
        before: existing ? { name: existing.name, status: existing.status } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteAgent(agentId: string, workspaceId: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.agent.findFirst({
        where: { id: agentId, workspaceId, status: { not: 'ARCHIVED' } },
      });
      if (!existing) {
        throw new NotFoundException('Agent not found');
      }
      await this.prisma.agent.update({ where: { id: existing.id }, data: { status: 'ARCHIVED' } });

      await this.logMutationSuccess({
        action: 'AGENT_DELETED',
        resourceType: 'Agent',
        resourceId: existing.id,
        workspaceId,
        before: { name: existing.name, status: existing.status },
        after: { status: 'ARCHIVED' },
        context: auditContext,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'AGENT_DELETED',
        resourceType: 'Agent',
        resourceId: existing?.id ?? agentId,
        workspaceId,
        before: existing ? { name: existing.name, status: existing.status } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async listMemory(
    workspaceId: string,
    query?: {
      search?: string;
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

    return this.prisma.memoryEntry.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query?.category && { category: query.category }),
        ...(query?.search && {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { content: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async createMemory(
    workspaceId: string,
    ownerId: string,
    data: { title: string; content: string; category?: string; tags?: string[] },
    auditContext: MutationAuditContext,
  ) {
    try {
      this.assertNonEmpty(data.title, 'title');
      this.assertNonEmpty(data.content, 'content');

      const created = await this.prisma.memoryEntry.create({
        data: {
          title: data.title.trim(),
          content: data.content,
          category: data.category || 'GENERAL',
          tags: data.tags || [],
          workspaceId,
          ownerId,
        },
      });

      await this.logMutationSuccess({
        action: 'MEMORY_CREATED',
        resourceType: 'MemoryEntry',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, title: created.title, deletedAt: created.deletedAt },
        context: auditContext,
      });

      return created;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'MEMORY_CREATED',
        resourceType: 'MemoryEntry',
        workspaceId,
        before: null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async updateMemory(
    memoryId: string,
    workspaceId: string,
    data: { title?: string; content?: string; category?: string; tags?: string[] },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.memoryEntry.findFirst({
        where: { id: memoryId, workspaceId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Memory entry not found');
      }

      const updated = await this.prisma.memoryEntry.update({
        where: { id: existing.id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.content !== undefined && { content: data.content }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.tags !== undefined && { tags: data.tags }),
        },
      });

      await this.logMutationSuccess({
        action: 'MEMORY_UPDATED',
        resourceType: 'MemoryEntry',
        resourceId: updated.id,
        workspaceId,
        before: { title: existing.title, deletedAt: existing.deletedAt },
        after: { title: updated.title, deletedAt: updated.deletedAt },
        context: auditContext,
      });

      return updated;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'MEMORY_UPDATED',
        resourceType: 'MemoryEntry',
        resourceId: existing?.id ?? memoryId,
        workspaceId,
        before: existing ? { title: existing.title, deletedAt: existing.deletedAt } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteMemory(memoryId: string, workspaceId: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.memoryEntry.findFirst({
        where: { id: memoryId, workspaceId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Memory entry not found');
      }
      await this.prisma.memoryEntry.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.logMutationSuccess({
        action: 'MEMORY_DELETED',
        resourceType: 'MemoryEntry',
        resourceId: existing.id,
        workspaceId,
        before: { title: existing.title, deletedAt: existing.deletedAt },
        after: { deletedAt: true },
        context: auditContext,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'MEMORY_DELETED',
        resourceType: 'MemoryEntry',
        resourceId: existing?.id ?? memoryId,
        workspaceId,
        before: existing ? { title: existing.title, deletedAt: existing.deletedAt } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async listModels(
    workspaceId: string,
    query?: {
      search?: string;
      providerId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const providers = await this.prisma.providerProfile.findMany({
      where: { workspaceId, status: { not: 'INACTIVE' } },
      orderBy: { priority: 'asc' },
      select: {
        providerId: true,
        providerName: true,
        models: true,
        status: true,
      },
    });

    let items = providers.flatMap((provider) =>
      provider.models.map((model) => ({
        id: `${provider.providerId}::${model}`,
        model,
        providerId: provider.providerId,
        providerName: provider.providerName,
        providerStatus: provider.status,
      })),
    );

    if (query?.providerId) {
      items = items.filter((item) => item.providerId === query.providerId);
    }

    if (query?.search) {
      const text = query.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.model.toLowerCase().includes(text) ||
          item.providerId.toLowerCase().includes(text) ||
          item.providerName.toLowerCase().includes(text),
      );
    }

    const sortBy = query?.sortBy || 'providerName';
    const sortOrder = query?.sortOrder || 'asc';
    items.sort((a: any, b: any) => {
      const av = String(a[sortBy] ?? '').toLowerCase();
      const bv = String(b[sortBy] ?? '').toLowerCase();
      if (av === bv) return 0;
      return sortOrder === 'asc' ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
    });

    const pageSize = Number(query?.pageSize || 50);
    const page = Number(query?.page || 1);
    const skip = (page - 1) * pageSize;
    return items.slice(skip, skip + pageSize);
  }

  async createModel(
    workspaceId: string,
    data: { providerId: string; model: string },
    auditContext: MutationAuditContext,
  ) {
    let provider: any = null;
    try {
      this.assertNonEmpty(data.providerId, 'providerId');
      this.assertNonEmpty(data.model, 'model');

      provider = await this.prisma.providerProfile.findFirst({
        where: { providerId: data.providerId, workspaceId, status: { not: 'INACTIVE' } },
      });
      if (!provider) {
        throw new NotFoundException('Provider not found');
      }

      if (provider.models.includes(data.model)) {
        throw new BadRequestException('Model already exists for provider');
      }

      const updated = await this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: { models: [...provider.models, data.model] },
      });

      await this.logMutationSuccess({
        action: 'MODEL_CREATED',
        resourceType: 'ProviderModel',
        resourceId: `${updated.providerId}::${data.model}`,
        workspaceId,
        before: { models: provider.models },
        after: { models: updated.models },
        context: auditContext,
      });

      return {
        id: `${updated.providerId}::${data.model}`,
        providerId: updated.providerId,
        providerName: updated.providerName,
        providerStatus: updated.status,
        model: data.model,
      };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'MODEL_CREATED',
        resourceType: 'ProviderModel',
        resourceId: provider ? `${provider.providerId}::${data.model}` : undefined,
        workspaceId,
        before: provider ? { models: provider.models } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async getModelDetails(id: string, workspaceId: string) {
    const { providerId, model } = this.parseModelKey(id);
    const provider = await this.prisma.providerProfile.findFirst({
      where: { providerId, workspaceId, status: { not: 'INACTIVE' } },
    });
    if (!provider || !provider.models.includes(model)) {
      throw new NotFoundException('Model record not found');
    }

    return {
      id,
      providerId: provider.providerId,
      providerName: provider.providerName,
      providerStatus: provider.status,
      model,
    };
  }

  async updateModel(
    id: string,
    workspaceId: string,
    data: { model?: string },
    auditContext: MutationAuditContext,
  ) {
    const { providerId, model } = this.parseModelKey(id);
    let provider: any = null;
    try {
      this.assertNonEmpty(data.model, 'model');
      const nextModel = (data.model as string).trim();

      provider = await this.prisma.providerProfile.findFirst({
        where: { providerId, workspaceId, status: { not: 'INACTIVE' } },
      });
      if (!provider || !provider.models.includes(model)) {
        throw new NotFoundException('Model record not found');
      }

      const nextModels = provider.models.map((item) => (item === model ? nextModel : item));
      const dedup = Array.from(new Set(nextModels)) as string[];

      const updated = await this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: { models: dedup },
      });

      await this.logMutationSuccess({
        action: 'MODEL_UPDATED',
        resourceType: 'ProviderModel',
        resourceId: `${updated.providerId}::${nextModel}`,
        workspaceId,
        before: { model, models: provider.models },
        after: { model: nextModel, models: updated.models },
        context: auditContext,
      });

      return {
        id: `${updated.providerId}::${nextModel}`,
        providerId: updated.providerId,
        providerName: updated.providerName,
        providerStatus: updated.status,
        model: nextModel,
      };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'MODEL_UPDATED',
        resourceType: 'ProviderModel',
        resourceId: id,
        workspaceId,
        before: provider ? { models: provider.models } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteModel(id: string, workspaceId: string, auditContext: MutationAuditContext) {
    const { providerId, model } = this.parseModelKey(id);
    let provider: any = null;
    try {
      provider = await this.prisma.providerProfile.findFirst({
        where: { providerId, workspaceId, status: { not: 'INACTIVE' } },
      });
      if (!provider || !provider.models.includes(model)) {
        throw new NotFoundException('Model record not found');
      }

      const nextModels = provider.models.filter((item) => item !== model);
      await this.prisma.providerProfile.update({
        where: { id: provider.id },
        data: { models: nextModels },
      });

      await this.logMutationSuccess({
        action: 'MODEL_DELETED',
        resourceType: 'ProviderModel',
        resourceId: id,
        workspaceId,
        before: { model, models: provider.models },
        after: { models: nextModels },
        context: auditContext,
      });

      return { success: true, id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'MODEL_DELETED',
        resourceType: 'ProviderModel',
        resourceId: id,
        workspaceId,
        before: provider ? { models: provider.models } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async listEvaluations(
    workspaceId: string,
    query?: {
      search?: string;
      providerId?: string;
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

    const items = await this.prisma.providerEvaluation.findMany({
      where: {
        deletedAt: null,
        provider: {
          workspaceId,
          status: { not: 'INACTIVE' },
          ...(query?.providerId && { providerId: query.providerId }),
          ...(query?.search && {
            OR: [
              { providerName: { contains: query.search, mode: 'insensitive' } },
              { providerId: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
        },
        ...(query?.search && {
          OR: [{ intent: { contains: query.search, mode: 'insensitive' } }],
        }),
      },
      include: {
        provider: {
          select: {
            providerId: true,
            providerName: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });

    return items;
  }

  async createEvaluation(
    workspaceId: string,
    data: {
      providerId: string;
      intent: string;
      context?: string;
      iseScore?: number;
      dimensions?: Record<string, any> | string;
    },
    auditContext: MutationAuditContext,
  ) {
    let provider: any = null;
    try {
      this.assertNonEmpty(data.providerId, 'providerId');
      this.assertNonEmpty(data.intent, 'intent');

      provider = await this.prisma.providerProfile.findFirst({
        where: { providerId: data.providerId, workspaceId, status: { not: 'INACTIVE' } },
      });
      if (!provider) {
        throw new NotFoundException('Provider not found');
      }

      let dimensions: Record<string, any> = {};
      if (typeof data.dimensions === 'string' && data.dimensions.trim()) {
        try {
          dimensions = JSON.parse(data.dimensions);
        } catch {
          throw new BadRequestException('dimensions must be a valid JSON object string');
        }
      } else if (data.dimensions && typeof data.dimensions === 'object') {
        dimensions = data.dimensions;
      }

      const created = await this.prisma.providerEvaluation.create({
        data: {
          providerId: provider.id,
          iseScore: data.iseScore ?? provider.iseScore,
          dimensions,
          intent: data.intent,
          context: data.context,
        },
        include: {
          provider: {
            select: {
              providerId: true,
              providerName: true,
            },
          },
        },
      });

      await this.logMutationSuccess({
        action: 'EVALUATION_CREATED',
        resourceType: 'ProviderEvaluation',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: { id: created.id, intent: created.intent, deletedAt: created.deletedAt },
        context: auditContext,
      });

      return created;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'EVALUATION_CREATED',
        resourceType: 'ProviderEvaluation',
        workspaceId,
        before: provider ? { providerId: provider.providerId } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async getEvaluationDetails(id: string, workspaceId: string) {
    const item = await this.prisma.providerEvaluation.findFirst({
      where: {
        id,
        deletedAt: null,
        provider: {
          workspaceId,
          status: { not: 'INACTIVE' },
        },
      },
      include: {
        provider: {
          select: {
            providerId: true,
            providerName: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('Evaluation not found');
    }
    return item;
  }

  async updateEvaluation(
    id: string,
    workspaceId: string,
    data: {
      intent?: string;
      context?: string;
      iseScore?: number;
      dimensions?: Record<string, any> | string;
    },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.providerEvaluation.findFirst({
        where: {
          id,
          deletedAt: null,
          provider: { workspaceId, status: { not: 'INACTIVE' } },
        },
      });
      if (!existing) {
        throw new NotFoundException('Evaluation not found');
      }

      let dimensions = existing.dimensions as any;
      if (typeof data.dimensions === 'string' && data.dimensions.trim()) {
        try {
          dimensions = JSON.parse(data.dimensions);
        } catch {
          throw new BadRequestException('dimensions must be a valid JSON object string');
        }
      } else if (data.dimensions && typeof data.dimensions === 'object') {
        dimensions = data.dimensions;
      }

      const updated = await this.prisma.providerEvaluation.update({
        where: { id: existing.id },
        data: {
          ...(data.intent !== undefined && { intent: data.intent }),
          ...(data.context !== undefined && { context: data.context }),
          ...(data.iseScore !== undefined && { iseScore: data.iseScore }),
          ...(data.dimensions !== undefined && { dimensions }),
        },
        include: {
          provider: {
            select: {
              providerId: true,
              providerName: true,
            },
          },
        },
      });

      await this.logMutationSuccess({
        action: 'EVALUATION_UPDATED',
        resourceType: 'ProviderEvaluation',
        resourceId: updated.id,
        workspaceId,
        before: { intent: existing.intent, deletedAt: existing.deletedAt },
        after: { intent: updated.intent, deletedAt: updated.deletedAt },
        context: auditContext,
      });

      return updated;
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'EVALUATION_UPDATED',
        resourceType: 'ProviderEvaluation',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { intent: existing.intent, deletedAt: existing.deletedAt } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async deleteEvaluation(id: string, workspaceId: string, auditContext: MutationAuditContext) {
    let existing: any = null;
    try {
      existing = await this.prisma.providerEvaluation.findFirst({
        where: {
          id,
          deletedAt: null,
          provider: { workspaceId, status: { not: 'INACTIVE' } },
        },
      });
      if (!existing) {
        throw new NotFoundException('Evaluation not found');
      }
      await this.prisma.providerEvaluation.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.logMutationSuccess({
        action: 'EVALUATION_DELETED',
        resourceType: 'ProviderEvaluation',
        resourceId: existing.id,
        workspaceId,
        before: { intent: existing.intent, deletedAt: existing.deletedAt },
        after: { deletedAt: true },
        context: auditContext,
      });

      return { success: true, id: existing.id };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'EVALUATION_DELETED',
        resourceType: 'ProviderEvaluation',
        resourceId: existing?.id ?? id,
        workspaceId,
        before: existing ? { intent: existing.intent, deletedAt: existing.deletedAt } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }

  async getReports(workspaceId: string) {
    const [intelligenceCount, evidenceCount, governanceCount, totalCapital] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId, state: { not: 'ARCHIVED' } } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.governanceDecision.count({ where: { workspaceId } }),
      this.prisma.capitalRecord.aggregate({
        where: { workspaceId },
        _sum: { amount: true },
      }),
    ]);

    return {
      pending: false,
      snapshot: {
        intelligenceCount,
        evidenceCount,
        governanceCount,
        totalCapital: totalCapital._sum.amount || 0,
      },
    };
  }

  async listReportGovernance(
    workspaceId: string,
    query?: {
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

    return this.prisma.governanceDecision.findMany({
      where: { workspaceId },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async listReportCapital(
    workspaceId: string,
    query?: {
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

    return this.prisma.capitalRecord.findMany({
      where: { workspaceId },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async getMonitoring(workspaceId: string) {
    const [auditCount, recentAudit, evidenceCount] = await Promise.all([
      this.prisma.auditLog.count({ where: { workspaceId } }),
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.evidenceRecord.count({ where: { workspaceId, deletedAt: null } }),
    ]);

    return {
      pending: false,
      status: 'ok',
      metrics: {
        auditCount,
        evidenceCount,
      },
      recentAudit,
    };
  }

  async listMonitoringAudit(
    workspaceId: string,
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

    return this.prisma.auditLog.findMany({
      where: {
        workspaceId,
        ...(query?.search && {
          OR: [
            { action: { contains: query.search, mode: 'insensitive' } },
            { resource: { contains: query.search, mode: 'insensitive' } },
            { actorId: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async getMonitoringAuditById(workspaceId: string, id: string) {
    const item = await this.prisma.auditLog.findFirst({ where: { id, workspaceId } });
    if (!item) {
      throw new NotFoundException('Audit log not found');
    }
    return item;
  }

  async getSettings(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId },
      include: {
        role: true,
        workspace: true,
        tenant: true,
      },
    });

    return {
      pending: false,
      user,
    };
  }

  async updateSettings(
    userId: string,
    workspaceId: string,
    data: { name?: string; status?: string },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      existing = await this.prisma.user.findFirst({ where: { id: userId, workspaceId } });
      if (!existing) {
        throw new NotFoundException('User not found in workspace');
      }

      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.status !== undefined && { status: data.status as any }),
        },
        include: {
          role: true,
          workspace: true,
          tenant: true,
        },
      });

      await this.logMutationSuccess({
        action: 'SETTINGS_UPDATED',
        resourceType: 'User',
        resourceId: existing.id,
        workspaceId,
        before: { name: existing.name, status: existing.status },
        after: { name: user.name, status: user.status },
        context: auditContext,
      });

      return {
        pending: false,
        user,
      };
    } catch (error: any) {
      await this.logMutationFailure({
        action: 'SETTINGS_UPDATED',
        resourceType: 'User',
        resourceId: existing?.id ?? userId,
        workspaceId,
        before: existing ? { name: existing.name, status: existing.status } : null,
        context: auditContext,
        error,
      });
      throw error;
    }
  }
}

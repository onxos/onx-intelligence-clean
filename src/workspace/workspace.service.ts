import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(workspaceId: string) {
    const [
      intelligenceCount,
      evidenceCount,
      providerCount,
      toolCount,
      recentIntelligence,
      recentEvidence,
    ] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
      this.prisma.providerProfile.count({ where: { workspaceId } }),
      this.prisma.toolProfile.count({ where: { workspaceId } }),
      this.prisma.intelligenceObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.evidenceRecord.findMany({
        where: { workspaceId },
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
        ...(query?.status && { status: query.status }),
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
  ) {
    return this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        status: data.status || 'ACTIVE',
        workspaceId,
        ownerId,
      },
    });
  }

  async getProjectDetails(projectId: string, workspaceId: string) {
    const item = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
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
  ) {
    const existing = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
  }

  async deleteProject(projectId: string, workspaceId: string) {
    const existing = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }
    await this.prisma.project.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }

  async listKnowledgeAssets(workspaceId: string) {
    const items = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { pending: false, items };
  }

  async listSources(workspaceId: string) {
    const items = await this.prisma.provenanceRecord.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { pending: false, items };
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
        ...(query?.status && { status: query.status }),
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
  ) {
    return this.prisma.agent.create({
      data: {
        name: data.name,
        description: data.description,
        status: data.status || 'ACTIVE',
        model: data.model,
        providerId: data.providerId,
        config: data.config || {},
        workspaceId,
        ownerId,
      },
    });
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
  ) {
    const existing = await this.prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Agent not found');
    }

    return this.prisma.agent.update({
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
  }

  async deleteAgent(agentId: string, workspaceId: string) {
    const existing = await this.prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Agent not found');
    }
    await this.prisma.agent.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
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
  ) {
    return this.prisma.memoryEntry.create({
      data: {
        title: data.title,
        content: data.content,
        category: data.category || 'GENERAL',
        tags: data.tags || [],
        workspaceId,
        ownerId,
      },
    });
  }

  async updateMemory(
    memoryId: string,
    workspaceId: string,
    data: { title?: string; content?: string; category?: string; tags?: string[] },
  ) {
    const existing = await this.prisma.memoryEntry.findFirst({
      where: { id: memoryId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Memory entry not found');
    }

    return this.prisma.memoryEntry.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    });
  }

  async deleteMemory(memoryId: string, workspaceId: string) {
    const existing = await this.prisma.memoryEntry.findFirst({
      where: { id: memoryId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Memory entry not found');
    }
    await this.prisma.memoryEntry.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }

  async listModels(workspaceId: string) {
    const providers = await this.prisma.providerProfile.findMany({
      where: { workspaceId },
      orderBy: { priority: 'asc' },
      select: {
        providerId: true,
        providerName: true,
        models: true,
        status: true,
      },
    });

    const items = providers.flatMap((provider) =>
      provider.models.map((model) => ({
        model,
        providerId: provider.providerId,
        providerName: provider.providerName,
        providerStatus: provider.status,
      })),
    );

    return { pending: false, items };
  }

  async listEvaluations(workspaceId: string) {
    const items = await this.prisma.providerEvaluation.findMany({
      where: {
        provider: {
          workspaceId,
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
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { pending: false, items };
  }

  async getReports(workspaceId: string) {
    const [intelligenceCount, evidenceCount, governanceCount, totalCapital] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
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

  async getMonitoring(workspaceId: string) {
    const [auditCount, recentAudit, evidenceCount] = await Promise.all([
      this.prisma.auditLog.count({ where: { workspaceId } }),
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
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
  ) {
    const existing = await this.prisma.user.findFirst({ where: { id: userId, workspaceId } });
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

    return {
      pending: false,
      user,
    };
  }
}

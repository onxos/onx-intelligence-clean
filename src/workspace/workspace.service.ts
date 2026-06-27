import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

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
    this.assertNonEmpty(data.name, 'name');

    return this.prisma.project.create({
      data: {
        name: data.name.trim(),
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
  ) {
    this.assertNonEmpty(data.name, 'name');
    this.assertNonEmpty(data.content, 'content');

    const contentHash = crypto.createHash('sha256').update(data.content).digest('hex');
    return this.prisma.intelligenceObject.create({
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
  }

  async getKnowledgeAssetDetails(id: string, workspaceId: string) {
    const item = await this.prisma.intelligenceObject.findFirst({
      where: { id, workspaceId },
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
  ) {
    const existing = await this.prisma.intelligenceObject.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Knowledge asset not found');
    }

    const contentHash =
      data.content !== undefined
        ? crypto.createHash('sha256').update(data.content).digest('hex')
        : existing.contentHash;

    return this.prisma.intelligenceObject.update({
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
  }

  async deleteKnowledgeAsset(id: string, workspaceId: string) {
    const existing = await this.prisma.intelligenceObject.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Knowledge asset not found');
    }
    await this.prisma.intelligenceObject.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
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
  ) {
    this.assertNonEmpty(data.action, 'action');
    this.assertNonEmpty(data.resource, 'resource');

    return this.prisma.provenanceRecord.create({
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
  }

  async getSourceDetails(id: string, workspaceId: string) {
    const item = await this.prisma.provenanceRecord.findFirst({ where: { id, workspaceId } });
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
  ) {
    const existing = await this.prisma.provenanceRecord.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Source record not found');
    }

    return this.prisma.provenanceRecord.update({
      where: { id: existing.id },
      data: {
        ...(data.action !== undefined && { action: data.action }),
        ...(data.resource !== undefined && { resource: data.resource }),
        ...(data.resourceId !== undefined && { resourceId: data.resourceId }),
        ...(data.oldValue !== undefined && { oldValue: data.oldValue }),
        ...(data.newValue !== undefined && { newValue: data.newValue }),
      },
    });
  }

  async deleteSource(id: string, workspaceId: string) {
    const existing = await this.prisma.provenanceRecord.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Source record not found');
    }
    await this.prisma.provenanceRecord.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
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
    this.assertNonEmpty(data.name, 'name');

    return this.prisma.agent.create({
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
    this.assertNonEmpty(data.title, 'title');
    this.assertNonEmpty(data.content, 'content');

    return this.prisma.memoryEntry.create({
      data: {
        title: data.title.trim(),
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
      where: { workspaceId },
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

  async createModel(workspaceId: string, data: { providerId: string; model: string }) {
    this.assertNonEmpty(data.providerId, 'providerId');
    this.assertNonEmpty(data.model, 'model');

    const provider = await this.prisma.providerProfile.findFirst({
      where: { providerId: data.providerId, workspaceId },
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

    return {
      id: `${updated.providerId}::${data.model}`,
      providerId: updated.providerId,
      providerName: updated.providerName,
      providerStatus: updated.status,
      model: data.model,
    };
  }

  async getModelDetails(id: string, workspaceId: string) {
    const { providerId, model } = this.parseModelKey(id);
    const provider = await this.prisma.providerProfile.findFirst({
      where: { providerId, workspaceId },
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

  async updateModel(id: string, workspaceId: string, data: { model?: string }) {
    const { providerId, model } = this.parseModelKey(id);
    this.assertNonEmpty(data.model, 'model');
    const nextModel = (data.model as string).trim();

    const provider = await this.prisma.providerProfile.findFirst({
      where: { providerId, workspaceId },
    });
    if (!provider || !provider.models.includes(model)) {
      throw new NotFoundException('Model record not found');
    }

    const nextModels = provider.models.map((item) => (item === model ? nextModel : item));
    const dedup = Array.from(new Set(nextModels));

    const updated = await this.prisma.providerProfile.update({
      where: { id: provider.id },
      data: { models: dedup },
    });

    return {
      id: `${updated.providerId}::${nextModel}`,
      providerId: updated.providerId,
      providerName: updated.providerName,
      providerStatus: updated.status,
      model: nextModel,
    };
  }

  async deleteModel(id: string, workspaceId: string) {
    const { providerId, model } = this.parseModelKey(id);
    const provider = await this.prisma.providerProfile.findFirst({
      where: { providerId, workspaceId },
    });
    if (!provider || !provider.models.includes(model)) {
      throw new NotFoundException('Model record not found');
    }

    const nextModels = provider.models.filter((item) => item !== model);
    await this.prisma.providerProfile.update({
      where: { id: provider.id },
      data: { models: nextModels },
    });

    return { success: true, id };
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
        provider: {
          workspaceId,
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
  ) {
    this.assertNonEmpty(data.providerId, 'providerId');
    this.assertNonEmpty(data.intent, 'intent');

    const provider = await this.prisma.providerProfile.findFirst({
      where: { providerId: data.providerId, workspaceId },
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

    return this.prisma.providerEvaluation.create({
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
  }

  async getEvaluationDetails(id: string, workspaceId: string) {
    const item = await this.prisma.providerEvaluation.findFirst({
      where: {
        id,
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
  ) {
    const existing = await this.prisma.providerEvaluation.findFirst({
      where: {
        id,
        provider: { workspaceId },
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

    return this.prisma.providerEvaluation.update({
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
  }

  async deleteEvaluation(id: string, workspaceId: string) {
    const existing = await this.prisma.providerEvaluation.findFirst({
      where: {
        id,
        provider: { workspaceId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Evaluation not found');
    }
    await this.prisma.providerEvaluation.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
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

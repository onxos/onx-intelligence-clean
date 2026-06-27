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

const MEMORY_CLASSIFICATIONS = ['PUBLIC', 'INSTITUTIONAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;
const MEMORY_ACCESS_SCOPES = ['WORKSPACE', 'OWNER_ONLY'] as const;
const MEMORY_LIFECYCLE_STATUSES = ['ACTIVE', 'LOCKED', 'EXPIRED'] as const;
const MEMORY_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'category',
  'classification',
  'expiresAt',
  'lifecycleStatus',
] as const;
const MEMORY_DEFAULT_RETENTION_DAYS: Record<(typeof MEMORY_CLASSIFICATIONS)[number], number> = {
  PUBLIC: 3650,
  INSTITUTIONAL: 1095,
  CONFIDENTIAL: 365,
  RESTRICTED: 90,
};
const MEMORY_MAX_RETENTION_DAYS = MEMORY_DEFAULT_RETENTION_DAYS;
const MAX_MEMORY_TITLE_LENGTH = 200;
const MAX_MEMORY_CONTENT_LENGTH = 20000;
const MAX_MEMORY_CATEGORY_LENGTH = 64;
const MAX_MEMORY_TAGS = 20;
const MAX_MEMORY_TAG_LENGTH = 32;
const MAX_MEMORY_SEARCH_LENGTH = 200;

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

  private parseBoundedInteger(
    value: unknown,
    field: string,
    defaultValue: number,
    maxValue: number,
  ) {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValue) {
      throw new BadRequestException(`${field} must be an integer between 1 and ${maxValue}`);
    }

    return parsed;
  }

  private normalizeMemoryCategory(value: unknown, fallback = 'GENERAL') {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('category must be a non-empty string');
    }

    const normalized = value.trim();
    if (normalized.length > MAX_MEMORY_CATEGORY_LENGTH) {
      throw new BadRequestException(
        `category must be at most ${MAX_MEMORY_CATEGORY_LENGTH} characters`,
      );
    }

    return normalized;
  }

  private normalizeMemoryClassification(value: unknown, fallback = 'INSTITUTIONAL') {
    const normalized = (
      typeof value === 'string' && value.trim() ? value.trim() : fallback
    ).toUpperCase();
    if (!(MEMORY_CLASSIFICATIONS as readonly string[]).includes(normalized)) {
      throw new BadRequestException(
        `classification must be one of: ${MEMORY_CLASSIFICATIONS.join(', ')}`,
      );
    }
    return normalized;
  }

  private normalizeMemoryAccessScope(value: unknown, fallback = 'WORKSPACE') {
    const normalized = (
      typeof value === 'string' && value.trim() ? value.trim() : fallback
    ).toUpperCase();
    if (!(MEMORY_ACCESS_SCOPES as readonly string[]).includes(normalized)) {
      throw new BadRequestException(
        `accessScope must be one of: ${MEMORY_ACCESS_SCOPES.join(', ')}`,
      );
    }
    return normalized;
  }

  private normalizeMemoryLifecycleStatus(
    value: unknown,
    allowExpired = false,
    fallback = 'ACTIVE',
  ) {
    const normalized = (
      typeof value === 'string' && value.trim() ? value.trim() : fallback
    ).toUpperCase();
    const allowed = allowExpired
      ? MEMORY_LIFECYCLE_STATUSES
      : MEMORY_LIFECYCLE_STATUSES.filter((status) => status !== 'EXPIRED');
    if (!(allowed as readonly string[]).includes(normalized)) {
      throw new BadRequestException(`lifecycleStatus must be one of: ${allowed.join(', ')}`);
    }
    return normalized;
  }

  private normalizeMemoryTags(value: unknown) {
    if (value === undefined || value === null) {
      return [] as string[];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException('tags must be an array of strings');
    }

    const tags = Array.from(
      new Set(
        value.map((tag) => {
          if (typeof tag !== 'string' || !tag.trim()) {
            throw new BadRequestException('tags must contain only non-empty strings');
          }
          const normalized = tag.trim();
          if (normalized.length > MAX_MEMORY_TAG_LENGTH) {
            throw new BadRequestException(
              `each tag must be at most ${MAX_MEMORY_TAG_LENGTH} characters`,
            );
          }
          return normalized;
        }),
      ),
    );

    if (tags.length > MAX_MEMORY_TAGS) {
      throw new BadRequestException(`tags may contain at most ${MAX_MEMORY_TAGS} items`);
    }

    return tags;
  }

  private normalizeMemoryRetentionDays(value: unknown, classification: string, fallback?: number) {
    const defaultValue =
      fallback ??
      MEMORY_DEFAULT_RETENTION_DAYS[classification as keyof typeof MEMORY_DEFAULT_RETENTION_DAYS];

    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const parsed = Number(value);
    const maxAllowed =
      MEMORY_MAX_RETENTION_DAYS[classification as keyof typeof MEMORY_MAX_RETENTION_DAYS];
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxAllowed) {
      throw new BadRequestException(
        `retentionDays must be an integer between 1 and ${maxAllowed} for classification ${classification}`,
      );
    }

    return parsed;
  }

  private computeMemoryExpiry(retentionDays: number) {
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + retentionDays);
    return expiresAt;
  }

  private normalizeMemoryContent(value: unknown, fallback?: string) {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('content is required');
    }

    const normalized = value.trim();
    if (normalized.length > MAX_MEMORY_CONTENT_LENGTH) {
      throw new BadRequestException(
        `content must be at most ${MAX_MEMORY_CONTENT_LENGTH} characters`,
      );
    }

    return normalized;
  }

  private normalizeMemoryTitle(value: unknown, fallback?: string) {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('title is required');
    }

    const normalized = value.trim();
    if (normalized.length > MAX_MEMORY_TITLE_LENGTH) {
      throw new BadRequestException(`title must be at most ${MAX_MEMORY_TITLE_LENGTH} characters`);
    }

    return normalized;
  }

  private buildMemoryGovernancePayload(
    data: {
      category?: string;
      classification?: string;
      accessScope?: string;
      lifecycleStatus?: string;
      retentionDays?: number;
      tags?: string[];
    },
    existing?: {
      category?: string;
      classification?: string;
      accessScope?: string;
      lifecycleStatus?: string;
      retentionDays?: number;
    } | null,
  ) {
    const classification = this.normalizeMemoryClassification(
      data.classification,
      existing?.classification ?? 'INSTITUTIONAL',
    );
    const accessScope = this.normalizeMemoryAccessScope(
      data.accessScope,
      existing?.accessScope ?? 'WORKSPACE',
    );
    const lifecycleStatus = this.normalizeMemoryLifecycleStatus(
      data.lifecycleStatus,
      false,
      existing?.lifecycleStatus ?? 'ACTIVE',
    );
    const retentionDays = this.normalizeMemoryRetentionDays(
      data.retentionDays,
      classification,
      existing?.retentionDays,
    );

    if (classification === 'RESTRICTED' && accessScope !== 'OWNER_ONLY') {
      throw new BadRequestException('RESTRICTED memory entries must use OWNER_ONLY access scope');
    }

    return {
      category: this.normalizeMemoryCategory(data.category, existing?.category ?? 'GENERAL'),
      classification,
      accessScope,
      lifecycleStatus,
      retentionDays,
      expiresAt: this.computeMemoryExpiry(retentionDays),
      tags: this.normalizeMemoryTags(data.tags),
    };
  }

  private normalizeMemoryQuery(query?: {
    search?: string;
    category?: string;
    classification?: string;
    accessScope?: string;
    lifecycleStatus?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }) {
    const pageSize = this.parseBoundedInteger(query?.pageSize, 'pageSize', 50, 100);
    const page = this.parseBoundedInteger(query?.page, 'page', 1, 10000);
    const sortBy = query?.sortBy || 'createdAt';
    if (!(MEMORY_SORT_FIELDS as readonly string[]).includes(sortBy)) {
      throw new BadRequestException(`sortBy must be one of: ${MEMORY_SORT_FIELDS.join(', ')}`);
    }

    const sortOrder = query?.sortOrder || 'desc';
    if (!['asc', 'desc'].includes(sortOrder)) {
      throw new BadRequestException('sortOrder must be asc or desc');
    }

    if (query?.search !== undefined) {
      if (typeof query.search !== 'string') {
        throw new BadRequestException('search must be a string');
      }
      if (query.search.length > MAX_MEMORY_SEARCH_LENGTH) {
        throw new BadRequestException(
          `search must be at most ${MAX_MEMORY_SEARCH_LENGTH} characters`,
        );
      }
    }

    return {
      pageSize,
      page,
      skip: (page - 1) * pageSize,
      sortBy,
      sortOrder,
      category:
        query?.category !== undefined
          ? this.normalizeMemoryCategory(query.category, 'GENERAL')
          : undefined,
      classification:
        query?.classification !== undefined
          ? this.normalizeMemoryClassification(query.classification)
          : undefined,
      accessScope:
        query?.accessScope !== undefined
          ? this.normalizeMemoryAccessScope(query.accessScope)
          : undefined,
      lifecycleStatus:
        query?.lifecycleStatus !== undefined
          ? this.normalizeMemoryLifecycleStatus(query.lifecycleStatus, true)
          : undefined,
      search: query?.search?.trim() || undefined,
    };
  }

  private async syncExpiredMemoryEntries(workspaceId: string) {
    await this.prisma.memoryEntry.updateMany({
      where: {
        workspaceId,
        deletedAt: null,
        lifecycleStatus: { not: 'EXPIRED' },
        expiresAt: { lte: new Date() },
      },
      data: { lifecycleStatus: 'EXPIRED' },
    });
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

  async getAgentDetails(agentId: string, workspaceId: string) {
    const item = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId, status: { not: 'ARCHIVED' } },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Agent not found');
    }

    return item;
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
    actorId: string,
    query?: {
      search?: string;
      category?: string;
      classification?: string;
      accessScope?: string;
      lifecycleStatus?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    await this.syncExpiredMemoryEntries(workspaceId);
    const normalized = this.normalizeMemoryQuery(query);

    return this.prisma.memoryEntry.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(normalized.category && { category: normalized.category }),
        ...(normalized.classification && { classification: normalized.classification as any }),
        ...(normalized.accessScope && { accessScope: normalized.accessScope as any }),
        ...(normalized.lifecycleStatus && { lifecycleStatus: normalized.lifecycleStatus as any }),
        AND: [
          {
            OR: [{ accessScope: 'WORKSPACE' }, { ownerId: actorId }],
          },
          ...(normalized.search
            ? [
                {
                  OR: [
                    { title: { contains: normalized.search, mode: 'insensitive' as const } },
                    { content: { contains: normalized.search, mode: 'insensitive' as const } },
                    { category: { contains: normalized.search, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { [normalized.sortBy]: normalized.sortOrder } as any,
      skip: normalized.skip,
      take: normalized.pageSize,
    });
  }

  async getMemoryDetails(memoryId: string, workspaceId: string, actorId: string) {
    await this.syncExpiredMemoryEntries(workspaceId);

    const item = await this.prisma.memoryEntry.findFirst({
      where: {
        id: memoryId,
        workspaceId,
        deletedAt: null,
        AND: [{ OR: [{ accessScope: 'WORKSPACE' }, { ownerId: actorId }] }],
      },
    });

    if (!item) {
      throw new NotFoundException('Memory entry not found');
    }

    return item;
  }

  async createMemory(
    workspaceId: string,
    ownerId: string,
    data: {
      title: string;
      content: string;
      category?: string;
      classification?: string;
      accessScope?: string;
      lifecycleStatus?: string;
      retentionDays?: number;
      tags?: string[];
    },
    auditContext: MutationAuditContext,
  ) {
    try {
      this.assertNonEmpty(data.title, 'title');
      this.assertNonEmpty(data.content, 'content');
      const governance = this.buildMemoryGovernancePayload(data);

      const created = await this.prisma.memoryEntry.create({
        data: {
          title: this.normalizeMemoryTitle(data.title)!,
          content: this.normalizeMemoryContent(data.content)!,
          category: governance.category,
          classification: governance.classification as any,
          accessScope: governance.accessScope as any,
          lifecycleStatus: governance.lifecycleStatus as any,
          retentionDays: governance.retentionDays,
          expiresAt: governance.expiresAt,
          tags: governance.tags,
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
        after: {
          id: created.id,
          title: created.title,
          classification: created.classification,
          accessScope: created.accessScope,
          lifecycleStatus: created.lifecycleStatus,
          expiresAt: created.expiresAt,
          deletedAt: created.deletedAt,
        },
        context: auditContext,
        metadata: {
          classification: created.classification,
          accessScope: created.accessScope,
          lifecycleStatus: created.lifecycleStatus,
          retentionDays: created.retentionDays,
          expiresAt: created.expiresAt.toISOString(),
        },
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
    data: {
      title?: string;
      content?: string;
      category?: string;
      classification?: string;
      accessScope?: string;
      lifecycleStatus?: string;
      retentionDays?: number;
      tags?: string[];
    },
    auditContext: MutationAuditContext,
  ) {
    let existing: any = null;
    try {
      await this.syncExpiredMemoryEntries(workspaceId);
      existing = await this.prisma.memoryEntry.findFirst({
        where: {
          id: memoryId,
          workspaceId,
          deletedAt: null,
          AND: [{ OR: [{ accessScope: 'WORKSPACE' }, { ownerId: auditContext.actorId }] }],
        },
      });
      if (!existing) {
        throw new NotFoundException('Memory entry not found');
      }
      if (existing.lifecycleStatus === 'EXPIRED') {
        throw new BadRequestException('Expired memory entries cannot be mutated');
      }
      const requestedLifecycleStatus =
        data.lifecycleStatus !== undefined
          ? this.normalizeMemoryLifecycleStatus(data.lifecycleStatus)
          : existing.lifecycleStatus;
      if (existing.lifecycleStatus === 'LOCKED' && requestedLifecycleStatus !== 'ACTIVE') {
        throw new BadRequestException('Locked memory entries must be reactivated before mutation');
      }

      const governance = this.buildMemoryGovernancePayload(data, existing);
      const nextTitle =
        data.title !== undefined ? this.normalizeMemoryTitle(data.title)! : existing.title;
      const nextContent =
        data.content !== undefined ? this.normalizeMemoryContent(data.content)! : existing.content;

      const updated = await this.prisma.memoryEntry.update({
        where: { id: existing.id },
        data: {
          title: nextTitle,
          content: nextContent,
          category: governance.category,
          classification: governance.classification as any,
          accessScope: governance.accessScope as any,
          lifecycleStatus: governance.lifecycleStatus as any,
          retentionDays: governance.retentionDays,
          expiresAt: governance.expiresAt,
          tags: governance.tags,
        },
      });

      await this.logMutationSuccess({
        action: 'MEMORY_UPDATED',
        resourceType: 'MemoryEntry',
        resourceId: updated.id,
        workspaceId,
        before: {
          title: existing.title,
          classification: existing.classification,
          accessScope: existing.accessScope,
          lifecycleStatus: existing.lifecycleStatus,
          retentionDays: existing.retentionDays,
          expiresAt: existing.expiresAt,
          deletedAt: existing.deletedAt,
        },
        after: {
          title: updated.title,
          classification: updated.classification,
          accessScope: updated.accessScope,
          lifecycleStatus: updated.lifecycleStatus,
          retentionDays: updated.retentionDays,
          expiresAt: updated.expiresAt,
          deletedAt: updated.deletedAt,
        },
        context: auditContext,
        metadata: {
          classification: updated.classification,
          accessScope: updated.accessScope,
          lifecycleStatus: updated.lifecycleStatus,
          retentionDays: updated.retentionDays,
          expiresAt: updated.expiresAt.toISOString(),
        },
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
      await this.syncExpiredMemoryEntries(workspaceId);
      existing = await this.prisma.memoryEntry.findFirst({
        where: {
          id: memoryId,
          workspaceId,
          deletedAt: null,
          AND: [{ OR: [{ accessScope: 'WORKSPACE' }, { ownerId: auditContext.actorId }] }],
        },
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
        before: {
          title: existing.title,
          classification: existing.classification,
          accessScope: existing.accessScope,
          lifecycleStatus: existing.lifecycleStatus,
          retentionDays: existing.retentionDays,
          expiresAt: existing.expiresAt,
          deletedAt: existing.deletedAt,
        },
        after: { deletedAt: true, lifecycleStatus: existing.lifecycleStatus },
        context: auditContext,
        metadata: {
          classification: existing.classification,
          accessScope: existing.accessScope,
          lifecycleStatus: existing.lifecycleStatus,
          retentionDays: existing.retentionDays,
          expiresAt: existing.expiresAt?.toISOString?.() ?? existing.expiresAt,
        },
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

  private normalizeReportingDateRange(from?: string, to?: string) {
    const parseDate = (value?: string, field?: string) => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`${field} must be a valid ISO date`);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        if (field === 'to') {
          parsed.setUTCHours(23, 59, 59, 999);
        } else {
          parsed.setUTCHours(0, 0, 0, 0);
        }
      }
      return parsed;
    };

    const fromDate = parseDate(from, 'from');
    const toDate = parseDate(to, 'to');
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be less than or equal to to');
    }

    return { fromDate, toDate };
  }

  private buildCreatedAtFilter(fromDate?: Date, toDate?: Date) {
    if (!fromDate && !toDate) {
      return undefined;
    }

    return {
      ...(fromDate && { gte: fromDate }),
      ...(toDate && { lte: toDate }),
    };
  }

  private normalizeReportingSortOrder(value?: string) {
    if (!value) return 'desc' as const;
    if (value !== 'asc' && value !== 'desc') {
      throw new BadRequestException('sortOrder must be asc or desc');
    }
    return value;
  }

  private normalizeReportingSortBy(value: unknown, allowed: readonly string[], fallback: string) {
    if (!value) return fallback;
    if (typeof value !== 'string' || !allowed.includes(value)) {
      return fallback;
    }
    return value;
  }

  private normalizeReportingSearch(value?: string) {
    if (!value) return undefined;
    if (typeof value !== 'string') {
      throw new BadRequestException('search must be a string');
    }
    const search = value.trim();
    if (!search) return undefined;
    if (search.length > MAX_MEMORY_SEARCH_LENGTH) {
      throw new BadRequestException(
        `search must be at most ${MAX_MEMORY_SEARCH_LENGTH} characters`,
      );
    }
    return search;
  }

  private normalizeReportingPagination(page?: number, pageSize?: number) {
    const normalizedPage = this.parseBoundedInteger(page, 'page', 1, 10000);
    const normalizedPageSize = this.parseBoundedInteger(pageSize, 'pageSize', 20, 100);
    return {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      skip: (normalizedPage - 1) * normalizedPageSize,
    };
  }

  private summarizeAuditFailures(rows: Array<{ action: string; status: string; metadata: any }>) {
    const failedRows = rows.filter((row) => row.status === 'FAILED');
    const failedByAction = failedRows.reduce(
      (acc, row) => {
        acc[row.action] = (acc[row.action] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const validationErrorCount = failedRows.filter((row) => {
      const message = String(row.metadata?.error ?? '').toLowerCase();
      return (
        message.includes('must') ||
        message.includes('invalid') ||
        message.includes('required') ||
        message.includes('cannot')
      );
    }).length;

    return {
      failedCount: failedRows.length,
      failedByAction,
      validationErrorCount,
    };
  }

  async getReports(
    workspaceId: string,
    actorId: string,
    query?: {
      search?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      module?:
        | 'all'
        | 'intelligence'
        | 'evidence'
        | 'provider'
        | 'tool'
        | 'workspace'
        | 'memory'
        | 'sovereignty';
      includeDetails?: boolean;
    },
  ) {
    const { fromDate, toDate } = this.normalizeReportingDateRange(query?.from, query?.to);
    const createdAt = this.buildCreatedAtFilter(fromDate, toDate);
    const search = this.normalizeReportingSearch(query?.search);
    const { page, pageSize, skip } = this.normalizeReportingPagination(
      query?.page,
      query?.pageSize,
    );
    const sortOrder = this.normalizeReportingSortOrder(query?.sortOrder);
    const includeDetails = Boolean(query?.includeDetails);
    const moduleFilter = query?.module || 'all';

    const intelligenceWhere: any = {
      workspaceId,
      state: { not: 'ARCHIVED' },
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { semanticSummary: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const evidenceWhere: any = {
      workspaceId,
      deletedAt: null,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { intent: { contains: search, mode: 'insensitive' } },
          { judgment: { contains: search, mode: 'insensitive' } },
          { outcome: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const providerWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { providerName: { contains: search, mode: 'insensitive' } },
          { providerId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const toolWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { toolName: { contains: search, mode: 'insensitive' } },
          { toolId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const projectWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const agentWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const sourceWhere: any = {
      workspaceId,
      deletedAt: null,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { resource: { contains: search, mode: 'insensitive' } },
          { actorId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const evaluationWhere: any = {
      deletedAt: null,
      provider: {
        workspaceId,
      },
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { intent: { contains: search, mode: 'insensitive' } },
          { context: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const memoryWhere: any = {
      workspaceId,
      deletedAt: null,
      ...(createdAt && { createdAt }),
      AND: [
        {
          OR: [{ accessScope: 'WORKSPACE' }, { ownerId: actorId }],
        },
        ...(search
          ? [
              {
                OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { content: { contains: search, mode: 'insensitive' } },
                  { category: { contains: search, mode: 'insensitive' } },
                ],
              },
            ]
          : []),
      ],
    };

    const governanceWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { decisionType: { contains: search, mode: 'insensitive' } },
          { outcome: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const capitalWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { type: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const sovereigntyMetricWhere: any = {
      ...(createdAt && { createdAt }),
    };

    const auditWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(search && {
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { resourceType: { contains: search, mode: 'insensitive' } },
          { resource: { contains: search, mode: 'insensitive' } },
          { actorId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [
      intelligenceCount,
      evidenceCount,
      providerActiveCount,
      providerInactiveCount,
      toolActiveCount,
      toolInactiveCount,
      projectActiveCount,
      agentActiveCount,
      sourceCount,
      evaluationCount,
      memoryCount,
      governanceCount,
      totalCapital,
      evidenceConfidenceStats,
      intelligenceCapitalStats,
      auditTotalCount,
      sovereigntyMetricCount,
      recentSovereigntyMetrics,
      topProviders,
      auditRows,
    ] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: intelligenceWhere }),
      this.prisma.evidenceRecord.count({ where: evidenceWhere }),
      this.prisma.providerProfile.count({
        where: { ...providerWhere, status: { not: 'INACTIVE' } },
      }),
      this.prisma.providerProfile.count({ where: { ...providerWhere, status: 'INACTIVE' } }),
      this.prisma.toolProfile.count({ where: { ...toolWhere, status: { not: 'INACTIVE' } } }),
      this.prisma.toolProfile.count({ where: { ...toolWhere, status: 'INACTIVE' } }),
      this.prisma.project.count({ where: { ...projectWhere, status: { not: 'ARCHIVED' } } }),
      this.prisma.agent.count({ where: { ...agentWhere, status: { not: 'ARCHIVED' } } }),
      this.prisma.provenanceRecord.count({ where: sourceWhere }),
      this.prisma.providerEvaluation.count({ where: evaluationWhere }),
      this.prisma.memoryEntry.count({ where: memoryWhere }),
      this.prisma.governanceDecision.count({ where: governanceWhere }),
      this.prisma.capitalRecord.aggregate({
        where: capitalWhere,
        _sum: { amount: true },
        _avg: { amount: true },
      }),
      this.prisma.evidenceRecord.aggregate({
        where: evidenceWhere,
        _avg: { confidence: true },
        _sum: { cost: true },
      }),
      this.prisma.intelligenceObject.aggregate({
        where: intelligenceWhere,
        _avg: { amanahScore: true, qualityIndex: true },
        _sum: { capitalValue: true },
      }),
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.sovereigntyMetric.count({ where: sovereigntyMetricWhere }),
      this.prisma.sovereigntyMetric.findMany({
        where: sovereigntyMetricWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.providerProfile.findMany({
        where: { ...providerWhere, status: { not: 'INACTIVE' } },
        orderBy: { iseScore: 'desc' },
        take: 5,
        select: { id: true, providerId: true, providerName: true, iseScore: true, status: true },
      }),
      this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { action: true, status: true, metadata: true, createdAt: true },
      }),
    ]);

    const failedAuditCount = auditRows.filter((row) => row.status === 'FAILED').length;
    const successfulAuditCount = auditRows.length - failedAuditCount;
    const crudActivitySummary = auditRows.reduce(
      (acc, row) => {
        if (row.action.endsWith('_CREATED')) acc.created += 1;
        if (row.action.endsWith('_UPDATED')) acc.updated += 1;
        if (row.action.endsWith('_DELETED')) acc.deleted += 1;
        return acc;
      },
      { created: 0, updated: 0, deleted: 0 },
    );

    const auditFailures = this.summarizeAuditFailures(auditRows);
    const healthStatus = failedAuditCount > 0 && auditRows.length > 0 ? 'degraded' : 'ok';

    const memoryByClassification: Record<string, number> = {};
    const memoryByLifecycle: Record<string, number> = {};
    for (const classification of MEMORY_CLASSIFICATIONS) {
      memoryByClassification[classification] = await this.prisma.memoryEntry.count({
        where: {
          ...memoryWhere,
          classification: classification as any,
        },
      });
    }
    for (const lifecycleStatus of MEMORY_LIFECYCLE_STATUSES) {
      memoryByLifecycle[lifecycleStatus] = await this.prisma.memoryEntry.count({
        where: {
          ...memoryWhere,
          lifecycleStatus: lifecycleStatus as any,
        },
      });
    }

    const result: any = {
      pending: false,
      snapshot: {
        intelligenceCount,
        evidenceCount,
        governanceCount,
        totalCapital: totalCapital._sum.amount || 0,
      },
      statistics: {
        averageEvidenceConfidence: evidenceConfidenceStats._avg.confidence || 0,
        totalEvidenceCost: evidenceConfidenceStats._sum.cost || 0,
        averageAmanahScore: intelligenceCapitalStats._avg.amanahScore || 0,
        averageQualityIndex: intelligenceCapitalStats._avg.qualityIndex || 0,
        totalIntelligenceCapital: intelligenceCapitalStats._sum.capitalValue || 0,
        averageCapitalRecordAmount: totalCapital._avg.amount || 0,
      },
      counts: {
        intelligence: intelligenceCount,
        evidence: evidenceCount,
        provider: providerActiveCount,
        tool: toolActiveCount,
        workspace: {
          projects: projectActiveCount,
          agents: agentActiveCount,
          sources: sourceCount,
          evaluations: evaluationCount,
        },
        memory: memoryCount,
        sovereignty: sovereigntyMetricCount,
      },
      healthSummary: {
        status: healthStatus,
        auditFailureRate:
          auditRows.length > 0
            ? Math.round((failedAuditCount / auditRows.length) * 10000) / 100
            : 0,
        totalAuditedEvents: auditTotalCount,
      },
      auditSummary: {
        total: auditTotalCount,
        successful: successfulAuditCount,
        failed: failedAuditCount,
        range: {
          from: fromDate?.toISOString() || null,
          to: toDate?.toISOString() || null,
        },
      },
      memorySummary: {
        total: memoryCount,
        byClassification: memoryByClassification,
        byLifecycle: memoryByLifecycle,
      },
      crudActivitySummary,
      providerSummary: {
        active: providerActiveCount,
        inactive: providerInactiveCount,
        topByIseScore: topProviders,
      },
      toolSummary: {
        active: toolActiveCount,
        inactive: toolInactiveCount,
      },
      workspaceSummary: {
        projectsActive: projectActiveCount,
        agentsActive: agentActiveCount,
        sourcesActive: sourceCount,
        evaluationsActive: evaluationCount,
      },
      errorSummary: {
        totalFailed: auditFailures.failedCount,
        failedByAction: auditFailures.failedByAction,
      },
      validationSummary: {
        validationErrorCount: auditFailures.validationErrorCount,
      },
      sovereigntySummary: {
        metricCount: sovereigntyMetricCount,
        latestMetrics: recentSovereigntyMetrics,
      },
      filtersApplied: {
        search: search || null,
        from: fromDate?.toISOString() || null,
        to: toDate?.toISOString() || null,
      },
    };

    if (!includeDetails) {
      return result;
    }

    const details: Record<string, unknown> = {};
    const includeAll = moduleFilter === 'all';

    if (includeAll || moduleFilter === 'intelligence') {
      const sortBy = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'updatedAt', 'name', 'amanahScore', 'qualityIndex'],
        'createdAt',
      );
      const [total, items] = await Promise.all([
        this.prisma.intelligenceObject.count({ where: intelligenceWhere }),
        this.prisma.intelligenceObject.findMany({
          where: intelligenceWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);
      details.intelligence = { total, page, pageSize, items };
    }

    if (includeAll || moduleFilter === 'evidence') {
      const sortBy = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'intent', 'confidence', 'cost'],
        'createdAt',
      );
      const [total, items] = await Promise.all([
        this.prisma.evidenceRecord.count({ where: evidenceWhere }),
        this.prisma.evidenceRecord.findMany({
          where: evidenceWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);
      details.evidence = { total, page, pageSize, items };
    }

    if (includeAll || moduleFilter === 'provider') {
      const sortBy = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'priority', 'iseScore', 'providerName'],
        'createdAt',
      );
      const [total, items] = await Promise.all([
        this.prisma.providerProfile.count({ where: providerWhere }),
        this.prisma.providerProfile.findMany({
          where: providerWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);
      details.provider = { total, page, pageSize, items };
    }

    if (includeAll || moduleFilter === 'tool') {
      const sortBy = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'toolName', 'category', 'costPerCall'],
        'createdAt',
      );
      const [total, items] = await Promise.all([
        this.prisma.toolProfile.count({ where: toolWhere }),
        this.prisma.toolProfile.findMany({
          where: toolWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);
      details.tool = { total, page, pageSize, items };
    }

    if (includeAll || moduleFilter === 'workspace') {
      const sortByProject = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'name', 'status'],
        'createdAt',
      );
      const sortBySource = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'action', 'resource'],
        'createdAt',
      );
      const sortByEvaluation = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'intent', 'iseScore'],
        'createdAt',
      );

      const [
        projectsTotal,
        projects,
        agentsTotal,
        agents,
        sourcesTotal,
        sources,
        evaluationsTotal,
        evaluations,
      ] = await Promise.all([
        this.prisma.project.count({ where: projectWhere }),
        this.prisma.project.findMany({
          where: projectWhere,
          orderBy: { [sortByProject]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
        this.prisma.agent.count({ where: agentWhere }),
        this.prisma.agent.findMany({
          where: agentWhere,
          orderBy: { [sortByProject]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
        this.prisma.provenanceRecord.count({ where: sourceWhere }),
        this.prisma.provenanceRecord.findMany({
          where: sourceWhere,
          orderBy: { [sortBySource]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
        this.prisma.providerEvaluation.count({ where: evaluationWhere }),
        this.prisma.providerEvaluation.findMany({
          where: evaluationWhere,
          orderBy: { [sortByEvaluation]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);

      details.workspace = {
        projects: { total: projectsTotal, page, pageSize, items: projects },
        agents: { total: agentsTotal, page, pageSize, items: agents },
        sources: { total: sourcesTotal, page, pageSize, items: sources },
        evaluations: { total: evaluationsTotal, page, pageSize, items: evaluations },
      };
    }

    if (includeAll || moduleFilter === 'memory') {
      const sortBy = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'updatedAt', 'title', 'classification', 'lifecycleStatus', 'expiresAt'],
        'createdAt',
      );
      const [total, items] = await Promise.all([
        this.prisma.memoryEntry.count({ where: memoryWhere }),
        this.prisma.memoryEntry.findMany({
          where: memoryWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);
      details.memory = { total, page, pageSize, items };
    }

    if (includeAll || moduleFilter === 'sovereignty') {
      const sortBy = this.normalizeReportingSortBy(
        query?.sortBy,
        ['createdAt', 'value', 'ksr', 'pdr', 'krr', 'kor', 'scg', 'sai'],
        'createdAt',
      );
      const [total, items] = await Promise.all([
        this.prisma.sovereigntyMetric.count({ where: sovereigntyMetricWhere }),
        this.prisma.sovereigntyMetric.findMany({
          where: sovereigntyMetricWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          skip,
          take: pageSize,
        }),
      ]);
      details.sovereignty = { total, page, pageSize, items };
    }

    result.details = details;
    return result;
  }

  async listReportGovernance(
    workspaceId: string,
    query?: {
      search?: string;
      from?: string;
      to?: string;
      decisionType?: string;
      outcome?: string;
      actorId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const { fromDate, toDate } = this.normalizeReportingDateRange(query?.from, query?.to);
    const createdAt = this.buildCreatedAtFilter(fromDate, toDate);
    const search = this.normalizeReportingSearch(query?.search);
    const { pageSize, skip } = this.normalizeReportingPagination(query?.page, query?.pageSize);
    const sortBy = this.normalizeReportingSortBy(
      query?.sortBy,
      ['createdAt', 'decisionType', 'outcome', 'confidence', 'amanahScore'],
      'createdAt',
    );
    const sortOrder = this.normalizeReportingSortOrder(query?.sortOrder);

    return this.prisma.governanceDecision.findMany({
      where: {
        workspaceId,
        ...(createdAt && { createdAt }),
        ...(query?.decisionType && {
          decisionType: { equals: query.decisionType, mode: 'insensitive' },
        }),
        ...(query?.outcome && { outcome: { equals: query.outcome, mode: 'insensitive' } }),
        ...(query?.actorId && { actorId: query.actorId }),
        ...(search && {
          OR: [
            { decisionType: { contains: search, mode: 'insensitive' } },
            { outcome: { contains: search, mode: 'insensitive' } },
            { actorId: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async listReportCapital(
    workspaceId: string,
    query?: {
      search?: string;
      from?: string;
      to?: string;
      category?: string;
      type?: string;
      ownerId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const { fromDate, toDate } = this.normalizeReportingDateRange(query?.from, query?.to);
    const createdAt = this.buildCreatedAtFilter(fromDate, toDate);
    const search = this.normalizeReportingSearch(query?.search);
    const { pageSize, skip } = this.normalizeReportingPagination(query?.page, query?.pageSize);
    const sortBy = this.normalizeReportingSortBy(
      query?.sortBy,
      ['createdAt', 'amount', 'type', 'category'],
      'createdAt',
    );
    const sortOrder = this.normalizeReportingSortOrder(query?.sortOrder);

    return this.prisma.capitalRecord.findMany({
      where: {
        workspaceId,
        ...(createdAt && { createdAt }),
        ...(query?.category && { category: query.category as any }),
        ...(query?.type && { type: { equals: query.type, mode: 'insensitive' } }),
        ...(query?.ownerId && { ownerId: query.ownerId }),
        ...(search && {
          OR: [
            { type: { contains: search, mode: 'insensitive' } },
            { ownerId: { contains: search, mode: 'insensitive' } },
            { sourceObjectId: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async getMonitoring(
    workspaceId: string,
    query?: {
      search?: string;
      from?: string;
      to?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const { fromDate, toDate } = this.normalizeReportingDateRange(query?.from, query?.to);
    const createdAt = this.buildCreatedAtFilter(fromDate, toDate);
    const search = this.normalizeReportingSearch(query?.search);
    const sortBy = this.normalizeReportingSortBy(
      query?.sortBy,
      ['createdAt', 'action', 'status'],
      'createdAt',
    );
    const sortOrder = this.normalizeReportingSortOrder(query?.sortOrder);

    const auditWhere: any = {
      workspaceId,
      ...(createdAt && { createdAt }),
      ...(query?.status && { status: { equals: query.status, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { resourceType: { contains: search, mode: 'insensitive' } },
          { resource: { contains: search, mode: 'insensitive' } },
          { actorId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [auditCount, recentAudit, evidenceCount, memoryCount, providerCount, toolCount] =
      await Promise.all([
        this.prisma.auditLog.count({ where: auditWhere }),
        this.prisma.auditLog.findMany({
          where: auditWhere,
          orderBy: { [sortBy]: sortOrder } as any,
          take: 20,
        }),
        this.prisma.evidenceRecord.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.memoryEntry.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.providerProfile.count({ where: { workspaceId, status: { not: 'INACTIVE' } } }),
        this.prisma.toolProfile.count({ where: { workspaceId, status: { not: 'INACTIVE' } } }),
      ]);

    const failedCount = recentAudit.filter((entry) => entry.status === 'FAILED').length;
    const validationCount = recentAudit.filter((entry) => {
      const message = String((entry as any).metadata?.error || '').toLowerCase();
      return (
        message.includes('must') || message.includes('required') || message.includes('invalid')
      );
    }).length;

    return {
      pending: false,
      status: failedCount > 0 ? 'degraded' : 'ok',
      metrics: {
        auditCount,
        evidenceCount,
        memoryCount,
        providerCount,
        toolCount,
        failedAuditCount: failedCount,
        validationIssueCount: validationCount,
      },
      healthSummary: {
        status: failedCount > 0 ? 'degraded' : 'ok',
        range: {
          from: fromDate?.toISOString() || null,
          to: toDate?.toISOString() || null,
        },
      },
      recentAudit,
    };
  }

  async listMonitoringAudit(
    workspaceId: string,
    query?: {
      search?: string;
      from?: string;
      to?: string;
      action?: string;
      resourceType?: string;
      resource?: string;
      actorId?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const { fromDate, toDate } = this.normalizeReportingDateRange(query?.from, query?.to);
    const createdAt = this.buildCreatedAtFilter(fromDate, toDate);
    const search = this.normalizeReportingSearch(query?.search);
    const { pageSize, skip } = this.normalizeReportingPagination(query?.page, query?.pageSize);
    const sortBy = this.normalizeReportingSortBy(
      query?.sortBy,
      ['createdAt', 'timestamp', 'action', 'resource', 'resourceType', 'status', 'actorId'],
      'createdAt',
    );
    const sortOrder = this.normalizeReportingSortOrder(query?.sortOrder);

    return this.prisma.auditLog.findMany({
      where: {
        workspaceId,
        ...(createdAt && { createdAt }),
        ...(query?.action && { action: { equals: query.action, mode: 'insensitive' } }),
        ...(query?.resourceType && {
          resourceType: { equals: query.resourceType, mode: 'insensitive' },
        }),
        ...(query?.resource && { resource: { equals: query.resource, mode: 'insensitive' } }),
        ...(query?.actorId && { actorId: query.actorId }),
        ...(query?.status && { status: { equals: query.status, mode: 'insensitive' } }),
        ...(search && {
          OR: [
            { action: { contains: search, mode: 'insensitive' } },
            { resource: { contains: search, mode: 'insensitive' } },
            { resourceType: { contains: search, mode: 'insensitive' } },
            { actorId: { contains: search, mode: 'insensitive' } },
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

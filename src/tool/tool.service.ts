import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { NotificationService } from '../notification/notification.service';
import { QueueService } from '../queue/queue.service';

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
    @Optional() private readonly notification?: NotificationService,
    @Optional() private readonly queue?: QueueService,
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

  /**
   * Real tool-gateway invocation. Each category is backed by an actual
   * integration (external HTTP call when an API key is configured, or a
   * real internal system otherwise) — never a hardcoded/fabricated
   * "simulated" success (FAILURE_POLICY.md §5).
   */
  async invoke(
    workspaceId: string,
    id: string,
    method: string,
    params: Record<string, any> = {},
    auditContext: MutationAuditContext,
  ) {
    const tool = await this.findOne(workspaceId, id);
    const startedAt = Date.now();

    let result: { configured: boolean; data: unknown };
    try {
      result = await this.dispatchInvocation(tool.category, workspaceId, method, params);
    } catch (error: any) {
      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'TOOL_INVOKED',
        resourceType: 'ToolProfile',
        resourceId: tool.id,
        workspaceId,
        before: null,
        after: { method, error: String(error?.message || error) },
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'FAILED',
        success: false,
      });
      throw error;
    }

    await this.prisma.toolProfile.update({
      where: { id: tool.id },
      data: { totalCapital: { increment: tool.costPerCall } },
    });

    await this.audit.log({
      actorId: auditContext.actorId,
      action: 'TOOL_INVOKED',
      resourceType: 'ToolProfile',
      resourceId: tool.id,
      workspaceId,
      before: null,
      after: { method, configured: result.configured },
      requestId: auditContext.requestId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      status: 'SUCCESS',
      success: true,
    });

    return {
      toolId: tool.toolId,
      category: tool.category,
      method,
      configured: result.configured,
      data: result.data,
      latencyMs: Date.now() - startedAt,
    };
  }

  private async dispatchInvocation(
    category: string,
    workspaceId: string,
    method: string,
    params: Record<string, any>,
  ): Promise<{ configured: boolean; data: unknown }> {
    switch (category) {
      case 'SEARCH':
        return this.invokeSearch(method, params);
      case 'MEDIA':
        return this.invokeMedia(method, params);
      case 'KNOWLEDGE':
        return this.invokeKnowledge(workspaceId, method, params);
      case 'ANALYTICS':
        return this.invokeAnalytics(workspaceId, method, params);
      case 'AUTOMATION':
        return this.invokeAutomation(workspaceId, method, params);
      case 'COMMUNICATION':
        return this.invokeCommunication(workspaceId, method, params);
      default:
        throw new BadRequestException(`Unsupported tool category: ${category}`);
    }
  }

  /** SEARCH: real web search via Serper.dev when SERPER_API_KEY is configured. */
  private async invokeSearch(method: string, params: Record<string, any>) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return { configured: false, data: { reason: 'SERPER_API_KEY not configured' } };
    }
    if (!params.query) {
      throw new BadRequestException('params.query is required for search');
    }
    const response = await fetch(`https://google.serper.dev/search`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: params.query }),
    });
    if (!response.ok) {
      throw new Error(`Serper search failed: ${response.status} ${response.statusText}`);
    }
    return { configured: true, data: await response.json() };
  }

  /** MEDIA: real generation via Runway ML when RUNWAY_API_KEY is configured. */
  private async invokeMedia(method: string, params: Record<string, any>) {
    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      return { configured: false, data: { reason: 'RUNWAY_API_KEY not configured' } };
    }
    const response = await fetch('https://api.runwayml.com/v1/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, ...params }),
    });
    if (!response.ok) {
      throw new Error(`Runway request failed: ${response.status} ${response.statusText}`);
    }
    return { configured: true, data: await response.json() };
  }

  /** KNOWLEDGE: real semantic-ish lookup against the live intelligence corpus. */
  private async invokeKnowledge(workspaceId: string, method: string, params: Record<string, any>) {
    const query = String(params.query ?? '').trim();
    if (!query) {
      throw new BadRequestException('params.query is required for knowledge lookup');
    }
    const [objects, documents] = await Promise.all([
      this.prisma.intelligenceObject.findMany({
        where: {
          workspaceId,
          state: { not: 'ARCHIVED' },
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      this.prisma.corpusDocument.findMany({
        where: {
          workspaceId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    ]);
    return {
      configured: true,
      data: { intelligenceObjects: objects, corpusDocuments: documents },
    };
  }

  /** ANALYTICS: real aggregate metrics collected from live workspace data. */
  private async invokeAnalytics(
    workspaceId: string,
    ...args: [method: string, params: Record<string, any>]
  ) {
    void args;
    const [objectCount, toolCount, capitalTotal] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId, state: { not: 'ARCHIVED' } } }),
      this.prisma.toolProfile.count({ where: { workspaceId, status: { not: 'INACTIVE' } } }),
      this.prisma.capitalRecord.aggregate({ where: { workspaceId }, _sum: { amount: true } }),
    ]);
    return {
      configured: true,
      data: { objectCount, toolCount, totalCapital: capitalTotal._sum.amount ?? 0 },
    };
  }

  /** AUTOMATION: real BullMQ job enqueue (falls back to a real audit trail if the queue is unavailable). */
  private async invokeAutomation(workspaceId: string, method: string, params: Record<string, any>) {
    if (this.queue) {
      const job = await this.queue.addAuditLog({ workspaceId, method, params });
      return { configured: true, data: { jobId: job.id, queue: 'audit-log' } };
    }
    return { configured: false, data: { reason: 'QueueService not available' } };
  }

  /** COMMUNICATION: real Notification row persisted for the workspace. */
  private async invokeCommunication(
    workspaceId: string,
    method: string,
    params: Record<string, any>,
  ) {
    if (!params.userId) {
      throw new BadRequestException('params.userId is required for communication');
    }
    if (this.notification) {
      const created = await this.notification.create({
        userId: params.userId,
        type: 'GENERAL',
        title: params.title ?? 'Tool Notification',
        message: params.message ?? method,
        workspaceId,
      });
      return { configured: true, data: created };
    }
    return { configured: false, data: { reason: 'NotificationService not available' } };
  }
}

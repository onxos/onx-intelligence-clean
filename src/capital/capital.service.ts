import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapitalCategory } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { ALLOCATION_STATUSES, CAPITAL_SORT_FIELDS, POLICY_STATUSES } from './dto/capital.dto';

type MutationAuditContext = {
  actorId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ALLOCATION_SORT_FIELDS = [...CAPITAL_SORT_FIELDS] as const;
const POLICY_SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'name', 'status'] as const;
const APPROVE_ALLOWED_STATUSES = ['APPROVED', 'ALLOCATED'] as const;
const REJECT_ALLOWED_STATUSES = ['REJECTED'] as const;

@Injectable()
export class CapitalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeText(value: unknown, field: string, required = false) {
    if (value === undefined || value === null) {
      if (required) {
        throw new BadRequestException(`${field} is required`);
      }
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (required && !normalized) {
      throw new BadRequestException(`${field} is required`);
    }
    return normalized || undefined;
  }

  private normalizeCurrency(value: unknown, fallback = 'USD') {
    const normalized = this.normalizeText(value, 'currency') ?? fallback;
    return normalized.toUpperCase();
  }

  private normalizePriority(value: unknown, fallback = 3) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
      throw new BadRequestException('priority must be an integer between 1 and 10');
    }
    return parsed;
  }

  private normalizeAmount(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    return parsed;
  }

  private normalizeSort<T extends readonly string[]>(
    value: unknown,
    allowed: T,
    fallback: T[number],
  ): T[number] {
    if (typeof value !== 'string' || !value) {
      return fallback;
    }
    if (!(allowed as readonly string[]).includes(value)) {
      throw new BadRequestException(`sortBy must be one of: ${allowed.join(', ')}`);
    }
    return value as T[number];
  }

  private normalizeSortOrder(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return 'desc' as const;
    }
    if (value !== 'asc' && value !== 'desc') {
      throw new BadRequestException('sortOrder must be asc or desc');
    }
    return value;
  }

  private normalizePage(value: unknown, field: string, fallback: number) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return parsed;
  }

  private normalizeSearch(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim();
    return normalized || undefined;
  }

  private resolveAllocationActionStatus(
    action: 'approve' | 'reject',
    statusOverride: unknown,
  ): 'APPROVED' | 'ALLOCATED' | 'REJECTED' {
    if (action === 'approve') {
      if (statusOverride === undefined || statusOverride === null || statusOverride === '') {
        return 'APPROVED';
      }
      if (APPROVE_ALLOWED_STATUSES.includes(statusOverride as any)) {
        return statusOverride as 'APPROVED' | 'ALLOCATED';
      }
      throw new BadRequestException(
        'approve supports status override only for APPROVED or ALLOCATED',
      );
    }

    if (statusOverride === undefined || statusOverride === null || statusOverride === '') {
      return 'REJECTED';
    }
    if (REJECT_ALLOWED_STATUSES.includes(statusOverride as any)) {
      return 'REJECTED';
    }
    throw new BadRequestException('reject supports status override only for REJECTED');
  }

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

  private sanitizeAllocation(allocation: any) {
    return {
      ...allocation,
      amount: Number(allocation.amount),
    };
  }

  private sanitizePolicy(policy: any) {
    return policy;
  }

  private async appendHistory(entry: {
    allocationId?: string;
    policyId?: string;
    workspaceId: string;
    actorId: string;
    action: string;
    status?: string;
    rationale?: string;
    decisionReason?: string;
    previousState?: Record<string, unknown> | null;
    nextState?: Record<string, unknown> | null;
  }) {
    await this.prisma.allocationHistory.create({
      data: {
        allocationId: entry.allocationId,
        policyId: entry.policyId,
        workspaceId: entry.workspaceId,
        actorId: entry.actorId,
        action: entry.action,
        status: entry.status,
        rationale: entry.rationale,
        decisionReason: entry.decisionReason,
        previousState: (entry.previousState ?? null) as any,
        nextState: (entry.nextState ?? null) as any,
      },
    });
  }

  private async ensurePolicyExists(policyId: string | undefined, workspaceId: string) {
    if (!policyId) {
      return null;
    }
    const policy = await this.getPolicy(policyId, workspaceId, undefined, true);
    if (policy.deletedAt) {
      throw new BadRequestException('policyId must reference an active policy');
    }
    return policy;
  }

  async listAllocations(
    workspaceId: string,
    ownerId: string,
    query?: {
      search?: string;
      category?: CapitalCategory;
      status?: (typeof ALLOCATION_STATUSES)[number];
      currency?: string;
      page?: number;
      pageSize?: number;
      sortBy?: (typeof ALLOCATION_SORT_FIELDS)[number];
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const search = this.normalizeSearch(query?.search);
    const page = this.normalizePage(query?.page, 'page', 1);
    const pageSize = Math.min(
      this.normalizePage(query?.pageSize, 'pageSize', DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = this.normalizeSort(query?.sortBy, ALLOCATION_SORT_FIELDS, 'createdAt');
    const sortOrder = this.normalizeSortOrder(query?.sortOrder);
    const currency = query?.currency ? this.normalizeCurrency(query.currency) : undefined;
    const skip = (page - 1) * pageSize;

    const items = await this.prisma.capitalAllocation.findMany({
      where: {
        workspaceId,
        ownerId,
        deletedAt: null,
        ...(query?.category && { category: query.category }),
        ...(query?.status && { status: query.status as any }),
        ...(currency && { currency }),
        ...(search && {
          OR: [
            { source: { contains: search, mode: 'insensitive' } },
            { target: { contains: search, mode: 'insensitive' } },
            { rationale: { contains: search, mode: 'insensitive' } },
            { decisionReason: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
    return items.map((item) => this.sanitizeAllocation(item));
  }

  async createAllocation(
    workspaceId: string,
    ownerId: string,
    body: Record<string, any>,
    context: MutationAuditContext,
  ) {
    let created: any = null;
    try {
      const amount = this.normalizeAmount(body.amount);
      const currency = this.normalizeCurrency(body.currency);
      const policy = await this.ensurePolicyExists(body.policyId, workspaceId);
      const normalizedStatus = (body.status ?? 'DRAFT') as (typeof ALLOCATION_STATUSES)[number];
      const input = {
        workspaceId,
        ownerId,
        policyId: body.policyId ?? null,
        category: body.category as CapitalCategory,
        amount,
        currency,
        source: this.normalizeText(body.source, 'source') ?? null,
        target: this.normalizeText(body.target, 'target') ?? null,
        status: normalizedStatus,
        priority: this.normalizePriority(body.priority),
        rationale: this.normalizeText(body.rationale, 'rationale') ?? null,
        decisionReason: null,
        approvalStatus:
          normalizedStatus === 'APPROVED' || normalizedStatus === 'ALLOCATED'
            ? 'APPROVED'
            : normalizedStatus === 'REJECTED'
              ? 'REJECTED'
              : 'PENDING',
        approvedBy: null,
        approvedAt: null,
        rejectedAt: null,
      } as const;

      created = await this.prisma.capitalAllocation.create({ data: input as any });

      await this.appendHistory({
        allocationId: created.id,
        workspaceId,
        actorId: context.actorId,
        action: 'CAPITAL_ALLOCATION_CREATED',
        status: created.status,
        rationale: created.rationale ?? undefined,
        previousState: null,
        nextState: this.sanitizeAllocation(created),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_ALLOCATION_CREATED',
        resourceType: 'CapitalAllocation',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: this.sanitizeAllocation(created),
        context,
        metadata: {
          policyId: policy?.id ?? null,
          category: created.category,
          amount: created.amount,
        },
      });

      return this.sanitizeAllocation(created);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_ALLOCATION_CREATED',
        resourceType: 'CapitalAllocation',
        resourceId: created?.id,
        workspaceId,
        before: null,
        context,
        error,
      });
      throw error;
    }
  }

  async getAllocation(
    id: string,
    workspaceId: string,
    ownerId?: string,
    includeDeleted = false,
  ): Promise<any> {
    const allocation = await this.prisma.capitalAllocation.findFirst({
      where: {
        id,
        workspaceId,
        ...(ownerId ? { ownerId } : {}),
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });

    if (!allocation) {
      throw new NotFoundException('Capital allocation not found');
    }
    return this.sanitizeAllocation(allocation);
  }

  async updateAllocation(
    id: string,
    workspaceId: string,
    ownerId: string,
    body: Record<string, any>,
    context: MutationAuditContext,
  ) {
    const existing = await this.getAllocation(id, workspaceId, ownerId);
    await this.ensurePolicyExists(body.policyId, workspaceId);
    const data = {
      ...(body.category !== undefined && { category: body.category }),
      ...(body.amount !== undefined && { amount: this.normalizeAmount(body.amount) }),
      ...(body.currency !== undefined && { currency: this.normalizeCurrency(body.currency) }),
      ...(body.source !== undefined && {
        source: this.normalizeText(body.source, 'source') ?? null,
      }),
      ...(body.target !== undefined && {
        target: this.normalizeText(body.target, 'target') ?? null,
      }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: this.normalizePriority(body.priority) }),
      ...(body.rationale !== undefined && {
        rationale: this.normalizeText(body.rationale, 'rationale') ?? null,
      }),
      ...(body.decisionReason !== undefined && {
        decisionReason: this.normalizeText(body.decisionReason, 'decisionReason') ?? null,
      }),
      ...(body.policyId !== undefined && { policyId: body.policyId || null }),
    };

    let updated: any = null;
    try {
      updated = await this.prisma.capitalAllocation.update({ where: { id }, data: data as any });

      await this.appendHistory({
        allocationId: id,
        workspaceId,
        actorId: context.actorId,
        action: 'CAPITAL_ALLOCATION_UPDATED',
        status: updated.status,
        rationale: updated.rationale ?? undefined,
        decisionReason: updated.decisionReason ?? undefined,
        previousState: existing,
        nextState: this.sanitizeAllocation(updated),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_ALLOCATION_UPDATED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizeAllocation(updated),
        context,
      });

      return this.sanitizeAllocation(updated);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_ALLOCATION_UPDATED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async deleteAllocation(
    id: string,
    workspaceId: string,
    actorId: string,
    context: MutationAuditContext,
  ) {
    const existing = await this.getAllocation(id, workspaceId, actorId);
    let deleted: any;
    try {
      deleted = await this.prisma.capitalAllocation.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' as any },
      });

      await this.appendHistory({
        allocationId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_ALLOCATION_DELETED',
        status: 'ARCHIVED',
        previousState: existing,
        nextState: this.sanitizeAllocation(deleted),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_ALLOCATION_DELETED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizeAllocation(deleted),
        context,
      });
      return { success: true, id };
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_ALLOCATION_DELETED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async restoreAllocation(
    id: string,
    workspaceId: string,
    actorId: string,
    context: MutationAuditContext,
  ) {
    const existing = await this.getAllocation(id, workspaceId, actorId, true);
    if (!existing.deletedAt) {
      throw new BadRequestException('Capital allocation is not deleted');
    }
    let restored: any;
    try {
      restored = await this.prisma.capitalAllocation.update({
        where: { id },
        data: { deletedAt: null, status: 'DRAFT' as any },
      });

      await this.appendHistory({
        allocationId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_ALLOCATION_RESTORED',
        status: restored.status,
        previousState: existing,
        nextState: this.sanitizeAllocation(restored),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_ALLOCATION_RESTORED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizeAllocation(restored),
        context,
      });
      return this.sanitizeAllocation(restored);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_ALLOCATION_RESTORED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  private async recordDecisionAndApproval(args: {
    allocationId: string;
    workspaceId: string;
    actorId: string;
    status: 'APPROVED' | 'REJECTED';
    decisionReason?: string;
    rationale?: string;
    priority: number;
  }) {
    await this.prisma.allocationDecision.create({
      data: {
        allocationId: args.allocationId,
        workspaceId: args.workspaceId,
        actorId: args.actorId,
        status: args.status,
        priority: args.priority,
        rationale: args.rationale,
        decisionReason: args.decisionReason,
      } as any,
    });
    await this.prisma.allocationApproval.create({
      data: {
        allocationId: args.allocationId,
        workspaceId: args.workspaceId,
        actorId: args.actorId,
        approvalStatus: args.status,
        approvedBy: args.status === 'APPROVED' ? args.actorId : null,
        approvedAt: args.status === 'APPROVED' ? new Date() : null,
        rejectedAt: args.status === 'REJECTED' ? new Date() : null,
        decisionReason: args.decisionReason,
      } as any,
    });
  }

  async approveAllocation(
    id: string,
    workspaceId: string,
    actorId: string,
    body: Record<string, any>,
    context: MutationAuditContext,
  ) {
    const existing = await this.getAllocation(id, workspaceId, actorId);
    if (existing.deletedAt) {
      throw new BadRequestException('Deleted allocations cannot be approved');
    }
    const resolvedStatus = this.resolveAllocationActionStatus('approve', body.status);
    let updated: any;
    const approvedAt = new Date();
    try {
      updated = await this.prisma.capitalAllocation.update({
        where: { id },
        data: {
          status: resolvedStatus as any,
          approvalStatus: 'APPROVED' as any,
          approvedBy: actorId,
          approvedAt,
          rejectedAt: null,
          rationale: body.rationale ?? existing.rationale,
          decisionReason: body.decisionReason ?? existing.decisionReason,
        },
      });

      await this.recordDecisionAndApproval({
        allocationId: id,
        workspaceId,
        actorId,
        status: 'APPROVED',
        decisionReason: body.decisionReason,
        rationale: body.rationale,
        priority: existing.priority,
      });

      await this.appendHistory({
        allocationId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_ALLOCATION_APPROVED',
        status: updated.status,
        rationale: updated.rationale ?? undefined,
        decisionReason: updated.decisionReason ?? undefined,
        previousState: existing,
        nextState: this.sanitizeAllocation(updated),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_ALLOCATION_APPROVED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizeAllocation(updated),
        context,
      });
      return this.sanitizeAllocation(updated);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_ALLOCATION_APPROVED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async rejectAllocation(
    id: string,
    workspaceId: string,
    actorId: string,
    body: Record<string, any>,
    context: MutationAuditContext,
  ) {
    const existing = await this.getAllocation(id, workspaceId, actorId);
    if (existing.deletedAt) {
      throw new BadRequestException('Deleted allocations cannot be rejected');
    }
    const resolvedStatus = this.resolveAllocationActionStatus('reject', body.status);
    let updated: any;
    const rejectedAt = new Date();
    try {
      updated = await this.prisma.capitalAllocation.update({
        where: { id },
        data: {
          status: resolvedStatus as any,
          approvalStatus: 'REJECTED' as any,
          rejectedAt,
          decisionReason: body.decisionReason ?? existing.decisionReason,
          rationale: body.rationale ?? existing.rationale,
        },
      });

      await this.recordDecisionAndApproval({
        allocationId: id,
        workspaceId,
        actorId,
        status: 'REJECTED',
        decisionReason: body.decisionReason,
        rationale: body.rationale,
        priority: existing.priority,
      });

      await this.appendHistory({
        allocationId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_ALLOCATION_REJECTED',
        status: updated.status,
        rationale: updated.rationale ?? undefined,
        decisionReason: updated.decisionReason ?? undefined,
        previousState: existing,
        nextState: this.sanitizeAllocation(updated),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_ALLOCATION_REJECTED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizeAllocation(updated),
        context,
      });
      return this.sanitizeAllocation(updated);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_ALLOCATION_REJECTED',
        resourceType: 'CapitalAllocation',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async listPolicies(
    workspaceId: string,
    ownerId: string,
    query?: {
      search?: string;
      category?: CapitalCategory;
      status?: (typeof POLICY_STATUSES)[number];
      page?: number;
      pageSize?: number;
      sortBy?: (typeof POLICY_SORT_FIELDS)[number];
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const search = this.normalizeSearch(query?.search);
    const page = this.normalizePage(query?.page, 'page', 1);
    const pageSize = Math.min(
      this.normalizePage(query?.pageSize, 'pageSize', DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = this.normalizeSort(query?.sortBy, POLICY_SORT_FIELDS, 'createdAt');
    const sortOrder = this.normalizeSortOrder(query?.sortOrder);
    const skip = (page - 1) * pageSize;

    const items = await this.prisma.allocationPolicy.findMany({
      where: {
        workspaceId,
        ownerId,
        deletedAt: null,
        ...(query?.category && { category: query.category }),
        ...(query?.status && { status: query.status as any }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { rationale: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
    return items.map((item) => this.sanitizePolicy(item));
  }

  async createPolicy(
    workspaceId: string,
    ownerId: string,
    body: Record<string, any>,
    context: MutationAuditContext,
  ) {
    const input = {
      workspaceId,
      ownerId,
      name: this.normalizeText(body.name, 'name', true),
      description: this.normalizeText(body.description, 'description') ?? null,
      category: body.category as CapitalCategory,
      currency: this.normalizeCurrency(body.currency),
      source: this.normalizeText(body.source, 'source') ?? null,
      target: this.normalizeText(body.target, 'target') ?? null,
      status: (body.status ?? 'ACTIVE') as (typeof POLICY_STATUSES)[number],
      priority: this.normalizePriority(body.priority),
      rationale: this.normalizeText(body.rationale, 'rationale') ?? null,
    };

    let created: any = null;
    try {
      created = await this.prisma.allocationPolicy.create({ data: input as any });

      await this.appendHistory({
        policyId: created.id,
        workspaceId,
        actorId: context.actorId,
        action: 'CAPITAL_POLICY_CREATED',
        status: created.status,
        rationale: created.rationale ?? undefined,
        previousState: null,
        nextState: this.sanitizePolicy(created),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_POLICY_CREATED',
        resourceType: 'AllocationPolicy',
        resourceId: created.id,
        workspaceId,
        before: null,
        after: this.sanitizePolicy(created),
        context,
      });
      return this.sanitizePolicy(created);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_POLICY_CREATED',
        resourceType: 'AllocationPolicy',
        resourceId: created?.id,
        workspaceId,
        before: null,
        context,
        error,
      });
      throw error;
    }
  }

  async getPolicy(
    id: string,
    workspaceId: string,
    ownerId?: string,
    includeDeleted = false,
  ): Promise<any> {
    const policy = await this.prisma.allocationPolicy.findFirst({
      where: {
        id,
        workspaceId,
        ...(ownerId ? { ownerId } : {}),
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
    if (!policy) {
      throw new NotFoundException('Allocation policy not found');
    }
    return this.sanitizePolicy(policy);
  }

  async updatePolicy(
    id: string,
    workspaceId: string,
    actorId: string,
    body: Record<string, any>,
    context: MutationAuditContext,
  ) {
    const existing = await this.getPolicy(id, workspaceId, actorId);
    const data = {
      ...(body.name !== undefined && { name: this.normalizeText(body.name, 'name', true) }),
      ...(body.description !== undefined && {
        description: this.normalizeText(body.description, 'description') ?? null,
      }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.currency !== undefined && { currency: this.normalizeCurrency(body.currency) }),
      ...(body.source !== undefined && {
        source: this.normalizeText(body.source, 'source') ?? null,
      }),
      ...(body.target !== undefined && {
        target: this.normalizeText(body.target, 'target') ?? null,
      }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: this.normalizePriority(body.priority) }),
      ...(body.rationale !== undefined && {
        rationale: this.normalizeText(body.rationale, 'rationale') ?? null,
      }),
    };

    let updated: any = null;
    try {
      updated = await this.prisma.allocationPolicy.update({ where: { id }, data: data as any });

      await this.appendHistory({
        policyId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_POLICY_UPDATED',
        status: updated.status,
        rationale: updated.rationale ?? undefined,
        previousState: existing,
        nextState: this.sanitizePolicy(updated),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_POLICY_UPDATED',
        resourceType: 'AllocationPolicy',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizePolicy(updated),
        context,
      });
      return this.sanitizePolicy(updated);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_POLICY_UPDATED',
        resourceType: 'AllocationPolicy',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async deletePolicy(
    id: string,
    workspaceId: string,
    actorId: string,
    context: MutationAuditContext,
  ) {
    const existing = await this.getPolicy(id, workspaceId, actorId);
    let deleted: any;
    try {
      deleted = await this.prisma.allocationPolicy.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' as any },
      });

      await this.appendHistory({
        policyId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_POLICY_DELETED',
        status: deleted.status,
        previousState: existing,
        nextState: this.sanitizePolicy(deleted),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_POLICY_DELETED',
        resourceType: 'AllocationPolicy',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizePolicy(deleted),
        context,
      });
      return { success: true, id };
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_POLICY_DELETED',
        resourceType: 'AllocationPolicy',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async restorePolicy(
    id: string,
    workspaceId: string,
    actorId: string,
    context: MutationAuditContext,
  ) {
    const existing = await this.getPolicy(id, workspaceId, actorId, true);
    if (!existing.deletedAt) {
      throw new BadRequestException('Allocation policy is not deleted');
    }
    let restored: any;
    try {
      restored = await this.prisma.allocationPolicy.update({
        where: { id },
        data: { deletedAt: null, status: 'ACTIVE' as any },
      });

      await this.appendHistory({
        policyId: id,
        workspaceId,
        actorId,
        action: 'CAPITAL_POLICY_RESTORED',
        status: restored.status,
        previousState: existing,
        nextState: this.sanitizePolicy(restored),
      });

      await this.logMutationSuccess({
        action: 'CAPITAL_POLICY_RESTORED',
        resourceType: 'AllocationPolicy',
        resourceId: id,
        workspaceId,
        before: existing,
        after: this.sanitizePolicy(restored),
        context,
      });
      return this.sanitizePolicy(restored);
    } catch (error) {
      await this.logMutationFailure({
        action: 'CAPITAL_POLICY_RESTORED',
        resourceType: 'AllocationPolicy',
        resourceId: id,
        workspaceId,
        before: existing,
        context,
        error,
      });
      throw error;
    }
  }

  async getReports(
    workspaceId: string,
    query?: { category?: CapitalCategory; status?: string; currency?: string },
  ) {
    // Keep reports workspace-scoped and platform-neutral by aggregating native capital metadata
    // (category/status/source/target/rationale) without hardcoded external platform assumptions.
    const allocationRows = await this.prisma.capitalAllocation.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query?.category && { category: query.category }),
        ...(query?.status && { status: query.status as any }),
        ...(query?.currency && { currency: this.normalizeCurrency(query.currency) }),
      },
    });
    const policyRows = await this.prisma.allocationPolicy.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query?.category && { category: query.category }),
      },
    });
    return this.buildReportSummary(allocationRows as any[], policyRows as any[]);
  }

  private buildReportSummary(allocations: any[], policies: any[]) {
    const totalAllocated = allocations
      .filter((item) => item.status === 'ALLOCATED')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const totalPending = allocations
      .filter((item) => item.status === 'PENDING_APPROVAL')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const totalApproved = allocations
      .filter((item) => item.status === 'APPROVED')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const totalRejected = allocations
      .filter((item) => item.status === 'REJECTED')
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const byCategory = allocations.reduce<Record<string, { count: number; amount: number }>>(
      (acc, item) => {
        const key = item.category;
        acc[key] = acc[key] || { count: 0, amount: 0 };
        acc[key].count += 1;
        acc[key].amount += Number(item.amount);
        return acc;
      },
      {},
    );

    const byStatus = allocations.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalAllocated,
      totalPending,
      totalApproved,
      totalRejected,
      allocationCount: allocations.length,
      policyCount: policies.length,
      allocationsByCategory: byCategory,
      allocationsByStatus: byStatus,
      recentAllocations: allocations.slice(0, 10),
      recentPolicies: policies.slice(0, 10),
    };
  }

  async getHistory(
    workspaceId: string,
    query?: {
      action?: string;
      allocationId?: string;
      policyId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = this.normalizePage(query?.page, 'page', 1);
    const pageSize = Math.min(
      this.normalizePage(query?.pageSize, 'pageSize', DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;

    return this.prisma.allocationHistory.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query?.action && { action: query.action }),
        ...(query?.allocationId && { allocationId: query.allocationId }),
        ...(query?.policyId && { policyId: query.policyId }),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });
  }
}

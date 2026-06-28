import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapitalCategory } from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  ALLOCATION_STATUSES,
  APPROVAL_STATUSES,
  CAPITAL_SORT_FIELDS,
  POLICY_STATUSES,
} from './dto/capital.dto';

type MutationAuditContext = {
  actorId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type AllocationRecord = {
  id: string;
  workspaceId: string;
  ownerId: string;
  policyId?: string | null;
  category: CapitalCategory;
  amount: number;
  currency: string;
  source?: string | null;
  target?: string | null;
  status: (typeof ALLOCATION_STATUSES)[number];
  priority: number;
  rationale?: string | null;
  decisionReason?: string | null;
  approvalStatus: (typeof APPROVAL_STATUSES)[number];
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

type PolicyRecord = {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  description?: string | null;
  category: CapitalCategory;
  currency: string;
  source?: string | null;
  target?: string | null;
  status: (typeof POLICY_STATUSES)[number];
  priority: number;
  rationale?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

type HistoryRecord = {
  id: string;
  allocationId?: string | null;
  policyId?: string | null;
  workspaceId: string;
  actorId: string;
  action: string;
  status?: string | null;
  rationale?: string | null;
  decisionReason?: string | null;
  previousState?: Record<string, unknown> | null;
  nextState?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ALLOCATION_SORT_FIELDS = [...CAPITAL_SORT_FIELDS] as const;
const POLICY_SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'name', 'status'] as const;

@Injectable()
export class CapitalService {
  private readonly memoryAllocations = new Map<string, AllocationRecord>();
  private readonly memoryPolicies = new Map<string, PolicyRecord>();
  private readonly memoryHistory = new Map<string, HistoryRecord>();
  private readonly memoryApprovals = new Map<string, Record<string, unknown>>();
  private readonly memoryDecisions = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private canUseDatabase() {
    return typeof this.prisma.isConnected !== 'function' || this.prisma.isConnected();
  }

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
    if (this.canUseDatabase()) {
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
      return;
    }

    const id = crypto.randomUUID();
    this.memoryHistory.set(id, {
      id,
      allocationId: entry.allocationId,
      policyId: entry.policyId,
      workspaceId: entry.workspaceId,
      actorId: entry.actorId,
      action: entry.action,
      status: entry.status,
      rationale: entry.rationale,
      decisionReason: entry.decisionReason,
      previousState: entry.previousState ?? null,
      nextState: entry.nextState ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
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
    const pageSize = Math.min(this.normalizePage(query?.pageSize, 'pageSize', DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const sortBy = this.normalizeSort(query?.sortBy, ALLOCATION_SORT_FIELDS, 'createdAt');
    const sortOrder = this.normalizeSortOrder(query?.sortOrder);
    const currency = query?.currency ? this.normalizeCurrency(query.currency) : undefined;
    const skip = (page - 1) * pageSize;

    if (this.canUseDatabase()) {
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

    return Array.from(this.memoryAllocations.values())
      .filter((item) => item.workspaceId === workspaceId && item.ownerId === ownerId && !item.deletedAt)
      .filter((item) => !query?.category || item.category === query.category)
      .filter((item) => !query?.status || item.status === query.status)
      .filter((item) => !currency || item.currency === currency)
      .filter((item) => {
        if (!search) {
          return true;
        }
        const haystack = [item.source, item.target, item.rationale, item.decisionReason]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .sort((left, right) => {
        const leftValue = left[sortBy];
        const rightValue = right[sortBy];
        const direction = sortOrder === 'asc' ? 1 : -1;
        if (leftValue instanceof Date && rightValue instanceof Date) {
          return (leftValue.getTime() - rightValue.getTime()) * direction;
        }
        if (leftValue === rightValue) return 0;
        return (String(leftValue) > String(rightValue) ? 1 : -1) * direction;
      })
      .slice(skip, skip + pageSize)
      .map((item) => this.sanitizeAllocation(item));
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

      if (this.canUseDatabase()) {
        created = await this.prisma.capitalAllocation.create({ data: input as any });
      } else {
        const id = crypto.randomUUID();
        created = {
          id,
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } satisfies AllocationRecord;
        this.memoryAllocations.set(id, created);
      }

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
        metadata: { policyId: policy?.id ?? null, category: created.category, amount: created.amount },
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
    let allocation: any;
    if (this.canUseDatabase()) {
      allocation = await this.prisma.capitalAllocation.findFirst({
        where: {
          id,
          workspaceId,
          ...(ownerId ? { ownerId } : {}),
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } else {
      allocation = this.memoryAllocations.get(id);
      if (allocation && (allocation.workspaceId !== workspaceId || (ownerId && allocation.ownerId !== ownerId))) {
        allocation = null;
      }
      if (allocation && !includeDeleted && allocation.deletedAt) {
        allocation = null;
      }
    }

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
      ...(body.source !== undefined && { source: this.normalizeText(body.source, 'source') ?? null }),
      ...(body.target !== undefined && { target: this.normalizeText(body.target, 'target') ?? null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: this.normalizePriority(body.priority) }),
      ...(body.rationale !== undefined && { rationale: this.normalizeText(body.rationale, 'rationale') ?? null }),
      ...(body.decisionReason !== undefined && {
        decisionReason: this.normalizeText(body.decisionReason, 'decisionReason') ?? null,
      }),
      ...(body.policyId !== undefined && { policyId: body.policyId || null }),
    };

    let updated: any = null;
    try {
      if (this.canUseDatabase()) {
        updated = await this.prisma.capitalAllocation.update({ where: { id }, data: data as any });
      } else {
        updated = {
          ...(existing as AllocationRecord),
          ...data,
          ownerId,
          updatedAt: new Date(),
        };
        this.memoryAllocations.set(id, updated);
      }

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

  async deleteAllocation(id: string, workspaceId: string, actorId: string, context: MutationAuditContext) {
    const existing = await this.getAllocation(id, workspaceId, actorId);
    let deleted: any;
    try {
      if (this.canUseDatabase()) {
        deleted = await this.prisma.capitalAllocation.update({
          where: { id },
          data: { deletedAt: new Date(), status: 'ARCHIVED' as any },
        });
      } else {
        deleted = {
          ...(existing as AllocationRecord),
          status: 'ARCHIVED',
          deletedAt: new Date(),
          updatedAt: new Date(),
        };
        this.memoryAllocations.set(id, deleted);
      }

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

  async restoreAllocation(id: string, workspaceId: string, actorId: string, context: MutationAuditContext) {
    const existing = await this.getAllocation(id, workspaceId, actorId, true);
    if (!existing.deletedAt) {
      throw new BadRequestException('Capital allocation is not deleted');
    }
    let restored: any;
    try {
      if (this.canUseDatabase()) {
        restored = await this.prisma.capitalAllocation.update({
          where: { id },
          data: { deletedAt: null, status: 'DRAFT' as any },
        });
      } else {
        restored = {
          ...(existing as AllocationRecord),
          deletedAt: null,
          status: 'DRAFT',
          updatedAt: new Date(),
        };
        this.memoryAllocations.set(id, restored);
      }

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
    if (this.canUseDatabase()) {
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
      return;
    }

    const decisionId = crypto.randomUUID();
    this.memoryDecisions.set(decisionId, {
      id: decisionId,
      allocationId: args.allocationId,
      workspaceId: args.workspaceId,
      actorId: args.actorId,
      status: args.status,
      priority: args.priority,
      rationale: args.rationale ?? null,
      decisionReason: args.decisionReason ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    const approvalId = crypto.randomUUID();
    this.memoryApprovals.set(approvalId, {
      id: approvalId,
      allocationId: args.allocationId,
      workspaceId: args.workspaceId,
      actorId: args.actorId,
      approvalStatus: args.status,
      approvedBy: args.status === 'APPROVED' ? args.actorId : null,
      approvedAt: args.status === 'APPROVED' ? new Date() : null,
      rejectedAt: args.status === 'REJECTED' ? new Date() : null,
      decisionReason: args.decisionReason ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
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
    let updated: any;
    const approvedAt = new Date();
    try {
      if (this.canUseDatabase()) {
        updated = await this.prisma.capitalAllocation.update({
          where: { id },
          data: {
            status: (body.status ?? 'APPROVED') as any,
            approvalStatus: 'APPROVED' as any,
            approvedBy: actorId,
            approvedAt,
            rejectedAt: null,
            rationale: body.rationale ?? existing.rationale,
            decisionReason: body.decisionReason ?? existing.decisionReason,
          },
        });
      } else {
        updated = {
          ...(existing as AllocationRecord),
          status: body.status ?? 'APPROVED',
          approvalStatus: 'APPROVED',
          approvedBy: actorId,
          approvedAt,
          rejectedAt: null,
          rationale: body.rationale ?? existing.rationale,
          decisionReason: body.decisionReason ?? existing.decisionReason,
          updatedAt: new Date(),
        };
        this.memoryAllocations.set(id, updated);
      }

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
    let updated: any;
    const rejectedAt = new Date();
    try {
      if (this.canUseDatabase()) {
        updated = await this.prisma.capitalAllocation.update({
          where: { id },
          data: {
            status: (body.status ?? 'REJECTED') as any,
            approvalStatus: 'REJECTED' as any,
            rejectedAt,
            decisionReason: body.decisionReason ?? existing.decisionReason,
            rationale: body.rationale ?? existing.rationale,
          },
        });
      } else {
        updated = {
          ...(existing as AllocationRecord),
          status: body.status ?? 'REJECTED',
          approvalStatus: 'REJECTED',
          rejectedAt,
          decisionReason: body.decisionReason ?? existing.decisionReason,
          rationale: body.rationale ?? existing.rationale,
          updatedAt: new Date(),
        };
        this.memoryAllocations.set(id, updated);
      }

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
    const pageSize = Math.min(this.normalizePage(query?.pageSize, 'pageSize', DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const sortBy = this.normalizeSort(query?.sortBy, POLICY_SORT_FIELDS, 'createdAt');
    const sortOrder = this.normalizeSortOrder(query?.sortOrder);
    const skip = (page - 1) * pageSize;

    if (this.canUseDatabase()) {
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

    return Array.from(this.memoryPolicies.values())
      .filter((item) => item.workspaceId === workspaceId && item.ownerId === ownerId && !item.deletedAt)
      .filter((item) => !query?.category || item.category === query.category)
      .filter((item) => !query?.status || item.status === query.status)
      .filter((item) => {
        if (!search) {
          return true;
        }
        const haystack = [item.name, item.description, item.rationale].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .sort((left, right) => {
        const leftValue = left[sortBy];
        const rightValue = right[sortBy];
        const direction = sortOrder === 'asc' ? 1 : -1;
        if (leftValue instanceof Date && rightValue instanceof Date) {
          return (leftValue.getTime() - rightValue.getTime()) * direction;
        }
        if (leftValue === rightValue) return 0;
        return (String(leftValue) > String(rightValue) ? 1 : -1) * direction;
      })
      .slice(skip, skip + pageSize)
      .map((item) => this.sanitizePolicy(item));
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
      if (this.canUseDatabase()) {
        created = await this.prisma.allocationPolicy.create({ data: input as any });
      } else {
        const id = crypto.randomUUID();
        created = {
          id,
          ...input,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } satisfies PolicyRecord;
        this.memoryPolicies.set(id, created);
      }

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
    let policy: any;
    if (this.canUseDatabase()) {
      policy = await this.prisma.allocationPolicy.findFirst({
        where: {
          id,
          workspaceId,
          ...(ownerId ? { ownerId } : {}),
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } else {
      policy = this.memoryPolicies.get(id);
      if (policy && (policy.workspaceId !== workspaceId || (ownerId && policy.ownerId !== ownerId))) {
        policy = null;
      }
      if (policy && !includeDeleted && policy.deletedAt) {
        policy = null;
      }
    }
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
      ...(body.source !== undefined && { source: this.normalizeText(body.source, 'source') ?? null }),
      ...(body.target !== undefined && { target: this.normalizeText(body.target, 'target') ?? null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: this.normalizePriority(body.priority) }),
      ...(body.rationale !== undefined && {
        rationale: this.normalizeText(body.rationale, 'rationale') ?? null,
      }),
    };

    let updated: any = null;
    try {
      if (this.canUseDatabase()) {
        updated = await this.prisma.allocationPolicy.update({ where: { id }, data: data as any });
      } else {
        updated = {
          ...(existing as PolicyRecord),
          ...data,
          ownerId: actorId,
          updatedAt: new Date(),
        };
        this.memoryPolicies.set(id, updated);
      }

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

  async deletePolicy(id: string, workspaceId: string, actorId: string, context: MutationAuditContext) {
    const existing = await this.getPolicy(id, workspaceId, actorId);
    let deleted: any;
    try {
      if (this.canUseDatabase()) {
        deleted = await this.prisma.allocationPolicy.update({
          where: { id },
          data: { deletedAt: new Date(), status: 'ARCHIVED' as any },
        });
      } else {
        deleted = {
          ...(existing as PolicyRecord),
          status: 'ARCHIVED',
          deletedAt: new Date(),
          updatedAt: new Date(),
        };
        this.memoryPolicies.set(id, deleted);
      }

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

  async restorePolicy(id: string, workspaceId: string, actorId: string, context: MutationAuditContext) {
    const existing = await this.getPolicy(id, workspaceId, actorId, true);
    if (!existing.deletedAt) {
      throw new BadRequestException('Allocation policy is not deleted');
    }
    let restored: any;
    try {
      if (this.canUseDatabase()) {
        restored = await this.prisma.allocationPolicy.update({
          where: { id },
          data: { deletedAt: null, status: 'ACTIVE' as any },
        });
      } else {
        restored = {
          ...(existing as PolicyRecord),
          deletedAt: null,
          status: 'ACTIVE',
          updatedAt: new Date(),
        };
        this.memoryPolicies.set(id, restored);
      }

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
    const allocations = await this.listAllocations(workspaceId, {
      // Reports remain workspace-wide, so fetch directly below when database is connected.
    } as any);
    const policies = await this.listPolicies(workspaceId, {
    } as any);
    if (this.canUseDatabase()) {
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

    const memoryAllocations = Array.from(this.memoryAllocations.values()).filter(
      (item) =>
        item.workspaceId === workspaceId &&
        !item.deletedAt &&
        (!query?.category || item.category === query.category) &&
        (!query?.status || item.status === query.status) &&
        (!query?.currency || item.currency === this.normalizeCurrency(query.currency)),
    );
    const memoryPolicies = Array.from(this.memoryPolicies.values()).filter(
      (item) => item.workspaceId === workspaceId && !item.deletedAt && (!query?.category || item.category === query.category),
    );
    return this.buildReportSummary(memoryAllocations, memoryPolicies);

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

    const byCategory = allocations.reduce<Record<string, { count: number; amount: number }>>((acc, item) => {
      const key = item.category;
      acc[key] = acc[key] || { count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount += Number(item.amount);
      return acc;
    }, {});

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
    query?: { action?: string; allocationId?: string; policyId?: string; page?: number; pageSize?: number },
  ) {
    const page = this.normalizePage(query?.page, 'page', 1);
    const pageSize = Math.min(this.normalizePage(query?.pageSize, 'pageSize', DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    if (this.canUseDatabase()) {
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

    return Array.from(this.memoryHistory.values())
      .filter((item) => item.workspaceId === workspaceId && !item.deletedAt)
      .filter((item) => !query?.action || item.action === query.action)
      .filter((item) => !query?.allocationId || item.allocationId === query.allocationId)
      .filter((item) => !query?.policyId || item.policyId === query.policyId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(skip, skip + pageSize);
  }
}
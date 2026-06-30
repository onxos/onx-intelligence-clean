import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthorityLevel,
  CapitalAccumulationType,
  IntelligenceCapital,
  IntelligenceCapitalStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { evaluateAllocationRules } from './capital-rules';
import { CAPITAL_SORT_FIELDS, isValidCapitalStatusTransition } from './capital.constants';
import {
  AccumulateCapitalDto,
  CreateIntelligenceCapitalDto,
  ExecuteAllocationDto,
  IntelligenceCapitalListQueryDto,
  RollbackAllocationDto,
  TransitionCapitalStatusDto,
  UpdateIntelligenceCapitalDto,
} from './dto/intelligence-capital.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class IntelligenceCapitalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
  ) {}

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private normalizeStringArray(values: string[] = []) {
    return Array.from(
      new Set(
        (values ?? [])
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private round(value: number) {
    return Math.round(value * 1e6) / 1e6;
  }

  private async recordAudit(
    action: string,
    resourceType: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType,
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before,
      after,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
      metadata,
    });
  }

  private async recordEvidence(
    workspaceId: string,
    ownerId: string,
    intent: string,
    ctx: MutationAuditContext | undefined,
  ) {
    try {
      await this.evidence.create({ intent, confidence: 1, ownerId, workspaceId }, ctx);
    } catch {
      // Evidence is governance-supporting; never block the primary mutation.
    }
  }

  private async loadCapitalOrThrow(id: string, workspaceId: string) {
    const capital = await this.prisma.intelligenceCapital.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!capital) {
      throw new NotFoundException('Intelligence capital not found');
    }
    return capital;
  }

  private deriveStatus(
    capital: Pick<IntelligenceCapital, 'status' | 'minimumValue'>,
    valueAfter: number,
  ): IntelligenceCapitalStatus {
    // Never auto-override sovereign-set preservation/archival states.
    if (capital.status === 'ARCHIVED' || capital.status === 'PRESERVED') {
      return capital.status;
    }
    if (valueAfter <= 0) {
      return 'DEPLETED';
    }
    if (valueAfter < (capital.minimumValue ?? 0)) {
      return 'DECAYING';
    }
    if (capital.status === 'RECOVERING' || capital.status === 'DEPLETED') {
      return 'RECOVERING';
    }
    return 'ACTIVE';
  }

  private snapshot(capital: IntelligenceCapital) {
    return {
      id: capital.id,
      capitalId: capital.capitalId,
      identity: capital.identity,
      category: capital.category,
      currentValue: capital.currentValue,
      accumulatedValue: capital.accumulatedValue,
      allocatedValue: capital.allocatedValue,
      minimumValue: capital.minimumValue,
      status: capital.status,
      authority: capital.authority,
      deletedAt: capital.deletedAt,
    };
  }

  // ----------------------------------------------------------------------
  // Part A — Intelligence Capital CRUD
  // ----------------------------------------------------------------------

  async createCapital(
    workspaceId: string,
    userId: string,
    dto: CreateIntelligenceCapitalDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.identity?.trim()) {
        throw new BadRequestException('identity is required');
      }
      const initialValue = dto.initialValue ?? 0;
      const minimumValue = dto.minimumValue ?? 0;
      if (minimumValue > initialValue) {
        throw new BadRequestException('minimumValue cannot exceed the initial value');
      }
      const ownerId = dto.ownerId?.trim() || userId;

      const created = await this.prisma.$transaction(async (tx) => {
        const capital = await tx.intelligenceCapital.create({
          data: {
            identity: dto.identity.trim(),
            description: dto.description?.trim() || null,
            category: dto.category,
            ownerId,
            workspaceId,
            currentValue: this.round(initialValue),
            accumulatedValue: this.round(initialValue),
            allocatedValue: 0,
            minimumValue: this.round(minimumValue),
            growthRate: dto.growthRate ?? 0,
            preservationScore: dto.preservationScore ?? 1,
            riskScore: dto.riskScore ?? 0,
            confidence: dto.confidence ?? 0.5,
            sourceLineage: this.normalizeStringArray(dto.sourceLineage),
            authority: dto.authority ?? AuthorityLevel.OPERATIONAL,
            status: IntelligenceCapitalStatus.ACTIVE,
            currency: (dto.currency?.trim() || 'IUC').toUpperCase(),
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });

        if (initialValue > 0) {
          await tx.capitalAccumulationEvent.create({
            data: {
              capitalId: capital.id,
              eventType: CapitalAccumulationType.CREATION,
              amount: this.round(initialValue),
              valueBefore: 0,
              valueAfter: this.round(initialValue),
              reason: 'Initial capital creation',
              actorId: ownerId,
              workspaceId,
              metadata: {} as Prisma.InputJsonValue,
            },
          });
        }
        return capital;
      });

      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_CREATED',
        'IntelligenceCapital',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        this.snapshot(created),
        true,
      );
      await this.recordEvidence(
        workspaceId,
        ownerId,
        `Intelligence capital established: ${created.identity}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_CREATED',
        'IntelligenceCapital',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listCapital(workspaceId: string, query?: IntelligenceCapitalListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const sortBy = (CAPITAL_SORT_FIELDS as readonly string[]).includes(query?.sortBy as string)
      ? (query?.sortBy as string)
      : 'createdAt';
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';
    const search = query?.search?.trim();

    const where: Prisma.IntelligenceCapitalWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.category && { category: query.category }),
      ...(query?.status && { status: query.status }),
      ...(search && {
        OR: [
          { identity: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.intelligenceCapital.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as Prisma.IntelligenceCapitalOrderByWithRelationInput,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.intelligenceCapital.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getCapital(id: string, workspaceId: string) {
    const capital = await this.loadCapitalOrThrow(id, workspaceId);
    const [accumulationEvents, allocations] = await Promise.all([
      this.prisma.capitalAccumulationEvent.findMany({
        where: { capitalId: capital.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.capitalAllocation.findMany({
        where: { capitalId: capital.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { ...capital, accumulationEvents, allocations };
  }

  async updateCapital(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateIntelligenceCapitalDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadCapitalOrThrow(id, workspaceId);
    try {
      const minimumValue = dto.minimumValue ?? before.minimumValue;
      if (minimumValue > before.currentValue) {
        throw new BadRequestException('minimumValue cannot exceed the current value');
      }
      const updated = await this.prisma.intelligenceCapital.update({
        where: { id: before.id },
        data: {
          ...(dto.identity !== undefined && { identity: dto.identity.trim() }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.minimumValue !== undefined && { minimumValue: this.round(dto.minimumValue) }),
          ...(dto.growthRate !== undefined && { growthRate: dto.growthRate }),
          ...(dto.preservationScore !== undefined && {
            preservationScore: dto.preservationScore,
          }),
          ...(dto.riskScore !== undefined && { riskScore: dto.riskScore }),
          ...(dto.confidence !== undefined && { confidence: dto.confidence }),
          ...(dto.sourceLineage !== undefined && {
            sourceLineage: this.normalizeStringArray(dto.sourceLineage),
          }),
          ...(dto.authority !== undefined && { authority: dto.authority }),
          ...(dto.metadata !== undefined && {
            metadata: dto.metadata as Prisma.InputJsonValue,
          }),
        },
      });

      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_UPDATED',
        'IntelligenceCapital',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(updated),
        true,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_UPDATED',
        'IntelligenceCapital',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async removeCapital(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const before = await this.loadCapitalOrThrow(id, workspaceId);
    const updated = await this.prisma.intelligenceCapital.update({
      where: { id: before.id },
      data: { deletedAt: new Date(), status: IntelligenceCapitalStatus.ARCHIVED },
    });
    await this.recordAudit(
      'INTELLIGENCE_CAPITAL_ARCHIVED',
      'IntelligenceCapital',
      updated.id,
      ctx,
      workspaceId,
      userId,
      this.snapshot(before),
      this.snapshot(updated),
      true,
    );
    return { id: updated.id, deletedAt: updated.deletedAt, status: updated.status };
  }

  async transitionStatus(
    id: string,
    workspaceId: string,
    userId: string,
    dto: TransitionCapitalStatusDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadCapitalOrThrow(id, workspaceId);
    try {
      if (!isValidCapitalStatusTransition(before.status, dto.status)) {
        throw new BadRequestException(
          `Invalid capital status transition: ${before.status} -> ${dto.status}`,
        );
      }
      const updated = await this.prisma.intelligenceCapital.update({
        where: { id: before.id },
        data: { status: dto.status },
      });
      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_STATUS_TRANSITIONED',
        'IntelligenceCapital',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(updated),
        true,
        { reason: dto.reason ?? null },
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_STATUS_TRANSITIONED',
        'IntelligenceCapital',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Part B — Accumulation engine
  // ----------------------------------------------------------------------

  private computeAccumulation(
    capital: IntelligenceCapital,
    dto: AccumulateCapitalDto,
  ): { amount: number; valueAfter: number; accumulatedDelta: number } {
    const current = capital.currentValue;
    switch (dto.eventType) {
      case CapitalAccumulationType.CREATION:
      case CapitalAccumulationType.GROWTH:
      case CapitalAccumulationType.RECOVERY: {
        const amount = dto.amount ?? 0;
        if (amount <= 0) {
          throw new BadRequestException(`${dto.eventType} requires a positive amount`);
        }
        return { amount, valueAfter: current + amount, accumulatedDelta: amount };
      }
      case CapitalAccumulationType.REDUCTION: {
        const amount = dto.amount ?? 0;
        if (amount <= 0) {
          throw new BadRequestException('REDUCTION requires a positive amount');
        }
        if (current - amount < 0) {
          throw new BadRequestException('REDUCTION cannot drive capital below zero');
        }
        return { amount, valueAfter: current - amount, accumulatedDelta: 0 };
      }
      case CapitalAccumulationType.COMPOUNDING: {
        const rate = dto.rate ?? capital.growthRate;
        if (!Number.isFinite(rate) || rate <= 0) {
          throw new BadRequestException('COMPOUNDING requires a positive rate');
        }
        const delta = this.round(current * rate);
        return { amount: delta, valueAfter: current + delta, accumulatedDelta: delta };
      }
      case CapitalAccumulationType.DECAY: {
        const rate = dto.rate ?? 0;
        if (!Number.isFinite(rate) || rate <= 0 || rate > 1) {
          throw new BadRequestException('DECAY requires a rate between 0 and 1');
        }
        const delta = this.round(current * rate);
        return { amount: delta, valueAfter: Math.max(0, current - delta), accumulatedDelta: 0 };
      }
      case CapitalAccumulationType.PRESERVATION: {
        return { amount: 0, valueAfter: current, accumulatedDelta: 0 };
      }
      default:
        throw new BadRequestException(
          `${dto.eventType} is not a supported accumulation operation here`,
        );
    }
  }

  async accumulate(
    id: string,
    workspaceId: string,
    userId: string,
    dto: AccumulateCapitalDto,
    ctx?: MutationAuditContext,
  ) {
    const before = await this.loadCapitalOrThrow(id, workspaceId);
    try {
      if (before.status === 'ARCHIVED') {
        throw new ForbiddenException('Archived capital cannot accumulate');
      }
      const { amount, valueAfter, accumulatedDelta } = this.computeAccumulation(before, dto);
      const roundedAfter = this.round(valueAfter);
      const nextStatus =
        dto.eventType === CapitalAccumulationType.PRESERVATION
          ? IntelligenceCapitalStatus.PRESERVED
          : this.deriveStatus(before, roundedAfter);

      const updated = await this.prisma.$transaction(async (tx) => {
        const capital = await tx.intelligenceCapital.update({
          where: { id: before.id },
          data: {
            currentValue: roundedAfter,
            accumulatedValue: this.round(before.accumulatedValue + accumulatedDelta),
            status: nextStatus,
            ...(dto.eventType === CapitalAccumulationType.PRESERVATION && {
              preservationScore: 1,
            }),
          },
        });
        await tx.capitalAccumulationEvent.create({
          data: {
            capitalId: before.id,
            eventType: dto.eventType,
            amount: this.round(amount),
            valueBefore: before.currentValue,
            valueAfter: roundedAfter,
            reason: dto.reason?.trim() || null,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        return capital;
      });

      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_ACCUMULATED',
        'IntelligenceCapital',
        updated.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        this.snapshot(updated),
        true,
        { eventType: dto.eventType, amount: this.round(amount) },
      );
      await this.recordEvidence(
        workspaceId,
        before.ownerId,
        `Capital ${dto.eventType} applied to ${before.identity}`,
        ctx,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'INTELLIGENCE_CAPITAL_ACCUMULATED',
        'IntelligenceCapital',
        before.id,
        ctx,
        workspaceId,
        userId,
        this.snapshot(before),
        null,
        false,
        { eventType: dto.eventType, error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listAccumulationEvents(id: string, workspaceId: string) {
    const capital = await this.loadCapitalOrThrow(id, workspaceId);
    return this.prisma.capitalAccumulationEvent.findMany({
      where: { capitalId: capital.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----------------------------------------------------------------------
  // Part C — Allocation execution / rollback
  // ----------------------------------------------------------------------

  private async loadAllocationOrThrow(allocationId: string, workspaceId: string) {
    const allocation = await this.prisma.capitalAllocation.findFirst({
      where: { id: allocationId, workspaceId, deletedAt: null },
    });
    if (!allocation) {
      throw new NotFoundException('Capital allocation not found');
    }
    return allocation;
  }

  async executeAllocation(
    allocationId: string,
    workspaceId: string,
    userId: string,
    dto: ExecuteAllocationDto,
    ctx?: MutationAuditContext,
  ) {
    const allocation = await this.loadAllocationOrThrow(allocationId, workspaceId);
    const capital = await this.loadCapitalOrThrow(dto.capitalId, workspaceId);
    try {
      if (allocation.status === 'EXECUTED') {
        throw new BadRequestException('Allocation has already been executed');
      }
      if (allocation.status === 'ROLLED_BACK' || allocation.status === 'CANCELLED') {
        throw new BadRequestException(
          `Allocation in status ${allocation.status} cannot be executed`,
        );
      }
      if (allocation.status !== 'APPROVED' && allocation.status !== 'ALLOCATED') {
        throw new BadRequestException(
          'Only APPROVED or ALLOCATED allocations may be executed against capital',
        );
      }

      const amount = Number(allocation.amount);
      const evaluation = evaluateAllocationRules(capital, {
        amount,
        maxAllocationRatio: dto.maxAllocationRatio,
        founderOverride: dto.founderOverride,
        overrideAuthority: capital.authority,
      });
      if (!evaluation.allowed) {
        throw new ForbiddenException({
          message: 'Allocation rejected by the capital allocation rules engine',
          violations: evaluation.violations,
        });
      }

      const valueAfter = this.round(capital.currentValue - amount);
      const nextStatus = this.deriveStatus(capital, valueAfter);

      const result = await this.prisma.$transaction(async (tx) => {
        const updatedCapital = await tx.intelligenceCapital.update({
          where: { id: capital.id },
          data: {
            currentValue: valueAfter,
            allocatedValue: this.round(capital.allocatedValue + amount),
            status: nextStatus,
          },
        });
        await tx.capitalAccumulationEvent.create({
          data: {
            capitalId: capital.id,
            eventType: CapitalAccumulationType.ALLOCATION,
            amount: this.round(amount),
            valueBefore: capital.currentValue,
            valueAfter,
            reason: dto.reason?.trim() || `Executed allocation ${allocation.id}`,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: {
              allocationId: allocation.id,
              overrideApplied: evaluation.overrideApplied,
            } as Prisma.InputJsonValue,
          },
        });
        const updatedAllocation = await tx.capitalAllocation.update({
          where: { id: allocation.id },
          data: {
            status: 'EXECUTED',
            capitalId: capital.id,
            executedAt: new Date(),
            executedBy: ctx?.actorId ?? userId,
          },
        });
        await tx.allocationHistory.create({
          data: {
            allocationId: allocation.id,
            workspaceId,
            actorId: ctx?.actorId ?? userId,
            action: 'EXECUTED',
            status: 'EXECUTED',
            rationale: dto.reason?.trim() || null,
            previousState: { status: allocation.status } as Prisma.InputJsonValue,
            nextState: {
              status: 'EXECUTED',
              capitalId: capital.id,
            } as Prisma.InputJsonValue,
          },
        });
        return { updatedAllocation, updatedCapital };
      });

      await this.recordAudit(
        'CAPITAL_ALLOCATION_EXECUTED',
        'CapitalAllocation',
        allocation.id,
        ctx,
        workspaceId,
        userId,
        { status: allocation.status, capitalValue: capital.currentValue },
        {
          status: 'EXECUTED',
          capitalId: capital.id,
          capitalValue: valueAfter,
          overrideApplied: evaluation.overrideApplied,
        },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        capital.ownerId,
        `Allocation executed against capital ${capital.identity}`,
        ctx,
      );
      return result.updatedAllocation;
    } catch (error) {
      await this.recordAudit(
        'CAPITAL_ALLOCATION_EXECUTED',
        'CapitalAllocation',
        allocation.id,
        ctx,
        workspaceId,
        userId,
        { status: allocation.status },
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async rollbackAllocation(
    allocationId: string,
    workspaceId: string,
    userId: string,
    dto: RollbackAllocationDto,
    ctx?: MutationAuditContext,
  ) {
    const allocation = await this.loadAllocationOrThrow(allocationId, workspaceId);
    try {
      if (allocation.status !== 'EXECUTED') {
        throw new BadRequestException('Only EXECUTED allocations can be rolled back');
      }
      if (!allocation.capitalId) {
        throw new BadRequestException('Allocation is not linked to any capital');
      }
      const capital = await this.loadCapitalOrThrow(allocation.capitalId, workspaceId);
      const amount = Number(allocation.amount);
      const valueAfter = this.round(capital.currentValue + amount);
      const nextStatus = this.deriveStatus(capital, valueAfter);

      const result = await this.prisma.$transaction(async (tx) => {
        await tx.intelligenceCapital.update({
          where: { id: capital.id },
          data: {
            currentValue: valueAfter,
            allocatedValue: this.round(Math.max(0, capital.allocatedValue - amount)),
            status: nextStatus,
          },
        });
        await tx.capitalAccumulationEvent.create({
          data: {
            capitalId: capital.id,
            eventType: CapitalAccumulationType.ROLLBACK,
            amount: this.round(amount),
            valueBefore: capital.currentValue,
            valueAfter,
            reason: dto.reason?.trim() || `Rolled back allocation ${allocation.id}`,
            actorId: ctx?.actorId ?? userId,
            workspaceId,
            metadata: { allocationId: allocation.id } as Prisma.InputJsonValue,
          },
        });
        const updatedAllocation = await tx.capitalAllocation.update({
          where: { id: allocation.id },
          data: {
            status: 'ROLLED_BACK',
            rolledBackAt: new Date(),
            rolledBackBy: ctx?.actorId ?? userId,
          },
        });
        await tx.allocationHistory.create({
          data: {
            allocationId: allocation.id,
            workspaceId,
            actorId: ctx?.actorId ?? userId,
            action: 'ROLLED_BACK',
            status: 'ROLLED_BACK',
            rationale: dto.reason?.trim() || null,
            previousState: { status: 'EXECUTED' } as Prisma.InputJsonValue,
            nextState: { status: 'ROLLED_BACK' } as Prisma.InputJsonValue,
          },
        });
        return updatedAllocation;
      });

      await this.recordAudit(
        'CAPITAL_ALLOCATION_ROLLED_BACK',
        'CapitalAllocation',
        allocation.id,
        ctx,
        workspaceId,
        userId,
        { status: 'EXECUTED', capitalValue: capital.currentValue },
        { status: 'ROLLED_BACK', capitalValue: valueAfter },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        capital.ownerId,
        `Allocation rolled back, restoring capital ${capital.identity}`,
        ctx,
      );
      return result;
    } catch (error) {
      await this.recordAudit(
        'CAPITAL_ALLOCATION_ROLLED_BACK',
        'CapitalAllocation',
        allocation.id,
        ctx,
        workspaceId,
        userId,
        { status: allocation.status },
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }
}

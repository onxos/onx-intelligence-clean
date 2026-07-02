import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { OVERRIDE_HANDLERS, resolveHandler } from './exception.constants';
import { ExceptionListQueryDto, TriggerOverrideDto } from './dto/exception.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** D18 — Exception Handling: standardized execution of the 5 override rules. */
@Injectable()
export class ExceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly iurg: IurgService,
  ) {}

  listHandlers() {
    return { total: OVERRIDE_HANDLERS.length, handlers: OVERRIDE_HANDLERS };
  }

  async trigger(
    workspaceId: string,
    userId: string,
    dto: TriggerOverrideDto,
    ctx?: MutationAuditContext,
  ) {
    const handler = resolveHandler(dto.overrideRule);
    if (!handler) {
      throw new BadRequestException(
        `Unknown override rule "${dto.overrideRule}". Expected OR-01..OR-05.`,
      );
    }

    const expiresAt = handler.expiryMs ? new Date(Date.now() + handler.expiryMs) : null;

    // Bind the override into IURG (best-effort) as an OVERRIDE object.
    let iurgNodeId: string | null = null;
    try {
      const bound = await this.iurg.bindFicEvent({
        workspaceId,
        actorId: userId,
        decision: 'OVERRIDE',
        reason: `${handler.rule} (${handler.handlerType}): ${handler.condition}`,
        applicableIntentIds: [],
        applicableConstraintIds: [handler.rule],
        executionBlocks: [],
        hardViolations: [],
        requiredGates: [],
        softFlags: [],
        activeOverrides: [handler.rule],
        conflicts: [],
        playbooks: [],
        domains: ['operational', 'strategic'],
      });
      iurgNodeId = bound.node.id;
    } catch {
      iurgNodeId = null;
    }

    const execution = await this.prisma.overrideExecution.create({
      data: {
        workspaceId,
        overrideRule: handler.rule,
        handlerType: handler.handlerType,
        triggeredBy: dto.triggeredBy?.trim() || userId,
        conditions: dto.conditions ?? [handler.condition],
        reason: dto.reason?.trim() ?? null,
        expiresAt,
        status: 'active',
        iurgNodeId,
        traceId: dto.traceId?.trim() ?? null,
      },
    });

    await this.recordAudit('OVERRIDE_TRIGGERED', execution.id, ctx, workspaceId, userId, {
      rule: handler.rule,
      handler: handler.handlerType,
      expiresAt,
      notifyFounder: handler.notifyFounder,
    });

    return { ...execution, notifyFounder: handler.notifyFounder };
  }

  async revert(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const execution = await this.loadExecution(id, workspaceId);
    if (execution.status !== 'active') {
      throw new BadRequestException(`Override is ${execution.status} and cannot be reverted.`);
    }
    const updated = await this.prisma.overrideExecution.update({
      where: { id: execution.id },
      data: { status: 'reverted', revertedBy: userId, revertedAt: new Date() },
    });
    await this.recordAudit('OVERRIDE_REVERTED', execution.id, ctx, workspaceId, userId, {
      rule: execution.overrideRule,
    });
    return updated;
  }

  async listExecutions(workspaceId: string, query: ExceptionListQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    // Surface expiry lazily: mark active-but-past-expiry executions as expired.
    await this.prisma.overrideExecution.updateMany({
      where: { workspaceId, status: 'active', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    const where: Prisma.OverrideExecutionWhereInput = {
      workspaceId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.overrideRule ? { overrideRule: query.overrideRule } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.overrideExecution.count({ where }),
      this.prisma.overrideExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  private async loadExecution(id: string, workspaceId: string) {
    const execution = await this.prisma.overrideExecution.findFirst({
      where: { workspaceId, OR: [{ id }, { executionId: id }] },
    });
    if (!execution) {
      throw new NotFoundException('Override execution not found');
    }
    return execution;
  }

  private async recordAudit(
    action: string,
    resourceId: string,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    after: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType: 'OverrideExecution',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after: after as Prisma.JsonObject,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: 'SUCCESS',
      success: true,
    });
  }
}

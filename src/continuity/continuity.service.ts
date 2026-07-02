import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ContinuityGuardService } from './continuity-guard.service';
import {
  ContinuityListQueryDto,
  ContinuityWriteDto,
  GuardOperationDto,
} from './dto/continuity.dto';
import { EVIDENCE_TIERS, PROTECTED_OBJECT_TYPES } from './continuity.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ContinuityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guardSvc: ContinuityGuardService,
  ) {}

  // ----------------------------------------------------------------------
  // Append-only write operations
  // ----------------------------------------------------------------------

  revise(workspaceId: string, userId: string, dto: ContinuityWriteDto, ctx?: MutationAuditContext) {
    return this.guardSvc.guard(workspaceId, userId, { ...dto, operation: 'REVISE' }, ctx);
  }

  supersede(
    workspaceId: string,
    userId: string,
    dto: ContinuityWriteDto,
    ctx?: MutationAuditContext,
  ) {
    return this.guardSvc.guard(workspaceId, userId, { ...dto, operation: 'SUPERSEDE' }, ctx);
  }

  deprecate(
    workspaceId: string,
    userId: string,
    dto: ContinuityWriteDto,
    ctx?: MutationAuditContext,
  ) {
    return this.guardSvc.guard(workspaceId, userId, { ...dto, operation: 'DEPRECATE' }, ctx);
  }

  /** Route an arbitrary proposed operation through the guard (UPDATE/DELETE are blocked). */
  guardOperation(
    workspaceId: string,
    userId: string,
    dto: GuardOperationDto,
    ctx?: MutationAuditContext,
  ) {
    return this.guardSvc.guard(workspaceId, userId, dto, ctx);
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  private page(query?: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Number(query?.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query?.page) || 1, 1);
    return { pageSize, page, skip: (page - 1) * pageSize };
  }

  async listAudits(workspaceId: string, query: ContinuityListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const where: Prisma.ContinuityAuditWhereInput = {
      workspaceId,
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.operation ? { operation: query.operation as any } : {}),
      ...(query.blocked !== undefined ? { blocked: query.blocked } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.continuityAudit.count({ where }),
      this.prisma.continuityAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getAudit(id: string, workspaceId: string) {
    const audit = await this.prisma.continuityAudit.findFirst({
      where: { workspaceId, OR: [{ id }, { auditId: id }] },
    });
    if (!audit) {
      throw new NotFoundException('Continuity audit not found');
    }
    return audit;
  }

  async protectedObjects(workspaceId: string) {
    const grouped = await this.prisma.continuityAudit.groupBy({
      by: ['targetType'],
      where: { workspaceId },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.targetType, g._count._all]));
    return {
      total: PROTECTED_OBJECT_TYPES.length,
      evidenceTiers: EVIDENCE_TIERS,
      types: PROTECTED_OBJECT_TYPES.map((type) => ({ type, auditCount: counts.get(type) ?? 0 })),
    };
  }

  /** Full append-only version history for a target (never mutated, only appended). */
  async objectHistory(targetType: string, targetId: string, workspaceId: string) {
    const entries = await this.prisma.continuityAudit.findMany({
      where: { workspaceId, targetType: targetType.trim().toLowerCase(), targetId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      targetType: targetType.trim().toLowerCase(),
      targetId,
      total: entries.length,
      currentVersion: entries.filter((e) => !e.blocked).length,
      blockedAttempts: entries.filter((e) => e.blocked).length,
      history: entries,
    };
  }

  async stats(workspaceId: string) {
    const [byOperation, byTarget, blocked, total] = await Promise.all([
      this.prisma.continuityAudit.groupBy({
        by: ['operation'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.continuityAudit.groupBy({
        by: ['targetType'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.continuityAudit.count({ where: { workspaceId, blocked: true } }),
      this.prisma.continuityAudit.count({ where: { workspaceId } }),
    ]);
    return {
      total,
      blockedTotal: blocked,
      appendedTotal: total - blocked,
      byOperation: Object.fromEntries(byOperation.map((o) => [o.operation, o._count._all])),
      byTargetType: Object.fromEntries(byTarget.map((t) => [t.targetType, t._count._all])),
    };
  }
}

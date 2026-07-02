import { BadRequestException, Injectable } from '@nestjs/common';
import { ContinuityOperationType, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import {
  dgForTier,
  evaluateTierChange,
  isForbidden,
  normalizeOperation,
  PROTECTED_OBJECT_TYPES,
  ProtectedObjectType,
} from './continuity.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export interface GuardInput {
  operation: string;
  targetType: string;
  targetId: string;
  reason?: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  tierFrom?: string;
  tierTo?: string;
  approverAuthority?: string;
  previousRef?: string;
  traceId?: string;
}

export interface GuardResult {
  allowed: boolean;
  blocked: boolean;
  operation: ContinuityOperationType;
  audit: unknown;
}

/**
 * IW-31 — Continuity guard. Every write to a protected object routes through
 * here: UPDATE/DELETE/OVERWRITE are BLOCKED (HC-04); CREATE/REVISE/SUPERSEDE/
 * DEPRECATE are allowed and appended; tier upgrades require authority (HC-03).
 * Every decision is logged to the immutable ContinuityAudit trail + IURG.
 */
@Injectable()
export class ContinuityGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly iurg: IurgService,
  ) {}

  private assertProtected(targetType: string): ProtectedObjectType {
    const t = targetType.trim().toLowerCase();
    if (!(PROTECTED_OBJECT_TYPES as readonly string[]).includes(t)) {
      throw new BadRequestException(
        `Unknown protected target type "${targetType}". Expected one of: ${PROTECTED_OBJECT_TYPES.join(', ')}.`,
      );
    }
    return t as ProtectedObjectType;
  }

  async guard(
    workspaceId: string,
    userId: string,
    input: GuardInput,
    ctx?: MutationAuditContext,
  ): Promise<GuardResult> {
    const targetType = this.assertProtected(input.targetType);
    const op = normalizeOperation(input.operation);

    let blocked = false;
    let blockReason: string | null = null;
    let operation: ContinuityOperationType;
    let relatedDg: string | null = null;

    const tier = evaluateTierChange(input.tierFrom, input.tierTo, input.approverAuthority);

    if (isForbidden(op)) {
      blocked = true;
      operation = op === 'DELETE' ? 'BLOCKED_DELETE' : 'BLOCKED_UPDATE';
      blockReason = `HC-04: destructive ${op} on ${targetType} is forbidden — use REVISE / SUPERSEDE / DEPRECATE (append-only).`;
    } else if (op === 'CREATE' || op === 'REVISE' || op === 'SUPERSEDE' || op === 'DEPRECATE') {
      if (tier.isUpgrade && !tier.allowed) {
        // HC-03: an unauthorised tier upgrade is a blocked (attempted) update.
        blocked = true;
        operation = 'BLOCKED_UPDATE';
        blockReason = tier.reason;
        relatedDg = tier.requiredAuthority;
      } else {
        operation = op;
        relatedDg = tier.isUpgrade
          ? dgForTier(input.tierTo!)
          : input.tierTo
            ? dgForTier(input.tierTo)
            : null;
      }
    } else {
      throw new BadRequestException(`Unsupported continuity operation "${input.operation}".`);
    }

    const version =
      (await this.prisma.continuityAudit.count({
        where: { workspaceId, targetType, targetId: input.targetId, blocked: false },
      })) + 1;

    // Bind blocked destructive attempts to IURG as HC-04 violations (best-effort).
    let iurgNodeId: string | null = null;
    if (blocked) {
      iurgNodeId = await this.bindViolation(workspaceId, userId, blockReason ?? 'HC-04 violation');
    } else if (operation === 'SUPERSEDE' && input.previousRef) {
      // The new version supersedes the old one in the graph.
      await this.iurg
        .createLink(
          workspaceId,
          'SUPERSEDES',
          { type: targetType.toUpperCase(), id: input.targetId, ref: input.targetId },
          { type: targetType.toUpperCase(), id: input.previousRef, ref: input.previousRef },
          'CONTINUITY_SUPERSEDE',
        )
        .catch(() => undefined);
    }

    const audit = await this.prisma.continuityAudit.create({
      data: {
        workspaceId,
        operation,
        targetType,
        targetId: input.targetId,
        actorId: userId,
        previousValue: (input.previousValue ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: input.reason?.trim() || `${operation} ${targetType}`,
        blocked,
        blockReason,
        relatedDg,
        tierFrom: input.tierFrom ?? null,
        tierTo: input.tierTo ?? null,
        version,
        iurgNodeId,
        traceId: input.traceId?.trim() ?? null,
      },
    });

    await this.recordAudit(
      `CONTINUITY_${operation}`,
      audit.id,
      ctx ?? { actorId: userId },
      workspaceId,
      userId,
      { targetType, targetId: input.targetId, blocked },
      !blocked,
    );

    return { allowed: !blocked, blocked, operation, audit };
  }

  private async bindViolation(
    workspaceId: string,
    userId: string,
    reason: string,
  ): Promise<string | null> {
    try {
      const result = await this.iurg.bindFicEvent({
        workspaceId,
        actorId: userId,
        decision: 'REJECTED',
        reason,
        applicableIntentIds: [],
        applicableConstraintIds: ['HC-04'],
        executionBlocks: [],
        hardViolations: ['HC-04'],
        requiredGates: [],
        softFlags: [],
        activeOverrides: [],
        conflicts: [],
        playbooks: [],
        domains: ['operational', 'strategic'],
      });
      return result.node.id;
    } catch {
      return null;
    }
  }

  private async recordAudit(
    action: string,
    resourceId: string,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    after: Record<string, unknown>,
    success: boolean,
  ) {
    await this.audit.log({
      action,
      resourceType: 'ContinuityAudit',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after: after as Prisma.JsonObject,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
    });
  }
}

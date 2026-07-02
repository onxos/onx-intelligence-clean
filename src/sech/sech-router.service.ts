import { Injectable } from '@nestjs/common';
import { Prisma, SechRouteStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CONSTRAINTS_BY_ID } from '../intent-compiler/fic-enforcement.constants';
import { FicEnforcementService } from '../intent-compiler/fic-enforcement.service';
import {
  SECH_GATES,
  SECH_OVERRIDE_EXPIRY_MS,
  SECH_POST_GATE,
  SECH_PRE_GATES,
} from './sech.constants';
import { SechPendingQueryDto, SechRouteRequestDto } from './dto/sech.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

/** Minimal shape of the FicEnforcementService.runCheck result consumed here. */
interface FicCheckLike {
  id: string;
  checkId: string;
  decision: 'APPROVED' | 'REJECTED' | 'CONFLICT' | 'OVERRIDE';
  reason: string;
  counterProposal: string | null;
  requiresHumanApproval: boolean;
  softFlags: string[];
  requiredGates: string[];
  applicableConstraintIds: string[];
  activeOverrides: string[];
}

export interface GateResult {
  gate: string;
  checkType: string;
  decision: string;
  checkId: string | null;
  reason: string;
  counterProposal: string | null;
  requiresHumanApproval: boolean;
  conditions: string[];
  failSafe: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class SechRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fic: FicEnforcementService,
  ) {}

  // ----------------------------------------------------------------------
  // Router — runs the 4 SECH gates around a decision.
  // ----------------------------------------------------------------------

  async route(
    workspaceId: string,
    userId: string,
    dto: SechRouteRequestDto,
    ctx?: MutationAuditContext,
  ) {
    const gateResults: GateResult[] = [];
    const conditions = new Set<string>();
    let status: SechRouteStatus = SechRouteStatus.ROUTING;
    let finalDecision: string | null = null;
    let counterProposal: string | null = null;
    let requiresHumanApproval = false;
    let escalated = false;
    let executed = false;
    let outcomeValidated = false;
    let overrideUsed = false;
    let overrideExpiresAt: Date | null = null;
    let currentGate: string | null = null;

    // --- Pre-gates: pre_judgment -> pre_decision -> pre_execution ---
    for (const gate of SECH_PRE_GATES) {
      currentGate = gate.gate;
      const result = await this.runGate(workspaceId, userId, dto, gate.gate, gate.checkType, ctx);
      gateResults.push(result);
      result.conditions.forEach((c) => conditions.add(c));

      if (result.decision === 'REJECTED') {
        status = SechRouteStatus.REJECTED;
        finalDecision = 'REJECTED';
        counterProposal = result.counterProposal;
        break;
      }
      if (result.decision === 'CONFLICT') {
        status = SechRouteStatus.CONFLICT;
        finalDecision = 'CONFLICT';
        requiresHumanApproval = true;
        escalated = true;
        break;
      }
      if (result.decision === 'OVERRIDE') {
        overrideUsed = true;
        overrideExpiresAt = new Date(Date.now() + SECH_OVERRIDE_EXPIRY_MS);
        // Override passes the gate but under time-bound conditions.
        continue;
      }
      // APPROVED -> continue to the next gate.
    }

    // --- Execute + post-outcome gate (only when no pre-gate stopped routing) ---
    if (status === SechRouteStatus.ROUTING) {
      executed = true;
      currentGate = SECH_POST_GATE.gate;
      const post = await this.runGate(
        workspaceId,
        userId,
        dto,
        SECH_POST_GATE.gate,
        SECH_POST_GATE.checkType,
        ctx,
      );
      gateResults.push(post);
      post.conditions.forEach((c) => conditions.add(c));
      outcomeValidated = post.decision === 'APPROVED' || post.decision === 'OVERRIDE';
      if (!outcomeValidated) {
        // Action already executed; the misalignment is flagged for follow-up.
        escalated = escalated || post.decision === 'CONFLICT';
        counterProposal = post.counterProposal ?? counterProposal;
      }
      finalDecision = overrideUsed ? 'OVERRIDE' : 'APPROVED';
      status = overrideUsed ? SechRouteStatus.OVERRIDE : SechRouteStatus.COMPLETED;
    }

    const route = await this.prisma.sechRoute.create({
      data: {
        workspaceId,
        requesterId: userId,
        checkType: dto.checkType?.trim() ?? null,
        decisionContext: dto.decisionContext?.trim() ?? null,
        playbooks: dto.playbooks ?? [],
        domains: dto.domains ?? [],
        signals: (dto.signals ?? {}) as Prisma.InputJsonValue,
        status,
        currentGate,
        finalDecision,
        gateResults: gateResults as unknown as Prisma.InputJsonValue,
        conditions: Array.from(conditions),
        counterProposal,
        requiresHumanApproval,
        overrideExpiresAt,
        executed,
        outcomeValidated,
        escalated,
        traceId: dto.traceId?.trim() ?? null,
      },
    });

    await this.recordAudit(
      `SECH_ROUTE_${status}`,
      route.id,
      ctx ?? { actorId: userId },
      workspaceId,
      userId,
      {
        status,
        finalDecision,
        gates: gateResults.map((g) => ({ gate: g.gate, decision: g.decision })),
      },
      true,
    );

    return this.serialize(route, gateResults);
  }

  // ----------------------------------------------------------------------
  // Gate runner (fail-safe: any exception -> REJECTED)
  // ----------------------------------------------------------------------

  private async runGate(
    workspaceId: string,
    userId: string,
    dto: SechRouteRequestDto,
    gate: string,
    checkType: string,
    ctx?: MutationAuditContext,
  ): Promise<GateResult> {
    const signals = {
      ...(dto.signals ?? {}),
      ...(dto.gateSignals?.[checkType] ?? {}),
    };
    try {
      const check = (await this.fic.runCheck(
        workspaceId,
        userId,
        {
          checkType,
          decisionContext: dto.decisionContext,
          playbooks: dto.playbooks,
          domains: dto.domains,
          signals,
          traceId: dto.traceId,
        },
        ctx,
      )) as unknown as FicCheckLike;

      return {
        gate,
        checkType,
        decision: check.decision,
        checkId: check.checkId,
        reason: check.reason,
        counterProposal: check.counterProposal ?? null,
        requiresHumanApproval: check.requiresHumanApproval,
        conditions: this.deriveConditions(check),
        failSafe: false,
      };
    } catch (error: any) {
      // Fail-safe: a broken FIC check must never let a decision through.
      await this.recordAudit(
        'SECH_GATE_FAILSAFE',
        undefined,
        ctx ?? { actorId: userId },
        workspaceId,
        userId,
        { gate, checkType },
        false,
        { error: String(error?.message ?? error) },
      );
      return {
        gate,
        checkType,
        decision: 'REJECTED',
        checkId: null,
        reason: `FIC check failed at ${gate}; defaulting to REJECTED (fail-safe).`,
        counterProposal: 'Resolve the FIC enforcement error and re-submit the decision.',
        requiresHumanApproval: false,
        conditions: [],
        failSafe: true,
      };
    }
  }

  /** Conditions attached to an APPROVED/OVERRIDE gate (soft flags + OVR tracking). */
  private deriveConditions(check: FicCheckLike): string[] {
    const conditions: string[] = [];
    for (const id of check.softFlags ?? []) {
      const c = CONSTRAINTS_BY_ID.get(id);
      conditions.push(`${id}: ${c?.title ?? 'documented justification required'}`);
    }
    for (const id of check.applicableConstraintIds ?? []) {
      if (id.startsWith('OVR-')) {
        const c = CONSTRAINTS_BY_ID.get(id);
        conditions.push(`${id}: ${c?.timing ?? 'post-execution validation'}`);
      }
    }
    return Array.from(new Set(conditions));
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  listGates() {
    return { total: SECH_GATES.length, gates: SECH_GATES };
  }

  async gatesStatus(workspaceId: string) {
    const lastRoute = await this.prisma.sechRoute.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      total: SECH_GATES.length,
      gates: SECH_GATES,
      lastRoute: lastRoute
        ? {
            id: lastRoute.id,
            routeId: lastRoute.routeId,
            status: lastRoute.status,
            finalDecision: lastRoute.finalDecision,
            gateResults: lastRoute.gateResults,
            createdAt: lastRoute.createdAt,
          }
        : null,
    };
  }

  async listPending(workspaceId: string, query: SechPendingQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.SechRouteWhereInput = {
      workspaceId,
      status: SechRouteStatus.CONFLICT,
    };
    const [total, items] = await Promise.all([
      this.prisma.sechRoute.count({ where }),
      this.prisma.sechRoute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getRoute(id: string, workspaceId: string) {
    const route = await this.prisma.sechRoute.findFirst({
      where: { workspaceId, OR: [{ id }, { routeId: id }] },
    });
    if (!route) {
      return null;
    }
    return route;
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private serialize(
    route: {
      id: string;
      routeId: string;
      status: SechRouteStatus;
      finalDecision: string | null;
      currentGate: string | null;
      conditions: string[];
      counterProposal: string | null;
      requiresHumanApproval: boolean;
      overrideExpiresAt: Date | null;
      executed: boolean;
      outcomeValidated: boolean;
      escalated: boolean;
      createdAt: Date;
    },
    gateResults: GateResult[],
  ) {
    return {
      id: route.id,
      routeId: route.routeId,
      status: route.status,
      finalDecision: route.finalDecision,
      currentGate: route.currentGate,
      gateResults,
      conditions: route.conditions,
      counterProposal: route.counterProposal,
      requiresHumanApproval: route.requiresHumanApproval,
      overrideExpiresAt: route.overrideExpiresAt,
      executed: route.executed,
      outcomeValidated: route.outcomeValidated,
      escalated: route.escalated,
      createdAt: route.createdAt,
    };
  }

  private async recordAudit(
    action: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    after: Record<string, unknown> | null,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType: 'SechRoute',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
      metadata,
    });
  }
}

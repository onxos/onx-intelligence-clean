import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { FicCheckDecision, FicViolationKind, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import { IurgService } from '../iurg/iurg.service';
import {
  ADVISORY_CONSTRAINTS,
  ALL_CONSTRAINTS,
  CONFLICT_RESOLUTION_CLASSES,
  CONSTRAINTS_BY_ID,
  CONSTRAINT_COUNT,
  DECISION_GATES,
  EXECUTION_BLOCKS,
  FOUNDER_INTENT_CORPUS,
  HARD_CONSTRAINTS,
  OUTCOME_VALIDATION_RULES,
  OVERRIDE_RULES,
  PLAYBOOK_CONSTRAINT_MAPPINGS,
  PRIORITY_HIERARCHY,
  SECH_FIC_CHECK_STEPS,
  SOFT_CONSTRAINTS,
} from './fic-enforcement.constants';
import { FicCheckResult, runFicCheck } from './fic-enforcement.engine';
import { FicCheckListQueryDto, FicCheckRequestDto } from './dto/fic-enforcement.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class FicEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    @Optional() private readonly iurg?: IurgService,
  ) {}

  // ----------------------------------------------------------------------
  // Registry read (constitutional source of truth — code-versioned)
  // ----------------------------------------------------------------------

  getRegistrySummary() {
    return {
      constraintCount: CONSTRAINT_COUNT,
      counts: {
        HC: HARD_CONSTRAINTS.length,
        SC: SOFT_CONSTRAINTS.length,
        AC: ADVISORY_CONSTRAINTS.length,
        DG: DECISION_GATES.length,
        EB: EXECUTION_BLOCKS.length,
        OVR: OUTCOME_VALIDATION_RULES.length,
        OR: OVERRIDE_RULES.length,
      },
      intentCount: FOUNDER_INTENT_CORPUS.length,
      conflictClassCount: CONFLICT_RESOLUTION_CLASSES.length,
      playbookCount: PLAYBOOK_CONSTRAINT_MAPPINGS.length,
      checkSequenceSteps: SECH_FIC_CHECK_STEPS.length,
    };
  }

  listConstraints(kind?: string) {
    const normalized = kind?.trim().toUpperCase();
    const list = normalized
      ? ALL_CONSTRAINTS.filter((c) => c.kind === normalized)
      : ALL_CONSTRAINTS;
    return { total: list.length, items: list };
  }

  getConstraint(id: string) {
    const constraint = CONSTRAINTS_BY_ID.get(id.trim().toUpperCase());
    if (!constraint) {
      throw new NotFoundException(`Constraint ${id} not found`);
    }
    return constraint;
  }

  listIntents() {
    return { total: FOUNDER_INTENT_CORPUS.length, items: FOUNDER_INTENT_CORPUS };
  }

  listConflictClasses() {
    return { total: CONFLICT_RESOLUTION_CLASSES.length, items: CONFLICT_RESOLUTION_CLASSES };
  }

  getPriorityHierarchy() {
    return { total: PRIORITY_HIERARCHY.length, items: PRIORITY_HIERARCHY };
  }

  listPlaybooks() {
    return { total: PLAYBOOK_CONSTRAINT_MAPPINGS.length, items: PLAYBOOK_CONSTRAINT_MAPPINGS };
  }

  getCheckSequence() {
    return { total: SECH_FIC_CHECK_STEPS.length, items: SECH_FIC_CHECK_STEPS };
  }

  // ----------------------------------------------------------------------
  // POST /sech/fic-check — run the 13-step enforcement sequence + persist
  // ----------------------------------------------------------------------

  async runCheck(
    workspaceId: string,
    userId: string,
    dto: FicCheckRequestDto,
    ctx?: MutationAuditContext,
  ) {
    const result = runFicCheck({
      playbooks: dto.playbooks,
      domains: dto.domains,
      signals: dto.signals,
      decisionContext: dto.decisionContext,
    });

    try {
      const check = await this.prisma.$transaction(async (tx) => {
        const created = await tx.ficEnforcementCheck.create({
          data: {
            workspaceId,
            requesterId: userId,
            checkType: dto.checkType?.trim() ?? null,
            decisionContext: dto.decisionContext?.trim() ?? null,
            playbooks: dto.playbooks ?? [],
            domains: dto.domains ?? [],
            signals: (dto.signals ?? {}) as Prisma.InputJsonValue,
            decision: result.decision as FicCheckDecision,
            reason: result.reason,
            applicableIntentIds: result.applicableIntentIds,
            applicableConstraintIds: result.applicableConstraintIds,
            executionBlocks: result.executionBlocks,
            hardViolations: result.hardViolations,
            softFlags: result.softFlags,
            requiredGates: result.requiredGates,
            activeOverrides: result.activeOverrides,
            priorityLevel: result.priorityLevel ?? null,
            requiresHumanApproval: result.requiresHumanApproval,
            counterProposal: result.counterProposal ?? null,
            steps: result.steps as unknown as Prisma.InputJsonValue,
            conflicts: result.conflicts as unknown as Prisma.InputJsonValue,
            traceId: dto.traceId?.trim() ?? null,
          },
        });

        // Step 12: persist per-constraint evaluations (IURG enforced_by edges).
        if (result.evaluations.length > 0) {
          await tx.ficConstraintEvaluation.createMany({
            data: result.evaluations.map((e) => ({
              checkId: created.id,
              constraintId: e.constraintId,
              kind: e.kind,
              title: e.title,
              outcome: e.outcome,
              triggered: e.triggered,
              reason: e.reason,
              workspaceId,
            })),
          });
        }

        // Step 12: persist violations (IURG violated_by edges) for EB/HC + conflict/override.
        const violations = this.deriveViolations(result);
        if (violations.length > 0) {
          await tx.ficEnforcementViolation.createMany({
            data: violations.map((v) => ({
              checkId: created.id,
              constraintId: v.constraintId,
              kind: v.kind,
              description: v.description,
              autoUnblock: v.autoUnblock ?? null,
              workspaceId,
            })),
          });
        }

        return created;
      });

      await this.recordAudit(
        this.auditActionFor(result.decision),
        check.id,
        ctx,
        workspaceId,
        userId,
        { decision: result.decision, playbooks: dto.playbooks ?? [], domains: dto.domains ?? [] },
        true,
      );
      await this.recordEnforcementEvidence(
        workspaceId,
        userId,
        `SECH-FIC check ${result.decision}: ${result.reason}`,
        ctx,
      );

      // IW-24: bind this enforcement event into the IURG (node + edges + ledger).
      await this.bindIurg(workspaceId, userId, check.id, dto, result);

      return this.serializeCheck(check, result);
    } catch (error: any) {
      await this.recordAudit(
        'FIC_ENFORCEMENT_CHECK_FAILED',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async listChecks(workspaceId: string, query: FicCheckListQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.FicEnforcementCheckWhereInput = {
      workspaceId,
      ...(query.decision ? { decision: query.decision as FicCheckDecision } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.ficEnforcementCheck.count({ where }),
      this.prisma.ficEnforcementCheck.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getCheck(id: string, workspaceId: string) {
    const check = await this.prisma.ficEnforcementCheck.findFirst({
      where: { id, workspaceId },
      include: { evaluations: true, violations: true },
    });
    if (!check) {
      throw new NotFoundException('FIC enforcement check not found');
    }
    return check;
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private async bindIurg(
    workspaceId: string,
    userId: string,
    checkId: string,
    dto: FicCheckRequestDto,
    result: FicCheckResult,
  ) {
    if (!this.iurg) {
      return;
    }
    try {
      await this.iurg.bindFicEvent({
        workspaceId,
        actorId: userId,
        decision: result.decision,
        reason: result.reason,
        decisionContext: dto.decisionContext,
        applicableIntentIds: result.applicableIntentIds,
        applicableConstraintIds: result.applicableConstraintIds,
        executionBlocks: result.executionBlocks,
        hardViolations: result.hardViolations,
        requiredGates: result.requiredGates,
        softFlags: result.softFlags,
        activeOverrides: result.activeOverrides,
        conflicts: result.conflicts.map((c) => ({ classId: c.classId, name: c.name })),
        playbooks: dto.playbooks ?? [],
        domains: dto.domains ?? [],
        traceId: dto.traceId ?? null,
        sourceCheckId: checkId,
      });
    } catch {
      // IURG binding is governance-supporting; never block the primary enforcement write.
    }
  }

  private deriveViolations(result: FicCheckResult) {
    const violations: Array<{
      constraintId: string;
      kind: FicViolationKind;
      description: string;
      autoUnblock?: string;
    }> = [];
    for (const id of result.executionBlocks) {
      const c = CONSTRAINTS_BY_ID.get(id);
      violations.push({
        constraintId: id,
        kind: FicViolationKind.EXECUTION_BLOCK,
        description: c?.statement ?? `Execution block ${id}`,
        autoUnblock: c?.autoUnblock,
      });
    }
    for (const id of result.hardViolations) {
      const c = CONSTRAINTS_BY_ID.get(id);
      violations.push({
        constraintId: id,
        kind: FicViolationKind.HARD_CONSTRAINT,
        description: c?.statement ?? `Hard constraint ${id}`,
      });
    }
    return violations;
  }

  private auditActionFor(decision: string): string {
    switch (decision) {
      case 'REJECTED':
        return 'FIC_ENFORCEMENT_REJECTED';
      case 'CONFLICT':
        return 'FIC_ENFORCEMENT_CONFLICT';
      case 'OVERRIDE':
        return 'FIC_ENFORCEMENT_OVERRIDE';
      default:
        return 'FIC_ENFORCEMENT_APPROVED';
    }
  }

  private serializeCheck(
    check: { id: string; checkId: string; createdAt: Date },
    result: FicCheckResult,
  ) {
    return {
      id: check.id,
      checkId: check.checkId,
      createdAt: check.createdAt,
      ...result,
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
      resourceType: 'FicEnforcementCheck',
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

  private async recordEnforcementEvidence(
    workspaceId: string,
    ownerId: string,
    intent: string,
    ctx: MutationAuditContext | undefined,
  ) {
    try {
      await this.evidence.create({ intent, confidence: 1, ownerId, workspaceId }, ctx);
    } catch {
      // Evidence is governance-supporting; never block the primary enforcement write.
    }
  }
}

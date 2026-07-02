import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DecisionRunStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { SechRouterService } from '../sech/sech-router.service';
import { ApproveGateDto, StartLadderDto, DecisionRunListQueryDto } from './dto/decision-ladder.dto';
import {
  INSTITUTIONAL_GATE,
  MAX_ITERATIONS,
  stageForStep,
  stepName,
} from './decision-ladder.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

interface StepEntry {
  step: string;
  name: string;
  stage: string;
  at: string;
  result: string;
}

type RouteDisposition = 'APPROVED' | 'REJECTED' | 'CONFLICT';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class DecisionLadderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sech: SechRouterService,
  ) {}

  // ----------------------------------------------------------------------
  // POST /decision/ladder/start — auto-runs D1-D9 (incl. the D8 FIC gate)
  // ----------------------------------------------------------------------

  async start(
    workspaceId: string,
    userId: string,
    dto: StartLadderDto,
    ctx?: MutationAuditContext,
  ) {
    const perception = await this.prisma.usfipPerceptionRecord.findFirst({
      where: { workspaceId, OR: [{ id: dto.perceptionId }, { recordId: dto.perceptionId }] },
    });
    if (!perception) {
      throw new NotFoundException('Perception record not found');
    }

    const domain = perception.classifiedDomain;
    const rawPayload = (perception.rawPayload ?? {}) as Record<string, any>;
    const subject =
      dto.subject?.trim() ||
      (typeof rawPayload.summary === 'string' ? rawPayload.summary : '') ||
      `Decision from ${perception.sourceType} (${domain})`;
    const signals = this.resolveSignals(dto, rawPayload);

    const history: StepEntry[] = [];
    // D1-D7 auto-progress (Perception + Understanding).
    for (const step of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']) {
      history.push(this.entry(step, 'auto'));
    }

    // D8 Evaluate — SECH pre_decision FIC check.
    const route = await this.sech.route(
      workspaceId,
      userId,
      {
        checkType: 'pre_decision',
        decisionContext: subject,
        domains: [domain],
        signals,
        traceId: dto.traceId,
      },
      ctx,
    );
    const ficCheckIds = (route.gateResults ?? [])
      .map((g: any) => g.checkId)
      .filter((v: unknown): v is string => Boolean(v));
    const sechRouteIds = [route.id];
    const disposition = this.mapRoute(route.status);
    history.push(this.entry('D8', `FIC ${route.status} -> ${disposition}`));

    if (disposition === 'REJECTED') {
      const run = await this.createRun(
        workspaceId,
        userId,
        dto,
        perception.recordId,
        subject,
        signals,
        {
          currentStep: 'D8',
          status: 'ABANDONED',
          finalDecision: 'REJECTED',
          stepHistory: history,
          ficCheckIds,
          sechRouteIds,
        },
      );
      await this.recordAudit('DECISION_LADDER_ABANDONED', run.id, ctx, workspaceId, userId, {
        reason: 'FIC pre_decision REJECTED at D8',
      });
      return this.serialize(run);
    }

    if (disposition === 'CONFLICT') {
      const run = await this.createRun(
        workspaceId,
        userId,
        dto,
        perception.recordId,
        subject,
        signals,
        {
          currentStep: 'D8',
          status: 'PAUSED',
          humanGateRequired: true,
          humanGateType: 'CONFLICT',
          stepHistory: history,
          ficCheckIds,
          sechRouteIds,
        },
      );
      await this.recordAudit('DECISION_LADDER_PAUSED', run.id, ctx, workspaceId, userId, {
        reason: 'FIC pre_decision CONFLICT at D8',
      });
      return this.serialize(run);
    }

    // APPROVED — D9 Prioritize, land ready for D10 Choose.
    history.push(this.entry('D9', 'prioritized by Founder Intent alignment'));
    const run = await this.createRun(
      workspaceId,
      userId,
      dto,
      perception.recordId,
      subject,
      signals,
      {
        currentStep: 'D9',
        status: 'ACTIVE',
        humanGateType: dto.humanGateType?.trim() || null,
        stepHistory: history,
        ficCheckIds,
        sechRouteIds,
      },
    );
    await this.recordAudit('DECISION_LADDER_STARTED', run.id, ctx, workspaceId, userId, {
      subject,
      domain,
    });
    return this.serialize(run);
  }

  // ----------------------------------------------------------------------
  // POST /decision/runs/:id/step — advance one step (D9 -> D14)
  // ----------------------------------------------------------------------

  async advance(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const run = await this.loadRun(id, workspaceId);
    if (run.humanGateRequired) {
      throw new BadRequestException(
        `Run is paused at ${run.currentStep} awaiting ${run.humanGateType ?? 'human'} approval.`,
      );
    }
    if (run.status !== DecisionRunStatus.ACTIVE) {
      throw new BadRequestException(`Run is ${run.status} and cannot be advanced.`);
    }

    const history = [...(run.stepHistory as unknown as StepEntry[])];
    const data: Prisma.DecisionRunUpdateInput = {};

    switch (run.currentStep) {
      case 'D9': {
        // D10 Choose — human gate if a DG threshold applies.
        if (run.humanGateType) {
          data.currentStep = 'D10';
          data.currentStage = stageForStep('D10');
          data.status = DecisionRunStatus.PAUSED;
          data.humanGateRequired = true;
          history.push(this.entry('D10', `human gate required: ${run.humanGateType}`));
        } else {
          data.currentStep = 'D10';
          data.currentStage = stageForStep('D10');
          data.finalDecision = run.subject;
          history.push(this.entry('D10', 'decision chosen (no gate)'));
        }
        break;
      }
      case 'D10':
        data.currentStep = 'D11';
        data.currentStage = stageForStep('D11');
        history.push(this.entry('D11', 'decision applied in controlled context'));
        break;
      case 'D11':
        data.currentStep = 'D12';
        data.currentStage = stageForStep('D12');
        history.push(this.entry('D12', 'outcome measured against prediction'));
        break;
      case 'D12':
        data.currentStep = 'D13';
        data.currentStage = stageForStep('D13');
        history.push(this.entry('D13', 'refined based on validation'));
        break;
      case 'D13':
        return this.attemptInstitutionalize(run, history, ctx);
      case 'D14':
        throw new BadRequestException('Run is at D14 — approve DG-10 to institutionalize.');
      default:
        throw new BadRequestException(`Run cannot advance from ${run.currentStep}.`);
    }

    const updated = await this.prisma.decisionRun.update({
      where: { id: run.id },
      data: { ...data, stepHistory: history as unknown as Prisma.InputJsonValue[] },
    });
    await this.recordAudit('DECISION_LADDER_ADVANCED', run.id, ctx, workspaceId, userId, {
      from: run.currentStep,
      to: updated.currentStep,
    });
    return this.serialize(updated);
  }

  /** D13 -> D14: SECH post_outcome OVR validation with a loop guard. */
  private async attemptInstitutionalize(
    run: Prisma.DecisionRunGetPayload<object>,
    history: StepEntry[],
    ctx?: MutationAuditContext,
  ) {
    const perception = await this.prisma.usfipPerceptionRecord.findFirst({
      where: { workspaceId: run.workspaceId, recordId: run.perceptionId },
    });
    const domain = perception?.classifiedDomain ?? 'operational';

    const route = await this.sech.route(
      run.workspaceId,
      run.requesterId,
      {
        checkType: 'post_outcome',
        decisionContext: run.subject,
        domains: [domain],
        signals: (run.signals ?? {}) as Record<string, boolean | number>,
      },
      ctx,
    );
    const disposition = this.mapRoute(route.status);
    const ficCheckIds = [
      ...run.ficCheckIds,
      ...(route.gateResults ?? [])
        .map((g: any) => g.checkId)
        .filter((v: unknown): v is string => Boolean(v)),
    ];
    const sechRouteIds = [...run.sechRouteIds, route.id];

    const data: Prisma.DecisionRunUpdateInput = { ficCheckIds, sechRouteIds };

    if (disposition === 'APPROVED') {
      // Outcome validated — require DG-10 Founder approval to institutionalize.
      data.currentStep = 'D14';
      data.currentStage = stageForStep('D14');
      data.outcomeValidated = true;
      data.humanGateRequired = true;
      data.humanGateType = INSTITUTIONAL_GATE;
      data.status = DecisionRunStatus.PAUSED;
      history.push(
        this.entry('D14', `outcome validated; awaiting ${INSTITUTIONAL_GATE} Founder approval`),
      );
    } else {
      // Outcome failed — return to D13 (iterate). Loop guard on repeated failure.
      const iteration = run.iterationCount + 1;
      data.iterationCount = iteration;
      data.outcomeValidated = false;
      data.currentStep = 'D13';
      data.currentStage = stageForStep('D13');
      if (iteration >= MAX_ITERATIONS) {
        data.status = DecisionRunStatus.PAUSED;
        data.humanGateRequired = true;
        data.humanGateType = 'DG-10-REVIEW';
        history.push(
          this.entry('D13', `outcome failed ${iteration}x — paused for human review (loop guard)`),
        );
      } else {
        history.push(this.entry('D13', `outcome failed (${iteration}) — iterating`));
      }
    }

    const updated = await this.prisma.decisionRun.update({
      where: { id: run.id },
      data: { ...data, stepHistory: history as unknown as Prisma.InputJsonValue[] },
    });
    await this.recordAudit(
      'DECISION_LADDER_ADVANCED',
      run.id,
      ctx,
      run.workspaceId,
      run.requesterId,
      {
        step: 'D13->D14',
        disposition,
        outcomeValidated: updated.outcomeValidated,
      },
    );
    return this.serialize(updated);
  }

  // ----------------------------------------------------------------------
  // POST /decision/runs/:id/approve — resolve a human gate
  // ----------------------------------------------------------------------

  async approve(
    id: string,
    workspaceId: string,
    userId: string,
    dto: ApproveGateDto,
    ctx?: MutationAuditContext,
  ) {
    const run = await this.loadRun(id, workspaceId);
    if (!run.humanGateRequired) {
      throw new BadRequestException('Run has no pending human gate.');
    }
    const approver = dto.approver?.trim() || userId;
    const history = [...(run.stepHistory as unknown as StepEntry[])];
    const data: Prisma.DecisionRunUpdateInput = {
      humanGateRequired: false,
      humanGateApprover: approver,
      humanGateResolvedAt: new Date(),
    };

    if (run.currentStep === 'D8') {
      // Conflict escalation resolved — resume at D9.
      data.currentStep = 'D9';
      data.currentStage = stageForStep('D9');
      data.status = DecisionRunStatus.ACTIVE;
      data.humanGateType = null;
      history.push(this.entry('D9', `conflict resolved by ${approver}`));
    } else if (run.currentStep === 'D10') {
      // Decision Gate approved — the decision is chosen; resume to Adapt.
      data.status = DecisionRunStatus.ACTIVE;
      data.finalDecision = run.subject;
      data.humanGateType = null;
      history.push(this.entry('D10', `${run.humanGateType} approved by ${approver}`));
    } else if (run.currentStep === 'D14' || run.currentStep === 'D13') {
      // DG-10 Founder approval — promote to institutional rule.
      const ruleId = `RULE-${crypto.randomUUID()}`;
      data.status = DecisionRunStatus.PROMOTED;
      data.promotedToRule = true;
      data.ruleId = ruleId;
      data.outcomeValidated = true;
      data.currentStep = 'D14';
      data.currentStage = 'GROWTH';
      history.push(this.entry('D14', `institutionalized as ${ruleId} by ${approver}`));
    } else {
      throw new BadRequestException(`No resolvable gate at ${run.currentStep}.`);
    }

    const updated = await this.prisma.decisionRun.update({
      where: { id: run.id },
      data: { ...data, stepHistory: history as unknown as Prisma.InputJsonValue[] },
    });
    await this.recordAudit(
      updated.status === DecisionRunStatus.PROMOTED
        ? 'DECISION_LADDER_PROMOTED'
        : 'DECISION_LADDER_APPROVED',
      run.id,
      ctx,
      workspaceId,
      userId,
      { step: updated.currentStep, approver, ruleId: updated.ruleId },
    );
    return this.serialize(updated);
  }

  async abandon(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const run = await this.loadRun(id, workspaceId);
    if (run.status === DecisionRunStatus.PROMOTED || run.status === DecisionRunStatus.ABANDONED) {
      throw new BadRequestException(`Run is already ${run.status}.`);
    }
    const history = [...(run.stepHistory as unknown as StepEntry[])];
    history.push(this.entry(run.currentStep, `abandoned by ${userId}`));
    const updated = await this.prisma.decisionRun.update({
      where: { id: run.id },
      data: {
        status: DecisionRunStatus.ABANDONED,
        humanGateRequired: false,
        stepHistory: history as unknown as Prisma.InputJsonValue[],
      },
    });
    await this.recordAudit('DECISION_LADDER_ABANDONED', run.id, ctx, workspaceId, userId, {
      step: run.currentStep,
    });
    return this.serialize(updated);
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  async listRuns(workspaceId: string, query: DecisionRunListQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.DecisionRunWhereInput = {
      workspaceId,
      ...(query.status ? { status: query.status as DecisionRunStatus } : {}),
      ...(query.currentStep ? { currentStep: query.currentStep } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.decisionRun.count({ where }),
      this.prisma.decisionRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getRun(id: string, workspaceId: string) {
    const run = await this.loadRun(id, workspaceId);
    return this.serialize(run);
  }

  async pendingGates(workspaceId: string, query: DecisionRunListQueryDto) {
    const pageSize = Math.min(Number(query.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: Prisma.DecisionRunWhereInput = { workspaceId, humanGateRequired: true };
    const [total, items] = await Promise.all([
      this.prisma.decisionRun.count({ where }),
      this.prisma.decisionRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async stats(workspaceId: string) {
    const [byStage, byStatus, total] = await Promise.all([
      this.prisma.decisionRun.groupBy({
        by: ['currentStage'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.decisionRun.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.decisionRun.count({ where: { workspaceId } }),
    ]);
    return {
      total,
      byStage: Object.fromEntries(byStage.map((g) => [g.currentStage, g._count._all])),
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    };
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private entry(step: string, result: string): StepEntry {
    return {
      step,
      name: stepName(step),
      stage: stageForStep(step),
      at: new Date().toISOString(),
      result,
    };
  }

  private resolveSignals(
    dto: StartLadderDto,
    rawPayload: Record<string, any>,
  ): Record<string, boolean | number> {
    if (dto.signals && typeof dto.signals === 'object') {
      return dto.signals as Record<string, boolean | number>;
    }
    if (
      rawPayload.signals &&
      typeof rawPayload.signals === 'object' &&
      !Array.isArray(rawPayload.signals)
    ) {
      return rawPayload.signals as Record<string, boolean | number>;
    }
    return {};
  }

  private mapRoute(routeStatus: string): RouteDisposition {
    switch (routeStatus) {
      case 'REJECTED':
        return 'REJECTED';
      case 'CONFLICT':
        return 'CONFLICT';
      case 'OVERRIDE':
      case 'COMPLETED':
      case 'APPROVED':
        return 'APPROVED';
      default:
        return 'REJECTED';
    }
  }

  private async createRun(
    workspaceId: string,
    userId: string,
    dto: StartLadderDto,
    perceptionRecordId: string,
    subject: string,
    signals: Record<string, boolean | number>,
    fields: {
      currentStep: string;
      status: DecisionRunStatus | keyof typeof DecisionRunStatus;
      humanGateRequired?: boolean;
      humanGateType?: string | null;
      finalDecision?: string | null;
      stepHistory: StepEntry[];
      ficCheckIds: string[];
      sechRouteIds: string[];
    },
  ) {
    return this.prisma.decisionRun.create({
      data: {
        workspaceId,
        requesterId: userId,
        perceptionId: perceptionRecordId,
        subject,
        currentStep: fields.currentStep,
        currentStage: stageForStep(fields.currentStep),
        status: fields.status as DecisionRunStatus,
        humanGateRequired: fields.humanGateRequired ?? false,
        humanGateType: fields.humanGateType ?? null,
        finalDecision: fields.finalDecision ?? null,
        stepHistory: fields.stepHistory as unknown as Prisma.InputJsonValue[],
        ficCheckIds: fields.ficCheckIds,
        sechRouteIds: fields.sechRouteIds,
        signals: signals as Prisma.InputJsonValue,
        traceId: dto.traceId?.trim() ?? null,
      },
    });
  }

  private async loadRun(id: string, workspaceId: string) {
    const run = await this.prisma.decisionRun.findFirst({
      where: { workspaceId, OR: [{ id }, { runId: id }] },
    });
    if (!run) {
      throw new NotFoundException('Decision run not found');
    }
    return run;
  }

  private serialize(run: Prisma.DecisionRunGetPayload<object>) {
    return run;
  }

  private async recordAudit(
    action: string,
    resourceId: string,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType: 'DecisionRun',
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before: null,
      after: metadata ?? null,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: 'SUCCESS',
      success: true,
    });
  }
}

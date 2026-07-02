import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';
import {
  FormJudgmentDto,
  JudgmentListQueryDto,
  PromoteJudgmentDto,
  ValidateJudgmentDto,
} from './dto/judgment.dto';
import {
  clamp01,
  DG_JUDGMENT_PROMOTION,
  DG_RULE_INSTITUTIONALIZATION,
  MIN_UNDERSTANDING_TIER,
  runJudgmentGate,
  SC05_MIN_CORRECT_OUTCOMES,
  SC06_MIN_BRANCHES,
  scoreFounderAlignment,
} from './judgment.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class JudgmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sech: SechRouterService,
    private readonly iurg: IurgService,
  ) {}

  // ----------------------------------------------------------------------
  // POST /judgment/form — Understanding -> Judgment
  // ----------------------------------------------------------------------

  async form(
    workspaceId: string,
    userId: string,
    dto: FormJudgmentDto,
    ctx?: MutationAuditContext,
  ) {
    const understanding = await this.prisma.understandingObject.findFirst({
      where: {
        workspaceId,
        OR: [{ id: dto.understandingId }, { understandingId: dto.understandingId }],
      },
    });
    if (!understanding) {
      throw new NotFoundException('Understanding object not found');
    }

    // Step 1: understanding must be at least "probable".
    if (!MIN_UNDERSTANDING_TIER.includes(understanding.realityTier)) {
      throw new BadRequestException(
        `Judgment requires understanding realityTier >= probable (found "${understanding.realityTier}").`,
      );
    }

    const domain = understanding.domain;
    // Step 2: Founder Intent alignment.
    const { alignment, applicableIntentIds } = scoreFounderAlignment(domain, dto.relatedIntents);

    const subject = dto.subject?.trim() || `Judgment on ${domain} understanding`;
    const decision =
      dto.decision?.trim() || `Act on understanding ${understanding.understandingId}`;
    const reasoning =
      dto.reasoning?.trim() ||
      `Because the understanding (${understanding.realityTier}, confidence ${understanding.confidence.toFixed(
        2,
      )}) aligns with Founder Intent (${alignment.toFixed(2)}) across ${applicableIntentIds.length} applicable intents in ${domain}.`;

    // Step 3: FIC constraint check via SECH pre_decision.
    const gate = await runJudgmentGate(this.sech, this.iurg, {
      workspaceId,
      userId,
      domain,
      decisionContext: `${subject}: ${decision}`,
      signals: dto.signals,
      ctx,
    });

    // Step 4: evidence quality (AC-05) blended with alignment.
    const confidence = clamp01(understanding.confidence * 0.5 + alignment * 0.5);

    const judgment = await this.prisma.judgmentObject.create({
      data: {
        workspaceId,
        requesterId: userId,
        understandingId: understanding.understandingId,
        domain,
        subject,
        decision,
        reasoning,
        founderAlignment: alignment,
        constraintCheck: gate.constraintCheck,
        violatedConstraints: gate.constraintCheck === 'FAIL' ? ['HC/DG'] : [],
        confidence,
        realityTier: 'speculative', // a judgment starts outcome-unproven
        status: gate.approved ? 'preliminary' : 'rejected',
        relatedIntents: dto.relatedIntents ?? applicableIntentIds.slice(0, 5),
        ficCheckId: gate.ficCheckId,
        sechRouteId: gate.sechRouteId,
        iurgNodeId: gate.iurgNodeId,
      },
    });

    // IURG edge: understanding --realized_as--> judgment.
    if (gate.approved) {
      await this.iurg.createLink(
        workspaceId,
        'REALIZED_AS',
        {
          type: 'UNDERSTANDING',
          id: understanding.understandingId,
          ref: understanding.understandingId,
        },
        { type: 'JUDGMENT', id: judgment.judgmentId, ref: judgment.judgmentId },
        'JUDGMENT_FORMATION',
      );
    }

    await this.recordAudit(
      `JUDGMENT_FORMED_${judgment.status.toUpperCase()}`,
      judgment.id,
      ctx,
      workspaceId,
      userId,
      { domain, constraintCheck: gate.constraintCheck, alignment, approved: gate.approved },
      gate.approved,
    );

    return judgment;
  }

  // ----------------------------------------------------------------------
  // POST /judgment/:id/validate — record a validation outcome
  // ----------------------------------------------------------------------

  async validate(
    id: string,
    workspaceId: string,
    userId: string,
    dto: ValidateJudgmentDto,
    ctx?: MutationAuditContext,
  ) {
    const judgment = await this.loadJudgment(id, workspaceId);
    if (judgment.status === 'rejected' || judgment.status === 'overruled') {
      throw new BadRequestException(`Cannot validate a ${judgment.status} judgment.`);
    }

    const branch = dto.branch?.trim();
    const data: Prisma.JudgmentObjectUpdateInput = {};
    if (dto.correct) {
      data.validationCount = judgment.validationCount + 1;
      if (branch && !judgment.validationBranches.includes(branch)) {
        data.validationBranches = [...judgment.validationBranches, branch];
      }
    } else {
      data.incorrectCount = judgment.incorrectCount + 1;
    }

    const updated = await this.prisma.judgmentObject.update({ where: { id: judgment.id }, data });

    // IURG edge: judgment --validated_by--> evidence outcome.
    await this.iurg.createLink(
      workspaceId,
      'VALIDATED_BY',
      { type: 'JUDGMENT', id: judgment.judgmentId, ref: judgment.judgmentId },
      {
        type: 'EVIDENCE',
        id: dto.evidenceRef?.trim() || `outcome-${Date.now()}`,
        ref: dto.evidenceRef?.trim() ?? null,
      },
      'JUDGMENT_VALIDATION',
    );

    await this.recordAudit(
      'JUDGMENT_VALIDATED',
      judgment.id,
      ctx,
      workspaceId,
      userId,
      { correct: dto.correct, validationCount: updated.validationCount, branch },
      true,
    );

    return updated;
  }

  // ----------------------------------------------------------------------
  // POST /judgment/:id/promote — DG-09 (validated) / DG-10 (institutional)
  // ----------------------------------------------------------------------

  async promote(
    id: string,
    workspaceId: string,
    userId: string,
    dto: PromoteJudgmentDto,
    ctx?: MutationAuditContext,
  ) {
    const judgment = await this.loadJudgment(id, workspaceId);
    const approver = dto.approver?.trim() || userId;
    const data: Prisma.JudgmentObjectUpdateInput = { promotedApprover: approver };
    let dg: string;

    if (judgment.status === 'preliminary') {
      // DG-09: Judgment Promotion — requires SC-05 (3+ correct outcomes).
      if (judgment.validationCount < SC05_MIN_CORRECT_OUTCOMES) {
        throw new BadRequestException(
          `DG-09: judgment needs ${SC05_MIN_CORRECT_OUTCOMES}+ correct outcomes (has ${judgment.validationCount}).`,
        );
      }
      data.status = 'validated';
      data.realityTier = 'probable';
      dg = DG_JUDGMENT_PROMOTION;
    } else if (judgment.status === 'validated') {
      // DG-10: Rule Institutionalization — requires SC-06 (2+ branches).
      const branches = new Set(judgment.validationBranches).size;
      if (branches < SC06_MIN_BRANCHES) {
        throw new BadRequestException(
          `DG-10: judgment needs validation at ${SC06_MIN_BRANCHES}+ branches (has ${branches}).`,
        );
      }
      data.status = 'institutional';
      data.realityTier = 'proven';
      data.ruleId = `RULE-${judgment.judgmentId}`;
      dg = DG_RULE_INSTITUTIONALIZATION;
    } else {
      throw new BadRequestException(`Judgment in status "${judgment.status}" cannot be promoted.`);
    }

    const updated = await this.prisma.judgmentObject.update({ where: { id: judgment.id }, data });

    await this.recordAudit(
      updated.status === 'institutional' ? 'JUDGMENT_INSTITUTIONALIZED' : 'JUDGMENT_PROMOTED',
      judgment.id,
      ctx,
      workspaceId,
      userId,
      { dg, status: updated.status, realityTier: updated.realityTier, approver },
      true,
    );

    return updated;
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  async listObjects(workspaceId: string, query: JudgmentListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const where: Prisma.JudgmentObjectWhereInput = {
      workspaceId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.realityTier ? { realityTier: query.realityTier } : {}),
      ...(query.domain ? { domain: query.domain } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.judgmentObject.count({ where }),
      this.prisma.judgmentObject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getObject(id: string, workspaceId: string) {
    return this.loadJudgment(id, workspaceId);
  }

  async pendingValidation(workspaceId: string, query: JudgmentListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const where: Prisma.JudgmentObjectWhereInput = {
      workspaceId,
      status: 'preliminary',
      validationCount: { gte: SC05_MIN_CORRECT_OUTCOMES },
    };
    const [total, items] = await Promise.all([
      this.prisma.judgmentObject.count({ where }),
      this.prisma.judgmentObject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async pendingInstitutional(workspaceId: string, query: JudgmentListQueryDto) {
    const { pageSize, page, skip } = this.page(query);
    const rows = await this.prisma.judgmentObject.findMany({
      where: { workspaceId, status: 'validated' },
      orderBy: { createdAt: 'desc' },
    });
    const eligible = rows.filter((r) => new Set(r.validationBranches).size >= SC06_MIN_BRANCHES);
    const total = eligible.length;
    const items = eligible.slice(skip, skip + pageSize);
    return { total, page, pageSize, items };
  }

  async stats(workspaceId: string) {
    const [byStatus, byTier, total] = await Promise.all([
      this.prisma.judgmentObject.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.judgmentObject.groupBy({
        by: ['realityTier'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.judgmentObject.count({ where: { workspaceId } }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      byRealityTier: Object.fromEntries(byTier.map((t) => [t.realityTier, t._count._all])),
    };
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private page(query?: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Number(query?.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query?.page) || 1, 1);
    return { pageSize, page, skip: (page - 1) * pageSize };
  }

  private async loadJudgment(id: string, workspaceId: string) {
    const judgment = await this.prisma.judgmentObject.findFirst({
      where: { workspaceId, OR: [{ id }, { judgmentId: id }] },
    });
    if (!judgment) {
      throw new NotFoundException('Judgment object not found');
    }
    return judgment;
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
      resourceType: 'JudgmentObject',
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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';
import { MatchContextDto } from './dto/understanding.dto';
import { SC08_MIN_SOURCES, clamp01, runTransformGate } from './understanding.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

/** T2 — Context Matching (SC-08: 2+ corroborating sources). */
@Injectable()
export class ContextMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sech: SechRouterService,
    private readonly iurg: IurgService,
  ) {}

  async matchContext(
    workspaceId: string,
    userId: string,
    dto: MatchContextDto,
    ctx?: MutationAuditContext,
  ) {
    const pattern = await this.prisma.detectedPattern.findFirst({
      where: { workspaceId, OR: [{ id: dto.patternId }, { patternId: dto.patternId }] },
    });
    if (!pattern) {
      throw new NotFoundException('Detected pattern not found');
    }

    const sourceCount = new Set(pattern.perceptionIds).size;
    // SC-08: understanding synthesis requires 2+ corroborating sources.
    if (sourceCount < SC08_MIN_SOURCES) {
      throw new BadRequestException(
        `SC-08: context matching requires ${SC08_MIN_SOURCES}+ corroborating sources (found ${sourceCount}).`,
      );
    }

    const matchedContexts = dto.matchedContexts?.length
      ? dto.matchedContexts
      : await this.findPrecedents(workspaceId, pattern.domain, pattern.patternId);

    const enrichedConfidence = clamp01(pattern.confidence + 0.05 * matchedContexts.length);
    const interpretation =
      dto.interpretation?.trim() ||
      `Pattern (${pattern.patternType}) in ${pattern.domain} corroborated by ${sourceCount} sources and ${matchedContexts.length} precedents.`;

    const gate = await runTransformGate(this.sech, this.iurg, {
      workspaceId,
      userId,
      transform: 'T2',
      domain: pattern.domain,
      decisionContext: `Context-matched pattern ${pattern.patternId} (${matchedContexts.length} precedents)`,
      signals: dto.signals,
      ctx,
    });

    const context = await this.prisma.contextualizedPattern.create({
      data: {
        workspaceId,
        requesterId: userId,
        patternId: pattern.patternId,
        domain: pattern.domain,
        matchedContexts,
        sourceCount,
        interpretation,
        enrichedConfidence,
        status: gate.approved ? 'contextualized' : 'rejected',
        reason: gate.approved ? null : `SECH ${gate.reason}`,
        ficCheckId: gate.ficCheckId,
        sechRouteId: gate.sechRouteId,
        iurgNodeId: gate.iurgNodeId,
      },
    });

    // T2 edge: pattern --validated_by--> contextualized pattern.
    if (gate.approved) {
      await this.iurg.createLink(
        workspaceId,
        'VALIDATED_BY',
        { type: 'PATTERN', id: pattern.patternId, ref: pattern.patternId },
        { type: 'CONTEXT', id: context.contextId, ref: context.contextId },
        'T2_CONTEXT_MATCHING',
      );
    }

    await this.recordAudit(
      `UNDERSTANDING_T2_${context.status.toUpperCase()}`,
      context.id,
      ctx,
      workspaceId,
      userId,
      {
        patternId: pattern.patternId,
        sourceCount,
        precedents: matchedContexts.length,
        approved: gate.approved,
      },
      gate.approved,
    );

    return context;
  }

  private async findPrecedents(workspaceId: string, domain: string, selfPatternId: string) {
    const rows = await this.prisma.detectedPattern.findMany({
      where: { workspaceId, domain, status: 'detected', patternId: { not: selfPatternId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return rows.map((r) => r.patternId);
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
      resourceType: 'ContextualizedPattern',
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

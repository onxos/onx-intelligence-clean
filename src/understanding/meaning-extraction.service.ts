import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';
import { ExtractMeaningDto } from './dto/understanding.dto';
import { resolveRealityTier, runTransformGate } from './understanding.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

/** T3 — Meaning Extraction (HC-10: explicit interpretation into an Understanding). */
@Injectable()
export class MeaningExtractionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sech: SechRouterService,
    private readonly iurg: IurgService,
  ) {}

  async extractMeaning(
    workspaceId: string,
    userId: string,
    dto: ExtractMeaningDto,
    ctx?: MutationAuditContext,
  ) {
    const context = await this.prisma.contextualizedPattern.findFirst({
      where: { workspaceId, OR: [{ id: dto.contextId }, { contextId: dto.contextId }] },
    });
    if (!context) {
      throw new NotFoundException('Contextualized pattern not found');
    }

    // HC-10: meaning must be an explicit interpretation — always non-empty.
    const meaning =
      dto.meaning?.trim() ||
      `Understanding derived from ${context.patternId}: ${context.interpretation ?? 'institutional meaning'} (domain ${context.domain}).`;
    const confidence = context.enrichedConfidence;
    const realityTier = resolveRealityTier(confidence);
    const evidenceBasis = dto.evidenceBasis?.length
      ? dto.evidenceBasis
      : [`pattern:${context.patternId}`, `context:${context.contextId}`];
    const relatedIntents = dto.relatedIntents ?? [];

    const gate = await runTransformGate(this.sech, this.iurg, {
      workspaceId,
      userId,
      transform: 'T3',
      domain: context.domain,
      decisionContext: `Extracted understanding (${realityTier}) from context ${context.contextId}`,
      signals: dto.signals,
      ctx,
    });

    const understanding = await this.prisma.understandingObject.create({
      data: {
        workspaceId,
        requesterId: userId,
        contextId: context.contextId,
        domain: context.domain,
        meaning,
        evidenceBasis,
        confidence,
        realityTier,
        relatedIntents,
        status: gate.approved ? 'preliminary' : 'rejected',
        reason: gate.approved ? null : `SECH ${gate.reason}`,
        ficCheckId: gate.ficCheckId,
        sechRouteId: gate.sechRouteId,
        iurgNodeId: gate.iurgNodeId,
      },
    });

    // T3 edge: contextualized pattern --realized_as--> understanding object.
    if (gate.approved) {
      await this.iurg.createLink(
        workspaceId,
        'REALIZED_AS',
        { type: 'CONTEXT', id: context.contextId, ref: context.contextId },
        {
          type: 'UNDERSTANDING',
          id: understanding.understandingId,
          ref: understanding.understandingId,
        },
        'T3_MEANING_EXTRACTION',
      );
    }

    await this.recordAudit(
      `UNDERSTANDING_T3_${understanding.status.toUpperCase()}`,
      understanding.id,
      ctx,
      workspaceId,
      userId,
      { contextId: context.contextId, realityTier, confidence, approved: gate.approved },
      gate.approved,
    );

    return understanding;
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
      resourceType: 'UnderstandingObject',
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

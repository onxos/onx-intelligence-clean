import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';
import { DetectPatternsDto } from './dto/understanding.dto';
import { SC05_MIN_OCCURRENCES, clamp01, runTransformGate } from './understanding.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const MAX_EDGE_SOURCES = 25;

/** T1 — Pattern Detection (SC-05: 3+ occurrences). */
@Injectable()
export class PatternDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sech: SechRouterService,
    private readonly iurg: IurgService,
  ) {}

  async detectPatterns(
    workspaceId: string,
    userId: string,
    dto: DetectPatternsDto,
    ctx?: MutationAuditContext,
  ) {
    const records = await this.prisma.usfipPerceptionRecord.findMany({
      where: { workspaceId, recordId: { in: dto.perceptionIds } },
    });

    // SC-05: no single-event pattern recognition — require 3+ occurrences.
    if (records.length < SC05_MIN_OCCURRENCES) {
      throw new BadRequestException(
        `SC-05: pattern detection requires ${SC05_MIN_OCCURRENCES}+ occurrences (found ${records.length}).`,
      );
    }

    const domain = dto.domain?.trim() || this.dominantDomain(records);
    const patternType = dto.patternType?.trim() || 'behavioral';
    const occurrenceCount = records.length;
    const times = records.map((r) => r.createdAt.getTime());
    const firstSeen = new Date(Math.min(...times));
    const lastSeen = new Date(Math.max(...times));
    const avgScore = records.reduce((s, r) => s + (r.evidenceScore ?? 0), 0) / records.length;
    // Confidence grows with corroborating occurrences, bounded by evidence quality.
    const confidence = clamp01(avgScore * Math.min(1, occurrenceCount / SC05_MIN_OCCURRENCES));

    const gate = await runTransformGate(this.sech, this.iurg, {
      workspaceId,
      userId,
      transform: 'T1',
      domain,
      decisionContext: `Detected ${patternType} pattern across ${occurrenceCount} perceptions in ${domain}`,
      signals: dto.signals,
      ctx,
    });

    const pattern = await this.prisma.detectedPattern.create({
      data: {
        workspaceId,
        requesterId: userId,
        perceptionIds: dto.perceptionIds,
        domain,
        patternType,
        occurrenceCount,
        firstSeen,
        lastSeen,
        confidence,
        status: gate.approved ? 'detected' : 'rejected',
        reason: gate.approved ? null : `SECH ${gate.reason}`,
        ficCheckId: gate.ficCheckId,
        sechRouteId: gate.sechRouteId,
        iurgNodeId: gate.iurgNodeId,
      },
    });

    // T1 edge: each source perception --realized_as--> the detected pattern.
    if (gate.approved) {
      for (const recordId of dto.perceptionIds.slice(0, MAX_EDGE_SOURCES)) {
        await this.iurg.createLink(
          workspaceId,
          'REALIZED_AS',
          { type: 'PERCEPTION', id: recordId, ref: recordId },
          { type: 'PATTERN', id: pattern.patternId, ref: pattern.patternId },
          'T1_PATTERN_DETECTION',
        );
      }
    }

    await this.recordAudit(
      `UNDERSTANDING_T1_${pattern.status.toUpperCase()}`,
      pattern.id,
      ctx,
      workspaceId,
      userId,
      { domain, patternType, occurrenceCount, approved: gate.approved },
      gate.approved,
    );

    return pattern;
  }

  private dominantDomain(records: Array<{ classifiedDomain: string }>): string {
    const counts = new Map<string, number>();
    for (const r of records) {
      counts.set(r.classifiedDomain, (counts.get(r.classifiedDomain) ?? 0) + 1);
    }
    let best = 'operational';
    let bestCount = -1;
    for (const [domain, count] of counts) {
      if (count > bestCount) {
        best = domain;
        bestCount = count;
      }
    }
    return best;
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
      resourceType: 'DetectedPattern',
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

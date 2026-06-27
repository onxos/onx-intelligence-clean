import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

type MutationAuditContext = {
  actorId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const OWNED_OBJECT_CLASSES = ['INSTITUTIONAL', 'CIVILIZATION'];
const REUSABLE_OBJECT_TYPES = ['PATTERN', 'JUDGMENT', 'UNDERSTANDING', 'WISDOM'];

export const ISMF6_METRICS = [
  { key: 'ksr', label: 'Knowledge Sovereignty Ratio', target: 0.7 },
  { key: 'pdr', label: 'Public Dependency Ratio', target: 0.3 },
  { key: 'krr', label: 'Knowledge Reuse Ratio', target: 0.5 },
  { key: 'kor', label: 'Knowledge Ownership Ratio', target: 0.6 },
  { key: 'scg', label: 'Sovereignty Confidence Gradient', target: 0.7 },
  { key: 'sai', label: 'Sovereignty Alignment Index', target: 0.75 },
] as const;

type SovereigntySnapshot = {
  objectType: string;
  ownershipClass?: string;
  confidenceScore?: number;
  trustScore?: number;
  qualityIndex?: number;
  ficValidated?: boolean;
};

type SovereigntyMetricValue = {
  value: number;
  target: number;
  status: 'BELOW_TARGET' | 'APPROACHING' | 'ON_TARGET';
};

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 10000) / 10000));
}

function statusForHigherBetter(value: number, target: number): SovereigntyMetricValue['status'] {
  if (value >= target) {
    return 'ON_TARGET';
  }

  return value >= target * 0.75 ? 'APPROACHING' : 'BELOW_TARGET';
}

function statusForLowerBetter(value: number, target: number): SovereigntyMetricValue['status'] {
  if (value <= target) {
    return 'ON_TARGET';
  }

  return value <= target * 1.5 ? 'APPROACHING' : 'BELOW_TARGET';
}

function averageScore(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateSovereigntyMetrics(objects: SovereigntySnapshot[]) {
  const total = objects.length;
  const internal = objects.filter((object) => object.objectType !== 'EXTERNAL_INTELLIGENCE').length;
  const external = total - internal;
  const reusable = objects.filter((object) =>
    REUSABLE_OBJECT_TYPES.includes(object.objectType),
  ).length;
  const owned = objects.filter((object) =>
    OWNED_OBJECT_CLASSES.includes(object.ownershipClass || ''),
  ).length;

  const confidenceGradient = averageScore(
    objects.map((object) =>
      averageScore([
        Number(object.confidenceScore ?? 0),
        Number(object.trustScore ?? 0),
        Number(object.qualityIndex ?? 0),
        object.ficValidated ? 1 : 0,
      ]),
    ),
  );

  const ksr = total > 0 ? clampRatio(internal / total) : 0;
  const pdr = total > 0 ? clampRatio(external / total) : 0;
  const krr = total > 0 ? clampRatio(reusable / total) : 0;
  const kor = total > 0 ? clampRatio(owned / total) : 0;
  const scg = total > 0 ? clampRatio(confidenceGradient) : 0;
  const sai = clampRatio((ksr + krr + kor + scg + (1 - pdr)) / 5);

  return {
    ksr: {
      value: ksr,
      target: 0.7,
      status: statusForHigherBetter(ksr, 0.7),
    },
    pdr: {
      value: pdr,
      target: 0.3,
      status: statusForLowerBetter(pdr, 0.3),
    },
    krr: {
      value: krr,
      target: 0.5,
      status: statusForHigherBetter(krr, 0.5),
    },
    kor: {
      value: kor,
      target: 0.6,
      status: statusForHigherBetter(kor, 0.6),
    },
    scg: {
      value: scg,
      target: 0.7,
      status: statusForHigherBetter(scg, 0.7),
    },
    sai: {
      value: sai,
      target: 0.75,
      status: statusForHigherBetter(sai, 0.75),
    },
  } satisfies Record<string, SovereigntyMetricValue>;
}

@Injectable()
export class SovereigntyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async evaluate(intent: string, workspaceId: string, auditContext: MutationAuditContext) {
    try {
      const objects = await this.prisma.intelligenceObject.findMany({
        where: { workspaceId },
        select: {
          objectType: true,
          ownershipClass: true,
          confidenceScore: true,
          trustScore: true,
          qualityIndex: true,
          ficValidated: true,
        },
      });

      const metrics = calculateSovereigntyMetrics(objects);

      const response = {
        timestamp: new Date().toISOString(),
        metrics,
        metricCount: ISMF6_METRICS.length,
        metricNames: ISMF6_METRICS.map((metric) => metric.key),
        questions: {
          doWeKnowThis: {
            answer: metrics.ksr.value > 0.5,
            confidence: metrics.ksr.value,
            reason: `KSR ${(metrics.ksr.value * 100).toFixed(1)}%`,
          },
          doWeOwnKnowledge: {
            answer: metrics.kor.value > 0.6,
            confidence: metrics.kor.value,
            reason: `KOR ${(metrics.kor.value * 100).toFixed(1)}%`,
          },
          reusableJudgment: {
            answer: metrics.krr.value > 0.3,
            confidence: metrics.krr.value,
            reason: `KRR ${(metrics.krr.value * 100).toFixed(1)}%`,
          },
          externalRequired: {
            answer: metrics.pdr.value > 0.5 ? 'EVALUATE' : 'NO',
            confidence: metrics.pdr.value,
            reason: `PDR ${(metrics.pdr.value * 100).toFixed(1)}%`,
          },
        },
        recommendation:
          metrics.pdr.value > 0.5
            ? 'External intelligence may be required. Evaluate sources via ISES.'
            : 'Internal knowledge is sufficient. Use owned intelligence.',
        internalKnowledgeScore: Math.round(metrics.ksr.value * 100),
        externalNecessityScore: Math.round(metrics.pdr.value * 100),
        reuseOpportunityScore: Math.round(metrics.krr.value * 100),
        ownershipCoverageScore: Math.round(metrics.kor.value * 100),
        confidenceGradientScore: Math.round(metrics.scg.value * 100),
        sovereigntyAlignmentScore: Math.round(metrics.sai.value * 100),
      };

      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'SOVEREIGNTY_EVALUATED',
        resourceType: 'Sovereignty',
        resourceId: workspaceId,
        workspaceId,
        before: null,
        after: {
          metricCount: response.metricCount,
          sovereigntyAlignmentScore: response.sovereigntyAlignmentScore,
        },
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return response;
    } catch (error: any) {
      await this.audit.log({
        actorId: auditContext.actorId,
        action: 'SOVEREIGNTY_EVALUATED',
        resourceType: 'Sovereignty',
        resourceId: workspaceId,
        workspaceId,
        before: null,
        after: null,
        requestId: auditContext.requestId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error), intent },
      });
      throw error;
    }
  }

  async report(workspaceId: string) {
    const objects = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId },
      select: {
        objectType: true,
        ownershipClass: true,
        confidenceScore: true,
        trustScore: true,
        qualityIndex: true,
        ficValidated: true,
      },
    });

    const metrics = calculateSovereigntyMetrics(objects);

    return {
      ksr: metrics.ksr,
      pdr: metrics.pdr,
      krr: metrics.krr,
      kor: metrics.kor,
      scg: metrics.scg,
      sai: metrics.sai,
      metrics,
      metricCount: ISMF6_METRICS.length,
      metricNames: ISMF6_METRICS.map((metric) => metric.key),
      timestamp: new Date().toISOString(),
      overallScore: Math.round(metrics.sai.value * 100),
    };
  }
}

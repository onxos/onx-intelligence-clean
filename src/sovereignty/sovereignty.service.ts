import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class SovereigntyService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(intent: string, workspaceId: string) {
    const objects = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId },
      select: { objectType: true },
    });

    const total = objects.length;
    const internal = objects.filter((o) => o.objectType !== 'EXTERNAL_INTELLIGENCE').length;
    const external = total - internal;
    const reusable = objects.filter((o) =>
      ['PATTERN', 'JUDGMENT', 'UNDERSTANDING'].includes(o.objectType),
    ).length;

    const ksr = total > 0 ? internal / total : 0;
    const pdr = total > 0 ? external / total : 0;
    const krr = total > 0 ? reusable / total : 0;

    return {
      timestamp: new Date().toISOString(),
      questions: {
        doWeKnowThis: { answer: ksr > 0.5, confidence: ksr, reason: `${internal} internal objects` },
        doWeOwnKnowledge: { answer: ksr > 0.7, confidence: ksr, reason: `KSR ${(ksr * 100).toFixed(1)}%` },
        reusableJudgment: { answer: krr > 0.3, confidence: krr, reason: `${reusable} reusable objects` },
        externalRequired: { answer: pdr > 0.5 ? 'EVALUATE' : 'NO', confidence: pdr, reason: `PDR ${(pdr * 100).toFixed(1)}%` },
      },
      recommendation: pdr > 0.5
        ? 'External intelligence may be required. Evaluate sources via ISES.'
        : 'Internal knowledge is sufficient. Use owned intelligence.',
      internalKnowledgeScore: Math.round(ksr * 100),
      externalNecessityScore: Math.round(pdr * 100),
      reuseOpportunityScore: Math.round(krr * 100),
    };
  }

  async report(workspaceId: string) {
    const objects = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId },
      select: { objectType: true },
    });

    const total = objects.length;
    const internal = objects.filter((o) => o.objectType !== 'EXTERNAL_INTELLIGENCE').length;
    const external = total - internal;

    return {
      ksr: { value: total > 0 ? internal / total : 0, target: 0.7, status: 'APPROACHING' },
      pdr: { value: total > 0 ? external / total : 0, target: 0.3, status: 'ON_TARGET' },
      krr: { value: total > 0 ? objects.filter((o) => ['PATTERN', 'JUDGMENT', 'UNDERSTANDING'].includes(o.objectType)).length / total : 0, target: 0.5, status: 'BELOW_TARGET' },
      timestamp: new Date().toISOString(),
      overallScore: total > 0 ? Math.round((internal / total) * 100) : 0,
    };
  }
}

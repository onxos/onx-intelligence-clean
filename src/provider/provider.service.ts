import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(workspaceId: string) {
    return this.prisma.providerProfile.findMany({
      where: { workspaceId },
      orderBy: { priority: 'asc' },
    });
  }

  async evaluate(data: { providerId: string; intent: string; context?: string }) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { providerId: data.providerId },
    });
    if (!provider) return null;

    const dimensions = {
      domainFitness: { score: provider.domainFitness, weight: 0.1 },
      riskFitness: { score: provider.riskFitness, weight: 0.08 },
      historicalPerformance: { score: provider.historicalPerformance, weight: 0.12 },
      evidenceQuality: { score: provider.evidenceQuality, weight: 0.08 },
      judgmentQuality: { score: provider.judgmentQuality, weight: 0.08 },
      hallucinationResistance: { score: provider.hallucinationResistance, weight: 0.08 },
      governanceCompliance: { score: provider.governanceCompliance, weight: 0.08 },
      costEfficiency: { score: provider.costEfficiency, weight: 0.07 },
      latency: { score: provider.latency, weight: 0.07 },
      reliability: { score: provider.reliability, weight: 0.08 },
      outcomeSuccess: { score: provider.outcomeSuccess, weight: 0.07 },
      ownershipCompatibility: { score: provider.ownershipCompatibility, weight: 0.09 },
    };

    const iseScore = Object.values(dimensions).reduce((sum, d) => sum + d.score * d.weight, 0);

    await this.prisma.providerEvaluation.create({
      data: {
        providerId: provider.id,
        iseScore,
        dimensions: dimensions as any,
        intent: data.intent,
        context: data.context,
      },
    });

    return {
      providerId: data.providerId,
      iseScore: Math.round(iseScore * 100) / 100,
      dimensions,
      rankTier:
        iseScore >= 85
          ? 'TIER_1_PREFERRED'
          : iseScore >= 70
            ? 'TIER_2_STANDARD'
            : 'TIER_3_FALLBACK',
    };
  }
}

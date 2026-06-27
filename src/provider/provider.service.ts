import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export const ISES_DIMENSIONS = [
  { key: 'domainFitness', weight: 0.1 },
  { key: 'riskFitness', weight: 0.08 },
  { key: 'historicalPerformance', weight: 0.12 },
  { key: 'evidenceQuality', weight: 0.08 },
  { key: 'judgmentQuality', weight: 0.08 },
  { key: 'hallucinationResistance', weight: 0.08 },
  { key: 'governanceCompliance', weight: 0.08 },
  { key: 'costEfficiency', weight: 0.07 },
  { key: 'latency', weight: 0.07 },
  { key: 'reliability', weight: 0.08 },
  { key: 'outcomeSuccess', weight: 0.07 },
  { key: 'ownershipCompatibility', weight: 0.09 },
] as const;

type IseDimensionKey = (typeof ISES_DIMENSIONS)[number]['key'];

type IseDimensionScore = {
  score: number;
  weight: number;
  contribution: number;
};

function clampScore(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(100, numeric));
}

function buildDimensions(provider: Record<string, unknown>) {
  return ISES_DIMENSIONS.reduce(
    (accumulator, dimension) => {
      const score = clampScore(provider[dimension.key]);
      accumulator[dimension.key] = {
        score,
        weight: dimension.weight,
        contribution: score * dimension.weight,
      };
      return accumulator;
    },
    {} as Record<IseDimensionKey, IseDimensionScore>,
  );
}

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    workspaceId: string,
    query?: {
      search?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const pageSize = Number(query?.pageSize || 50);
    const page = Number(query?.page || 1);
    const skip = (page - 1) * pageSize;
    const sortBy = query?.sortBy || 'priority';
    const sortOrder = query?.sortOrder || 'asc';

    return this.prisma.providerProfile.findMany({
      where: {
        workspaceId,
        ...(query?.status && { status: query.status as any }),
        ...(query?.search && {
          OR: [
            { providerName: { contains: query.search, mode: 'insensitive' } },
            { providerId: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async create(workspaceId: string, data: any) {
    return this.prisma.providerProfile.create({
      data: {
        providerId: data.providerId,
        providerName: data.providerName,
        status: (data.status as any) || 'ACTIVE',
        priority: data.priority ?? 1,
        models: Array.isArray(data.models) ? data.models : [],
        workspaceId,
        domainFitness: data.domainFitness ?? 0,
        riskFitness: data.riskFitness ?? 0,
        historicalPerformance: data.historicalPerformance ?? 0,
        evidenceQuality: data.evidenceQuality ?? 0,
        judgmentQuality: data.judgmentQuality ?? 0,
        hallucinationResistance: data.hallucinationResistance ?? 0,
        governanceCompliance: data.governanceCompliance ?? 0,
        costEfficiency: data.costEfficiency ?? 0,
        latency: data.latency ?? 0,
        reliability: data.reliability ?? 0,
        outcomeSuccess: data.outcomeSuccess ?? 0,
        ownershipCompatibility: data.ownershipCompatibility ?? 0,
        iseScore: data.iseScore ?? 0,
        totalCapital: data.totalCapital ?? 0,
        costPer1kTokens: data.costPer1kTokens ?? 0,
        latencyMs: data.latencyMs ?? 0,
        successRate: data.successRate ?? 0,
      },
    });
  }

  async update(workspaceId: string, id: string, data: any) {
    const existing = await this.prisma.providerProfile.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Provider profile not found');
    }

    return this.prisma.providerProfile.update({
      where: { id: existing.id },
      data: {
        ...(data.providerName !== undefined && { providerName: data.providerName }),
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.models !== undefined && { models: Array.isArray(data.models) ? data.models : [] }),
        ...(data.domainFitness !== undefined && { domainFitness: data.domainFitness }),
        ...(data.riskFitness !== undefined && { riskFitness: data.riskFitness }),
        ...(data.historicalPerformance !== undefined && {
          historicalPerformance: data.historicalPerformance,
        }),
        ...(data.evidenceQuality !== undefined && { evidenceQuality: data.evidenceQuality }),
        ...(data.judgmentQuality !== undefined && { judgmentQuality: data.judgmentQuality }),
        ...(data.hallucinationResistance !== undefined && {
          hallucinationResistance: data.hallucinationResistance,
        }),
        ...(data.governanceCompliance !== undefined && {
          governanceCompliance: data.governanceCompliance,
        }),
        ...(data.costEfficiency !== undefined && { costEfficiency: data.costEfficiency }),
        ...(data.latency !== undefined && { latency: data.latency }),
        ...(data.reliability !== undefined && { reliability: data.reliability }),
        ...(data.outcomeSuccess !== undefined && { outcomeSuccess: data.outcomeSuccess }),
        ...(data.ownershipCompatibility !== undefined && {
          ownershipCompatibility: data.ownershipCompatibility,
        }),
        ...(data.iseScore !== undefined && { iseScore: data.iseScore }),
        ...(data.totalCapital !== undefined && { totalCapital: data.totalCapital }),
        ...(data.costPer1kTokens !== undefined && { costPer1kTokens: data.costPer1kTokens }),
        ...(data.latencyMs !== undefined && { latencyMs: data.latencyMs }),
        ...(data.successRate !== undefined && { successRate: data.successRate }),
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const existing = await this.prisma.providerProfile.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Provider profile not found');
    }
    await this.prisma.providerProfile.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }

  async evaluate(data: { providerId: string; intent: string; context?: string }) {
    const provider = await this.prisma.providerProfile.findUnique({
      where: { providerId: data.providerId },
    });
    if (!provider) return null;

    const dimensions = buildDimensions(provider as Record<string, unknown>);

    const iseScore = Object.values(dimensions).reduce((sum, dimension) => sum + dimension.contribution, 0);

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
      dimensionCount: ISES_DIMENSIONS.length,
      rankTier:
        iseScore >= 85
          ? 'TIER_1_PREFERRED'
          : iseScore >= 70
            ? 'TIER_2_STANDARD'
            : 'TIER_3_FALLBACK',
    };
  }
}

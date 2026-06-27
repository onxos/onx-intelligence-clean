import { ProviderService, ISES_DIMENSIONS } from './provider.service';

describe('ProviderService', () => {
  it('clamps ISES-12 scores and returns all 12 dimensions', async () => {
    const prisma = {
      providerProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'profile-1',
          providerId: 'prov-123',
          domainFitness: 150,
          riskFitness: 150,
          historicalPerformance: 150,
          evidenceQuality: 150,
          judgmentQuality: 150,
          hallucinationResistance: 150,
          governanceCompliance: 150,
          costEfficiency: 150,
          latency: 150,
          reliability: 150,
          outcomeSuccess: 150,
          ownershipCompatibility: 150,
        }),
      },
      providerEvaluation: {
        create: jest.fn().mockResolvedValue({ id: 'evaluation-1' }),
      },
    } as any;

    const service = new ProviderService(prisma);
    const result = await service.evaluate({ providerId: 'prov-123', intent: 'test' });

    expect(result?.dimensions).toBeDefined();
    expect(Object.keys(result?.dimensions || {})).toHaveLength(ISES_DIMENSIONS.length);
    expect(result?.dimensionCount).toBe(ISES_DIMENSIONS.length);
    expect(result?.iseScore).toBe(100);
    expect(result?.dimensions.domainFitness.score).toBe(100);
    expect(prisma.providerEvaluation.create).toHaveBeenCalledTimes(1);
  });
});

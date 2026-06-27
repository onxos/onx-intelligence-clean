import { calculateSovereigntyMetrics, ISMF6_METRICS, SovereigntyService } from './sovereignty.service';

describe('SovereigntyService', () => {
  it('derives six sovereignty metrics from workspace intelligence objects', async () => {
    const prisma = {
      intelligenceObject: {
        findMany: jest.fn().mockResolvedValue([
          {
            objectType: 'PATTERN',
            ownershipClass: 'INSTITUTIONAL',
            confidenceScore: 0.9,
            trustScore: 0.8,
            qualityIndex: 0.7,
            ficValidated: true,
          },
          {
            objectType: 'JUDGMENT',
            ownershipClass: 'INSTITUTIONAL',
            confidenceScore: 0.6,
            trustScore: 0.5,
            qualityIndex: 0.4,
            ficValidated: false,
          },
          {
            objectType: 'EXTERNAL_INTELLIGENCE',
            ownershipClass: 'PERSONAL',
            confidenceScore: 0.2,
            trustScore: 0.3,
            qualityIndex: 0.4,
            ficValidated: false,
          },
          {
            objectType: 'UNDERSTANDING',
            ownershipClass: 'CIVILIZATION',
            confidenceScore: 0.8,
            trustScore: 0.9,
            qualityIndex: 0.95,
            ficValidated: true,
          },
        ]),
      },
    } as any;

    const service = new SovereigntyService(prisma);
    const evaluation = await service.evaluate('assess intent', 'workspace-1');
    const report = await service.report('workspace-1');

    expect(evaluation.metricCount).toBe(ISMF6_METRICS.length);
    expect(evaluation.metricNames).toEqual(ISMF6_METRICS.map((metric) => metric.key));
    expect(evaluation.metrics.ksr.value).toBeCloseTo(0.75, 4);
    expect(evaluation.metrics.pdr.value).toBeCloseTo(0.25, 4);
    expect(evaluation.metrics.krr.value).toBeCloseTo(0.75, 4);
    expect(evaluation.metrics.kor.value).toBeCloseTo(0.75, 4);
    expect(evaluation.metrics.scg.value).toBeGreaterThan(0.5);
    expect(evaluation.metrics.sai.value).toBeGreaterThan(0.5);

    expect(report.metricCount).toBe(ISMF6_METRICS.length);
    expect(report.kor.value).toBeCloseTo(0.75, 4);
    expect(report.scg.value).toBeCloseTo(report.metrics.scg.value, 4);

    expect(calculateSovereigntyMetrics([])).toEqual({
      ksr: { value: 0, target: 0.7, status: 'BELOW_TARGET' },
      pdr: { value: 0, target: 0.3, status: 'ON_TARGET' },
      krr: { value: 0, target: 0.5, status: 'BELOW_TARGET' },
      kor: { value: 0, target: 0.6, status: 'BELOW_TARGET' },
      scg: { value: 0, target: 0.7, status: 'BELOW_TARGET' },
      sai: { value: 0.2, target: 0.75, status: 'BELOW_TARGET' },
    });
  });
});

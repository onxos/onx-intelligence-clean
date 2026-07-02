import { AssessmentService } from './assessment.service';

describe('AssessmentService (D15 — Self-Assessment)', () => {
  const makeService = (opts?: {
    totalChecks?: number;
    approvedChecks?: number;
    evaluations?: Array<{ constraintId: string; outcome: string }>;
  }) => {
    const totalChecks = opts?.totalChecks ?? 0;
    const approvedChecks = opts?.approvedChecks ?? 0;
    const evaluations = opts?.evaluations ?? [];
    const prisma = {
      ficEnforcementCheck: {
        count: jest.fn(async ({ where }: any) =>
          where?.decision === 'APPROVED' ? approvedChecks : totalChecks,
        ),
      },
      ficConstraintEvaluation: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where?.outcome?.in) {
            return evaluations.filter((e) => where.outcome.in.includes(e.outcome));
          }
          return evaluations;
        }),
      },
      selfAssessment: {
        create: jest.fn(async ({ data }: any) => ({ id: 'sa-1', assessmentId: 'SA-1', ...data })),
        findFirst: jest.fn(async () => ({ id: 'sa-1', assessmentId: 'SA-1' })),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new AssessmentService(prisma, audit);
    return { service, prisma, audit };
  };

  beforeEach(() => jest.clearAllMocks());

  it('reports aligned verdict when no checks exist (perfect alignment default)', async () => {
    const { service, audit } = makeService();
    const out = await service.run('ws-1', 'user-1', {});
    expect(out.verdict).toBe('aligned');
    expect(out.intentAlignment).toBe(1);
    expect(out.constraintScore).toBe(1);
    expect(out.gapCount).toBe(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASSESSMENT_ALIGNED' }),
    );
  });

  it('computes intent alignment as approved / total checks', async () => {
    const { service } = makeService({ totalChecks: 10, approvedChecks: 8 });
    const out = await service.run('ws-1', 'user-1', { scope: 'full' });
    expect(out.intentAlignment).toBeCloseTo(0.8);
  });

  it('derives gaps from VIOLATED / BLOCKED evaluations with severity', async () => {
    const { service } = makeService({
      totalChecks: 5,
      approvedChecks: 1,
      evaluations: [
        { constraintId: 'HC-01', outcome: 'VIOLATED' },
        { constraintId: 'HC-01', outcome: 'VIOLATED' },
        { constraintId: 'HC-01', outcome: 'BLOCKED' },
        { constraintId: 'HC-02', outcome: 'VIOLATED' },
        { constraintId: 'HC-03', outcome: 'PASSED' },
      ],
    });
    const out = await service.run('ws-1', 'user-1', {});
    expect(out.gapCount).toBe(2);
    const gaps = out.gaps as any[];
    const hc01 = gaps.find((g) => g.constraintId === 'HC-01');
    expect(hc01.severity).toBe('high');
    expect(hc01.count).toBe(3);
    expect(out.verdict).toBe('minor_gaps');
  });

  it('listGaps returns only VIOLATED/BLOCKED constraints', async () => {
    const { service } = makeService({
      evaluations: [
        { constraintId: 'HC-05', outcome: 'VIOLATED' },
        { constraintId: 'HC-06', outcome: 'PASSED' },
      ],
    });
    const out = await service.listGaps('ws-1');
    expect(out.total).toBe(1);
    expect(out.gaps[0].constraintId).toBe('HC-05');
  });

  it('getById throws when the assessment is missing', async () => {
    const { service, prisma } = makeService();
    prisma.selfAssessment.findFirst.mockResolvedValueOnce(null);
    await expect(service.getById('nope', 'ws-1')).rejects.toThrow('Assessment not found');
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProofService } from './proof.service';
import { CERTIFICATION_GATES, FAILURE_INJECTION_TYPES } from './proof.constants';

describe('ProofService (D15)', () => {
  const makeService = () => {
    const model = () => ({
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _avg: { resilienceScore: 0 } }),
    });
    const prisma = {
      $transaction: jest.fn(),
      proofSession: model(),
      proofScenario: model(),
      proofExecution: model(),
      proofResult: model(),
      proofEvidence: model(),
      proofFinding: model(),
      proofCertification: model(),
      proofHistory: model(),
      stressCampaign: model(),
      stressScenario: model(),
      stressExecution: model(),
      failureInjection: model(),
      stressResult: model(),
      stressEvidence: model(),
      recoveryEvidence: model(),
      stressHistory: model(),
      contradiction: model(),
      // signal sources
      intelligenceObject: model(),
      memoryEntry: model(),
      runtimeSession: model(),
      exchangeTransaction: model(),
      capitalAllocation: model(),
      measurementRecord: model(),
      exchangePolicy: model(),
      auditLog: model(),
      evidenceRecord: model(),
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new ProofService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'ps-1',
    proofSessionId: 'ps-1',
    name: 'Constitutional verification',
    description: null,
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    state: 'OPEN',
    certificationOutcome: null,
    certificationScore: 0,
    scenarioSeq: 0,
    eventSeq: 1,
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  });

  const campaign = (overrides: Record<string, unknown> = {}) => ({
    id: 'sc-1',
    campaignId: 'sc-1',
    name: 'Resilience campaign',
    description: null,
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    state: 'OPEN',
    group: null,
    scenarioSeq: 0,
    eventSeq: 1,
    resilienceScore: 0,
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  });

  // -- Proof sessions ----------------------------------------------------

  it('creates a proof session with audit + evidence', async () => {
    const { service, prisma, audit, evidence } = makeService();
    const created = await service.createSession('ws-1', 'user-1', {
      name: 'Verify system',
    } as any);
    expect(created.name).toBe('Verify system');
    expect(prisma.proofSession.create).toHaveBeenCalled();
    expect(prisma.proofHistory.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROOF_SESSION_CREATED', success: true }),
    );
    expect(evidence.create).toHaveBeenCalled();
  });

  it('rejects a blank proof session name and audits the failure', async () => {
    const { service, audit } = makeService();
    await expect(service.createSession('ws-1', 'user-1', { name: '  ' } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROOF_SESSION_CREATED', success: false }),
    );
  });

  it('throws NotFound for a session in another workspace', async () => {
    const { service, prisma } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(null);
    await expect(service.getSession('ps-x', 'ws-1')).rejects.toThrow(NotFoundException);
  });

  // -- Run proof ---------------------------------------------------------

  it('runs a proof and persists execution, results and history (PASS path)', async () => {
    const { service, prisma, audit } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(session());
    const result = await service.runProof('ps-1', 'ws-1', 'user-1', {} as any);
    expect(result.summary.passed).toBe(true);
    expect(result.results).toHaveLength(CERTIFICATION_GATES.length);
    expect(prisma.proofExecution.create).toHaveBeenCalled();
    expect(prisma.proofResult.create).toHaveBeenCalledTimes(CERTIFICATION_GATES.length);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROOF_RUN', success: true }),
    );
  });

  it('runs a single gate when a gate is specified', async () => {
    const { service, prisma } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(session());
    const result = await service.runProof('ps-1', 'ws-1', 'user-1', {
      gate: 'EXCHANGE_INTEGRITY',
    } as any);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].gate).toBe('EXCHANGE_INTEGRITY');
  });

  it('records findings when a gate fails via injected violation signals', async () => {
    const { service, prisma } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(session());
    const result = await service.runProof('ps-1', 'ws-1', 'user-1', {
      signals: { capitalViolations: 6 },
    } as any);
    expect(result.summary.passed).toBe(false);
    expect(prisma.proofFinding.create).toHaveBeenCalled();
  });

  // -- Certify -----------------------------------------------------------

  it('certifies a session and marks it CERTIFIED when clean', async () => {
    const { service, prisma, audit } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(session());
    const result = await service.certify('ps-1', 'ws-1', 'user-1', {} as any);
    expect(result.summary.passed).toBe(true);
    expect(prisma.proofCertification.create).toHaveBeenCalledTimes(CERTIFICATION_GATES.length);
    expect(prisma.proofSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'CERTIFIED' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROOF_CERTIFIED', success: true }),
    );
  });

  it('fails certification and marks the session FAILED under violations', async () => {
    const { service, prisma } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(session());
    const result = await service.certify('ps-1', 'ws-1', 'user-1', {
      signals: { governanceViolations: 6 },
    } as any);
    expect(result.summary.passed).toBe(false);
    expect(prisma.proofSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'FAILED' }) }),
    );
  });

  it('builds a certification report across all gates', async () => {
    const { service, prisma } = makeService();
    prisma.proofSession.findFirst.mockResolvedValue(session({ state: 'CERTIFIED' }));
    prisma.proofCertification.findMany.mockResolvedValue([
      { gate: 'KNOWLEDGE_INTEGRITY', outcome: 'PASS', score: 1, certificationId: 'c1' },
    ]);
    const report = await service.certificationReport('ps-1', 'ws-1');
    expect(report.gates).toHaveLength(CERTIFICATION_GATES.length);
    expect(report.gatesCertified).toBe(1);
  });

  // -- Contradictions ----------------------------------------------------

  it('detects and persists contradictions', async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.detectContradictions('ws-1', 'user-1', {
      candidates: [
        { type: 'KNOWLEDGE', leftValue: 1, rightValue: 1 },
        { type: 'INTENT', leftValue: 'x', rightValue: 'y' },
      ],
    } as any);
    expect(result.count).toBe(1);
    expect(result.evaluated).toBe(2);
    expect(prisma.contradiction.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTRADICTIONS_DETECTED', success: true }),
    );
  });

  it('rejects an empty contradiction candidate set', async () => {
    const { service } = makeService();
    await expect(
      service.detectContradictions('ws-1', 'user-1', { candidates: [] } as any),
    ).rejects.toThrow(BadRequestException);
  });

  // -- Stress ------------------------------------------------------------

  it('creates a stress campaign', async () => {
    const { service, prisma, audit } = makeService();
    const created = await service.createCampaign('ws-1', 'user-1', {
      name: 'Resilience run',
    } as any);
    expect(created.name).toBe('Resilience run');
    expect(prisma.stressCampaign.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STRESS_CAMPAIGN_CREATED', success: true }),
    );
  });

  it('runs the full injection battery with recovery evidence', async () => {
    const { service, prisma, audit } = makeService();
    prisma.stressCampaign.findFirst.mockResolvedValue(campaign());
    const result = await service.runStress('sc-1', 'ws-1', 'user-1', {} as any);
    expect(result.results).toHaveLength(FAILURE_INJECTION_TYPES.length);
    expect(result.resilienceScore).toBe(1);
    expect(prisma.failureInjection.create).toHaveBeenCalledTimes(FAILURE_INJECTION_TYPES.length);
    expect(prisma.recoveryEvidence.create).toHaveBeenCalledTimes(FAILURE_INJECTION_TYPES.length);
    expect(prisma.stressCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'COMPLETED' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STRESS_RUN', success: true }),
    );
  });

  it('injects a single controlled failure', async () => {
    const { service, prisma, audit } = makeService();
    prisma.stressCampaign.findFirst.mockResolvedValue(campaign());
    const result = await service.injectFailure('sc-1', 'ws-1', 'user-1', {
      injectionType: 'TRUST_FAILURE',
    } as any);
    expect(result.result.injectionType).toBe('TRUST_FAILURE');
    expect(prisma.failureInjection.create).toHaveBeenCalledTimes(1);
    expect(prisma.recoveryEvidence.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FAILURE_INJECTED', success: true }),
    );
  });

  it('degrades a campaign when an injection cannot recover', async () => {
    const { service, prisma } = makeService();
    prisma.stressCampaign.findFirst.mockResolvedValue(campaign());
    const result = await service.runStress('sc-1', 'ws-1', 'user-1', {
      injections: [{ injectionType: 'STATE_CORRUPTION', defenses: { canDetect: false } }],
    } as any);
    expect(result.outcome).toBe('CRITICAL');
    expect(prisma.stressCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'FAILED' }) }),
    );
  });

  it('throws NotFound for a campaign in another workspace', async () => {
    const { service, prisma } = makeService();
    prisma.stressCampaign.findFirst.mockResolvedValue(null);
    await expect(service.getCampaign('sc-x', 'ws-1')).rejects.toThrow(NotFoundException);
  });

  // -- Dashboards --------------------------------------------------------

  it('produces a proof dashboard', async () => {
    const { service } = makeService();
    const dash = await service.proofDashboard('ws-1');
    expect(dash.gates).toEqual(CERTIFICATION_GATES);
    expect(dash).toHaveProperty('sessions');
  });

  it('produces a stress dashboard', async () => {
    const { service } = makeService();
    const dash = await service.stressDashboard('ws-1');
    expect(dash.injectionTypes).toEqual(FAILURE_INJECTION_TYPES);
    expect(dash).toHaveProperty('averageResilience');
  });
});

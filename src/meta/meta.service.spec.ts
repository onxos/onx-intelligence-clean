import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MetaService } from './meta.service';

describe('MetaService (D14)', () => {
  const makeService = () => {
    const model = () => ({
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      count: jest.fn().mockResolvedValue(0),
    });
    const prisma = {
      $transaction: jest.fn(),
      metaOrchestrationSession: model(),
      metaExecutionPlan: model(),
      metaExecutionStep: model(),
      metaExecutionContext: model(),
      metaExecutionState: model(),
      metaExecutionHistory: model(),
      metaExecutionEvidence: model(),
      metaRoutingDecision: model(),
      metaArbitration: model(),
      metaMergeRequest: model(),
      metaMergeHistory: model(),
      metaOverrideEvent: model(),
      metaRoutingPolicy: model(),
      metaArbitrationPolicy: model(),
      metaMergePolicy: model(),
      metaExecutionPolicy: model(),
      // coordinated runtimes (read-only)
      intelligenceFeed: model(),
      learningState: model(),
      intelligenceCapital: model(),
      intelligenceObject: model(),
      measurementRecord: model(),
      runtimeSession: model(),
      exchangeTransaction: model(),
      founderIntent: model(),
      iUCEntity: model(),
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new MetaService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'ms-1',
    orchestrationId: 'ms-1',
    name: 'Coordinate runtimes',
    description: null,
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    state: 'OPEN',
    objective: 'Reconcile capital',
    targetDomain: 'CAPITAL',
    planSeq: 0,
    eventSeq: 0,
    overridden: false,
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  });

  // ---------------------------------------------------------------- Part A
  describe('createOrchestration', () => {
    it('creates a session with audit + evidence + history', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.metaOrchestrationSession.create.mockResolvedValue(session());
      const result = await service.createOrchestration('ws-1', 'user-1', { name: 'Coordinate' });
      expect(result.id).toBe('ms-1');
      expect(prisma.metaExecutionState.create).toHaveBeenCalled();
      expect(prisma.metaExecutionHistory.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'META_CREATE_ORCHESTRATION', success: true }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a blank name', async () => {
      const { service } = makeService();
      await expect(service.createOrchestration('ws-1', 'user-1', { name: '  ' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('startOrchestration', () => {
    it('builds a routed plan and marks the session executing', async () => {
      const { service, prisma } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session());
      prisma.metaExecutionPlan.create.mockResolvedValue({ id: 'plan-1' });
      prisma.metaExecutionState.create.mockResolvedValue({ id: 'state-1' });
      const result = await service.startOrchestration('ws-1', 'user-1', 'ms-1', {
        steps: [{ name: 'Load capital', intent: 'allocate capital' }],
      });
      expect(result.plan.id).toBe('plan-1');
      expect(prisma.metaExecutionStep.create).toHaveBeenCalled();
      expect(prisma.metaOrchestrationSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ state: 'EXECUTING' }) }),
      );
    });

    it('refuses to start an overridden session', async () => {
      const { service, prisma } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session({ overridden: true }));
      await expect(service.startOrchestration('ws-1', 'user-1', 'ms-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the session is missing', async () => {
      const { service, prisma } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(null);
      await expect(service.startOrchestration('ws-1', 'user-1', 'missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------- Part B
  describe('route', () => {
    it('persists a routing decision with a constitutional reference', async () => {
      const { service, prisma, audit } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session());
      prisma.metaRoutingDecision.create.mockImplementation(async ({ data }: any) => ({
        id: 'route-1',
        ...data,
      }));
      const result = await service.route('ws-1', 'user-1', 'ms-1', { intent: 'allocate capital' });
      expect(result.target).toBe('CAPITAL');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'META_ROUTE' }));
    });
  });

  // ---------------------------------------------------------------- Part C
  describe('arbitrate', () => {
    it('records winning and losing paths', async () => {
      const { service, prisma } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session());
      prisma.metaArbitration.create.mockImplementation(async ({ data }: any) => ({
        id: 'arb-1',
        ...data,
      }));
      const result = await service.arbitrate('ws-1', 'user-1', 'ms-1', {
        type: 'PRIORITY',
        paths: [
          { id: 'a', priority: 0.9 },
          { id: 'b', priority: 0.1 },
        ],
      });
      expect(result.winningPath).toBe('a');
      expect(prisma.metaExecutionEvidence.create).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- Part D
  describe('merge', () => {
    it('validates a good merge request', async () => {
      const { service, prisma } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session());
      prisma.metaMergeRequest.create.mockImplementation(async ({ data }: any) => ({
        id: 'merge-1',
        ...data,
      }));
      const result = await service.requestMerge('ws-1', 'user-1', 'ms-1', {
        sourcePaths: ['a', 'b'],
      });
      expect(result.validated).toBe(true);
      expect(result.status).toBe('VALIDATED');
    });

    it('commits a validated merge', async () => {
      const { service, prisma } = makeService();
      prisma.metaMergeRequest.findFirst.mockResolvedValue({
        id: 'merge-1',
        sessionId: 'ms-1',
        status: 'VALIDATED',
        validated: true,
        rolledBack: false,
      });
      prisma.metaMergeRequest.update.mockImplementation(async ({ data }: any) => ({
        id: 'merge-1',
        ...data,
      }));
      const result = await service.commitMerge('ws-1', 'user-1', 'merge-1');
      expect(result.status).toBe('MERGED');
    });

    it('refuses to commit an unvalidated merge', async () => {
      const { service, prisma } = makeService();
      prisma.metaMergeRequest.findFirst.mockResolvedValue({
        id: 'merge-1',
        sessionId: 'ms-1',
        status: 'REJECTED',
        validated: false,
        rolledBack: false,
      });
      await expect(service.commitMerge('ws-1', 'user-1', 'merge-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rolls back a merge immutably in history', async () => {
      const { service, prisma } = makeService();
      prisma.metaMergeRequest.findFirst.mockResolvedValue({
        id: 'merge-1',
        sessionId: 'ms-1',
        status: 'MERGED',
        validated: true,
        rolledBack: false,
        reason: null,
      });
      prisma.metaMergeRequest.update.mockImplementation(async ({ data }: any) => ({
        id: 'merge-1',
        ...data,
      }));
      const result = await service.rollbackMerge('ws-1', 'user-1', 'merge-1', { reason: 'bad' });
      expect(result.status).toBe('ROLLED_BACK');
      expect(prisma.metaMergeHistory.create).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- Part E
  describe('override', () => {
    it('creates an immutable override and locks the session', async () => {
      const { service, prisma, audit } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session());
      prisma.metaOverrideEvent.create.mockImplementation(async ({ data }: any) => ({
        id: 'ov-1',
        ...data,
      }));
      const result = await service.override('ws-1', 'user-1', 'ms-1', {
        overrideType: 'CONSTITUTIONAL',
        directive: 'Force path B',
      });
      expect(result.id).toBe('ov-1');
      expect(prisma.metaOrchestrationSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ overridden: true, state: 'OVERRIDDEN' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'META_OVERRIDE' }));
    });

    it('rejects a blank directive', async () => {
      const { service, prisma } = makeService();
      prisma.metaOrchestrationSession.findFirst.mockResolvedValue(session());
      await expect(
        service.override('ws-1', 'user-1', 'ms-1', {
          overrideType: 'MANUAL',
          directive: '  ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------- Part G
  describe('createPolicy', () => {
    it('creates a routing policy by default', async () => {
      const { service, prisma } = makeService();
      prisma.metaRoutingPolicy.create.mockResolvedValue({ id: 'pol-1' });
      const result = await service.createPolicy('ws-1', 'user-1', { name: 'Route policy' });
      expect(result.policyType).toBe('ROUTING');
      expect(prisma.metaRoutingPolicy.create).toHaveBeenCalled();
    });

    it('creates an arbitration policy', async () => {
      const { service, prisma } = makeService();
      prisma.metaArbitrationPolicy.create.mockResolvedValue({ id: 'pol-2' });
      const result = await service.createPolicy('ws-1', 'user-1', {
        name: 'Arb policy',
        policyType: 'ARBITRATION',
        arbitrationType: 'PRIORITY',
      });
      expect(result.policyType).toBe('ARBITRATION');
    });
  });

  // ---------------------------------------------------------------- Part F
  describe('dashboard', () => {
    it('aggregates orchestration posture and coordinated runtime footprint', async () => {
      const { service } = makeService();
      const result = await service.dashboard('ws-1');
      expect(result.routing.supportedTargets).toContain('CAPITAL');
      expect(result.coordination.coordinatedRuntimes).toContain('IUC');
      expect(result.coordination.footprint).toHaveProperty('D18');
    });
  });
});

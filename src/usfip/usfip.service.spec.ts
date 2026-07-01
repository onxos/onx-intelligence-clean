import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsfipService } from './usfip.service';

describe('UsfipService (USFIP)', () => {
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
      uSFIPSession: model(),
      uSFIPProtocol: model(),
      uSFIPRule: model(),
      uSFIPPolicy: model(),
      uSFIPExecution: model(),
      uSFIPHistory: model(),
      uSFIPEvidence: model(),
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new UsfipService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'us-1',
    usfipSessionId: 'us-1',
    name: 'FY26 protocol',
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    state: 'INTERPRETING',
    founderDirective: 'Establish advantage',
    strategicObjective: 'Compound capital',
    strategicPriority: 'HIGH',
    strategicHorizon: 'SHORT',
    strategicOutcome: 'Outcome',
    overridden: false,
    executionSeq: 0,
    deletedAt: null,
    ...overrides,
  });

  const protocol = (overrides: Record<string, unknown> = {}) => ({
    id: 'pr-1',
    protocolId: 'pr-1',
    sessionId: 'us-1',
    workspaceId: 'ws-1',
    name: 'Protocol',
    status: 'ACTIVE',
    strategicPriority: 'HIGH',
    strategicHorizon: 'SHORT',
    deletedAt: null,
    ...overrides,
  });

  // ----------------------------------------------------------------- Part A/B
  describe('createSession', () => {
    it('creates a session, interprets intent, and audits/evidences', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.uSFIPSession.create.mockResolvedValue(session());
      const result = await service.createSession('ws-1', 'user-1', {
        name: 'FY26 protocol',
        founderDirective: 'Establish advantage',
      });
      expect(result.id).toBe('us-1');
      expect(prisma.uSFIPEvidence.create).toHaveBeenCalled();
      expect(prisma.uSFIPHistory.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USFIP_CREATE_SESSION' }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a missing founder directive', async () => {
      const { service } = makeService();
      await expect(
        service.createSession('ws-1', 'user-1', { name: 'x', founderDirective: '  ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('interpret', () => {
    it('re-interprets a directive on an open session', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPSession.findFirst.mockResolvedValue(session());
      prisma.uSFIPSession.update.mockImplementation(async ({ data }: any) => ({
        id: 'us-1',
        ...data,
      }));
      const result = await service.interpret('ws-1', 'user-1', 'us-1', {
        strategicPriority: 'CRITICAL',
      });
      expect(result.interpretation.strategicPriority).toBe('CRITICAL');
    });

    it('refuses to re-interpret an overridden session', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPSession.findFirst.mockResolvedValue(session({ overridden: true }));
      await expect(service.interpret('ws-1', 'user-1', 'us-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ----------------------------------------------------------------- Part A/C
  describe('createProtocol', () => {
    it('creates a draft protocol under a session', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPSession.findFirst.mockResolvedValue(session());
      prisma.uSFIPProtocol.create.mockResolvedValue(protocol({ status: 'DRAFT' }));
      const result = await service.createProtocol('ws-1', 'user-1', 'us-1', { name: 'Protocol' });
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('createRule / createPolicy', () => {
    it('creates a rule bound to a protocol', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPProtocol.findFirst.mockResolvedValue(protocol());
      prisma.uSFIPRule.create.mockResolvedValue({ id: 'ru-1', ordering: 1 });
      const result = await service.createRule('ws-1', 'user-1', 'pr-1', {
        name: 'Rule',
        ordering: 1,
      });
      expect(result.id).toBe('ru-1');
    });

    it('creates a policy bound to a protocol', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPProtocol.findFirst.mockResolvedValue(protocol());
      prisma.uSFIPPolicy.create.mockResolvedValue({ id: 'po-1', priority: 5 });
      const result = await service.createPolicy('ws-1', 'user-1', 'pr-1', {
        name: 'Policy',
        priority: 5,
      });
      expect(result.id).toBe('po-1');
    });
  });

  // ----------------------------------------------------------------- Part C/D
  describe('executeProtocol', () => {
    it('executes a governed protocol and records the path', async () => {
      const { service, prisma, audit } = makeService();
      prisma.uSFIPProtocol.findFirst.mockResolvedValue(protocol());
      prisma.uSFIPSession.findFirst.mockResolvedValue(session());
      prisma.uSFIPRule.findMany.mockResolvedValue([
        { id: 'r1', status: 'ACTIVE', ordering: 1, weight: 0.8 },
      ]);
      prisma.uSFIPPolicy.findMany.mockResolvedValue([
        { id: 'p1', status: 'ACTIVE', priority: 1, strategicPriority: 'HIGH' },
      ]);
      prisma.uSFIPExecution.create.mockImplementation(async ({ data }: any) => ({
        id: 'ex-1',
        ...data,
      }));
      const result = await service.executeProtocol('ws-1', 'user-1', 'pr-1', {});
      expect(result.evaluation.selectedPolicyId).toBe('p1');
      expect(result.evaluation.selectedRuleIds).toEqual(['r1']);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'USFIP_EXECUTE' }));
    });

    it('is rejected by governance when there are no active rules or policies', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPProtocol.findFirst.mockResolvedValue(protocol());
      prisma.uSFIPSession.findFirst.mockResolvedValue(session());
      prisma.uSFIPRule.findMany.mockResolvedValue([]);
      prisma.uSFIPPolicy.findMany.mockResolvedValue([]);
      await expect(service.executeProtocol('ws-1', 'user-1', 'pr-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to execute under an override', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPProtocol.findFirst.mockResolvedValue(protocol());
      prisma.uSFIPSession.findFirst.mockResolvedValue(session({ overridden: true }));
      await expect(service.executeProtocol('ws-1', 'user-1', 'pr-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateProtocol', () => {
    it('returns a governance validation result', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPProtocol.findFirst.mockResolvedValue(protocol());
      prisma.uSFIPSession.findFirst.mockResolvedValue(session());
      prisma.uSFIPRule.findMany.mockResolvedValue([
        { id: 'r1', status: 'ACTIVE', ordering: 1, weight: 0.8 },
      ]);
      prisma.uSFIPPolicy.findMany.mockResolvedValue([]);
      const result = await service.validateProtocol('ws-1', 'pr-1');
      expect(result.validation.valid).toBe(true);
    });
  });

  // ------------------------------------------------------------------- Part E
  describe('override', () => {
    it('applies an immutable override and locks the session', async () => {
      const { service, prisma, audit } = makeService();
      prisma.uSFIPSession.findFirst.mockResolvedValue(session());
      prisma.uSFIPSession.update.mockImplementation(async ({ data }: any) => ({
        id: 'us-1',
        ...data,
      }));
      const result = await service.override('ws-1', 'user-1', 'us-1', { directive: 'Halt' });
      expect(result.overridden).toBe(true);
      expect(result.state).toBe('OVERRIDDEN');
      expect(prisma.uSFIPEvidence.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'USFIP_OVERRIDE' }));
    });

    it('throws when the session is missing', async () => {
      const { service, prisma } = makeService();
      prisma.uSFIPSession.findFirst.mockResolvedValue(null);
      await expect(
        service.override('ws-1', 'user-1', 'missing', { directive: 'Halt' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dashboard', () => {
    it('aggregates posture and lists reused runtimes', async () => {
      const { service } = makeService();
      const result = await service.dashboard('ws-1');
      expect(result.reusedRuntimes).toContain('FIC');
      expect(result.reusedRuntimes).toContain('D14');
      expect(result).toHaveProperty('protocols');
    });
  });
});

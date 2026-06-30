import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IUCService } from './iuc.service';
import { isValidUnderstandingTransition, UNDERSTANDING_STATE_TRANSITIONS } from './iuc.constants';

describe('IUCService', () => {
  const makeService = () => {
    const prisma = {
      $transaction: jest.fn(),
      iUCEntity: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      understandingEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      understandingEvidence: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      understandingRelationship: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      intelligenceCapital: {
        findFirst: jest.fn(),
      },
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new IUCService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const iuc = (overrides: Record<string, unknown> = {}) => ({
    id: 'iuc-1',
    iucId: 'iuc-1',
    title: 'Understanding of governance',
    description: null,
    domain: 'GOVERNANCE',
    ownerId: 'user-1',
    workspaceId: 'ws-1',
    state: 'NASCENT',
    progress: 0,
    confidence: 0,
    authority: 'OPERATIONAL',
    capitalId: null,
    status: 'ACTIVE',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  describe('state transition table', () => {
    it('permits valid maturity transitions only', () => {
      expect(isValidUnderstandingTransition('NASCENT', 'FORMING')).toBe(true);
      expect(isValidUnderstandingTransition('NASCENT', 'ESTABLISHED')).toBe(false);
      expect(isValidUnderstandingTransition('DEPRECATED', 'FORMING')).toBe(false);
    });

    it('deprecated is terminal', () => {
      expect(UNDERSTANDING_STATE_TRANSITIONS.DEPRECATED).toHaveLength(0);
    });
  });

  describe('createIuc', () => {
    it('creates an IUC entity and an initial state event', async () => {
      const { service, prisma, audit } = makeService();
      prisma.iUCEntity.create.mockResolvedValue(iuc());
      const result = await service.createIuc('ws-1', 'user-1', {
        title: 'Understanding of governance',
      });
      expect(result.id).toBe('iuc-1');
      expect(prisma.understandingEvent.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('transitionState', () => {
    it('blocks ESTABLISHED until minimum progress is reached', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ state: 'DEVELOPING', progress: 0.2 }));
      await expect(
        service.transitionState('iuc-1', 'ws-1', 'user-1', { state: 'ESTABLISHED' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows ESTABLISHED when progress threshold met', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ state: 'DEVELOPING', progress: 0.7 }));
      prisma.iUCEntity.update.mockImplementation(async ({ data }: any) => ({
        ...iuc({ state: 'DEVELOPING', progress: 0.7 }),
        ...data,
      }));
      const result = await service.transitionState('iuc-1', 'ws-1', 'user-1', {
        state: 'ESTABLISHED' as any,
      });
      expect(result.state).toBe('ESTABLISHED');
      expect(prisma.understandingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'STATE_TRANSITION', toState: 'ESTABLISHED' }),
        }),
      );
    });

    it('rejects an invalid transition', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ state: 'NASCENT' }));
      await expect(
        service.transitionState('iuc-1', 'ws-1', 'user-1', { state: 'INSTITUTIONALIZED' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateProgress / updateConfidence', () => {
    it('records a progress event with before/after values', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ progress: 0.2 }));
      prisma.iUCEntity.update.mockImplementation(async ({ data }: any) => ({
        ...iuc(),
        ...data,
      }));
      const result = await service.updateProgress('iuc-1', 'ws-1', 'user-1', { progress: 0.5 });
      expect(result.progress).toBe(0.5);
      expect(prisma.understandingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'PROGRESS_UPDATE',
            progressBefore: 0.2,
            progressAfter: 0.5,
          }),
        }),
      );
    });

    it('records a confidence event', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ confidence: 0.1 }));
      prisma.iUCEntity.update.mockImplementation(async ({ data }: any) => ({ ...iuc(), ...data }));
      await service.updateConfidence('iuc-1', 'ws-1', 'user-1', { confidence: 0.8 });
      expect(prisma.understandingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'CONFIDENCE_UPDATE', confidenceAfter: 0.8 }),
        }),
      );
    });
  });

  describe('evolve', () => {
    it('moves understanding into EVOLVING and records an evolution event', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ state: 'ESTABLISHED', progress: 0.7 }));
      prisma.iUCEntity.update.mockImplementation(async ({ data }: any) => ({ ...iuc(), ...data }));
      const result = await service.evolve('iuc-1', 'ws-1', 'user-1', {
        reason: 'Assumptions changed',
      });
      expect(result.state).toBe('EVOLVING');
      expect(prisma.understandingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'EVOLUTION' }) }),
      );
    });

    it('refuses to evolve a deprecated understanding', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc({ state: 'DEPRECATED' }));
      await expect(
        service.evolve('iuc-1', 'ws-1', 'user-1', { reason: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('relationships', () => {
    it('rejects a self relationship', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(iuc());
      await expect(
        service.createRelationship('iuc-1', 'ws-1', 'user-1', {
          targetIucId: 'iuc-1',
          relationType: 'DEPENDS_ON' as any,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a relationship between two understandings', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst
        .mockResolvedValueOnce(iuc({ id: 'iuc-1' }))
        .mockResolvedValueOnce(iuc({ id: 'iuc-2' }));
      prisma.understandingRelationship.findFirst.mockResolvedValue(null);
      prisma.understandingRelationship.create.mockResolvedValue({
        id: 'rel-1',
        sourceIucId: 'iuc-1',
        targetIucId: 'iuc-2',
        relationType: 'DEPENDS_ON',
      });
      const result = await service.createRelationship('iuc-1', 'ws-1', 'user-1', {
        targetIucId: 'iuc-2',
        relationType: 'DEPENDS_ON' as any,
      });
      expect(result.id).toBe('rel-1');
    });
  });

  describe('workspace isolation', () => {
    it('throws NotFound when IUC belongs to another workspace', async () => {
      const { service, prisma } = makeService();
      prisma.iUCEntity.findFirst.mockResolvedValue(null);
      await expect(service.getIuc('iuc-1', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

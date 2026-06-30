import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CAPITAL_STATUS_TRANSITIONS, isValidCapitalStatusTransition } from './capital.constants';
import { IntelligenceCapitalService } from './intelligence-capital.service';

describe('IntelligenceCapitalService', () => {
  const makeService = () => {
    const prisma = {
      $transaction: jest.fn(),
      intelligenceCapital: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      capitalAccumulationEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      capitalAllocation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      allocationHistory: {
        create: jest.fn(),
      },
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new IntelligenceCapitalService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const capital = (overrides: Record<string, unknown> = {}) => ({
    id: 'cap-1',
    capitalId: 'cap-1',
    identity: 'Knowledge reserve',
    description: null,
    category: 'KNOWLEDGE',
    ownerId: 'user-1',
    workspaceId: 'ws-1',
    currentValue: 100,
    accumulatedValue: 100,
    allocatedValue: 0,
    minimumValue: 10,
    growthRate: 0.05,
    preservationScore: 1,
    riskScore: 0,
    confidence: 0.5,
    sourceLineage: [],
    authority: 'OPERATIONAL',
    status: 'ACTIVE',
    currency: 'IUC',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  describe('status transition table', () => {
    it('permits valid transitions only', () => {
      expect(isValidCapitalStatusTransition('ACTIVE', 'PRESERVED')).toBe(true);
      expect(isValidCapitalStatusTransition('ACTIVE', 'ACTIVE')).toBe(false);
      expect(isValidCapitalStatusTransition('ARCHIVED', 'ACTIVE')).toBe(false);
    });

    it('archived is terminal', () => {
      expect(CAPITAL_STATUS_TRANSITIONS.ARCHIVED).toHaveLength(0);
    });
  });

  describe('createCapital', () => {
    it('creates capital and an initial CREATION accumulation event', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.intelligenceCapital.create.mockResolvedValue(capital());
      const result = await service.createCapital('ws-1', 'user-1', {
        identity: 'Knowledge reserve',
        category: 'KNOWLEDGE' as any,
        initialValue: 100,
        minimumValue: 10,
      });
      expect(result.id).toBe('cap-1');
      expect(prisma.capitalAccumulationEvent.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a minimum value greater than the initial value', async () => {
      const { service } = makeService();
      await expect(
        service.createCapital('ws-1', 'user-1', {
          identity: 'x',
          category: 'KNOWLEDGE' as any,
          initialValue: 5,
          minimumValue: 50,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('accumulate', () => {
    it('applies COMPOUNDING using the supplied rate', async () => {
      const { service, prisma } = makeService();
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital());
      prisma.intelligenceCapital.update.mockImplementation(async ({ data }: any) => ({
        ...capital(),
        ...data,
      }));
      const result = await service.accumulate('cap-1', 'ws-1', 'user-1', {
        eventType: 'COMPOUNDING' as any,
        rate: 0.1,
      });
      expect(result.currentValue).toBe(110);
      expect(prisma.capitalAccumulationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'COMPOUNDING', valueAfter: 110 }),
        }),
      );
    });

    it('marks capital DECAYING when value falls below the minimum', async () => {
      const { service, prisma } = makeService();
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital({ currentValue: 12 }));
      prisma.intelligenceCapital.update.mockImplementation(async ({ data }: any) => ({
        ...capital(),
        ...data,
      }));
      const result = await service.accumulate('cap-1', 'ws-1', 'user-1', {
        eventType: 'REDUCTION' as any,
        amount: 5,
      });
      expect(result.status).toBe('DECAYING');
    });

    it('rejects REDUCTION that would go below zero', async () => {
      const { service, prisma } = makeService();
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital({ currentValue: 3 }));
      await expect(
        service.accumulate('cap-1', 'ws-1', 'user-1', {
          eventType: 'REDUCTION' as any,
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses accumulation on archived capital', async () => {
      const { service, prisma } = makeService();
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital({ status: 'ARCHIVED' }));
      await expect(
        service.accumulate('cap-1', 'ws-1', 'user-1', {
          eventType: 'GROWTH' as any,
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('executeAllocation', () => {
    const allocation = (overrides: Record<string, unknown> = {}) => ({
      id: 'alloc-1',
      workspaceId: 'ws-1',
      ownerId: 'user-1',
      amount: 40,
      status: 'APPROVED',
      capitalId: null,
      deletedAt: null,
      ...overrides,
    });

    it('draws down capital and records an ALLOCATION event', async () => {
      const { service, prisma } = makeService();
      prisma.capitalAllocation.findFirst.mockResolvedValue(allocation());
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital());
      prisma.intelligenceCapital.update.mockImplementation(async ({ data }: any) => ({
        ...capital(),
        ...data,
      }));
      prisma.capitalAllocation.update.mockImplementation(async ({ data }: any) => ({
        ...allocation(),
        ...data,
      }));
      const result = await service.executeAllocation('alloc-1', 'ws-1', 'user-1', {
        capitalId: 'cap-1',
      });
      expect(result.status).toBe('EXECUTED');
      expect(prisma.capitalAccumulationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'ALLOCATION', valueAfter: 60 }),
        }),
      );
      expect(prisma.allocationHistory.create).toHaveBeenCalled();
    });

    it('rejects execution that breaches the rules engine', async () => {
      const { service, prisma } = makeService();
      prisma.capitalAllocation.findFirst.mockResolvedValue(allocation({ amount: 95 }));
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital());
      await expect(
        service.executeAllocation('alloc-1', 'ws-1', 'user-1', { capitalId: 'cap-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to execute an already-executed allocation', async () => {
      const { service, prisma } = makeService();
      prisma.capitalAllocation.findFirst.mockResolvedValue(allocation({ status: 'EXECUTED' }));
      prisma.intelligenceCapital.findFirst.mockResolvedValue(capital());
      await expect(
        service.executeAllocation('alloc-1', 'ws-1', 'user-1', { capitalId: 'cap-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('rollbackAllocation', () => {
    it('restores drawn capital and marks the allocation ROLLED_BACK', async () => {
      const { service, prisma } = makeService();
      prisma.capitalAllocation.findFirst.mockResolvedValue({
        id: 'alloc-1',
        workspaceId: 'ws-1',
        amount: 40,
        status: 'EXECUTED',
        capitalId: 'cap-1',
        deletedAt: null,
      });
      prisma.intelligenceCapital.findFirst.mockResolvedValue(
        capital({ currentValue: 60, allocatedValue: 40 }),
      );
      prisma.intelligenceCapital.update.mockResolvedValue(capital());
      prisma.capitalAllocation.update.mockImplementation(async ({ data }: any) => ({
        id: 'alloc-1',
        ...data,
      }));
      const result = await service.rollbackAllocation('alloc-1', 'ws-1', 'user-1', {});
      expect(result.status).toBe('ROLLED_BACK');
      expect(prisma.capitalAccumulationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'ROLLBACK', valueAfter: 100 }),
        }),
      );
    });

    it('refuses to roll back an allocation that was not executed', async () => {
      const { service, prisma } = makeService();
      prisma.capitalAllocation.findFirst.mockResolvedValue({
        id: 'alloc-1',
        workspaceId: 'ws-1',
        amount: 40,
        status: 'APPROVED',
        capitalId: null,
        deletedAt: null,
      });
      await expect(
        service.rollbackAllocation('alloc-1', 'ws-1', 'user-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('workspace isolation', () => {
    it('throws NotFound when capital belongs to another workspace', async () => {
      const { service, prisma } = makeService();
      prisma.intelligenceCapital.findFirst.mockResolvedValue(null);
      await expect(service.getCapital('cap-1', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.intelligenceCapital.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
      );
    });
  });
});

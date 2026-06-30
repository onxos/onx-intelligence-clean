import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntelligenceLearningService } from './intelligence-learning.service';
import {
  isValidLearningTransition,
  LEARNING_TRANSITIONS,
  meetsCapitalizationConditions,
} from './intelligence-learning.constants';

describe('IntelligenceLearningService', () => {
  const makeService = () => {
    const prisma = {
      isConnected: jest.fn().mockReturnValue(false),
      $transaction: jest.fn(),
      learningState: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      learningEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      pattern: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      knowledgeEvolution: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      capitalizationEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new IntelligenceLearningService(prisma, audit);
    return { prisma, audit, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const learning = (overrides: Record<string, unknown> = {}) => ({
    id: 'learn-1',
    title: 'Learning',
    summary: null,
    objectId: 'obj-1',
    state: 'OBSERVED',
    confidence: 0.5,
    reinforcementCount: 0,
    contradictionCount: 0,
    capitalized: false,
    workspaceId: 'ws-1',
    createdById: 'user-1',
    deletedAt: null,
    ...overrides,
  });

  it('learning transition map only allows declared edges', () => {
    expect(isValidLearningTransition('OBSERVED', 'UNDERSTOOD')).toBe(true);
    expect(isValidLearningTransition('OBSERVED', 'CAPITALIZED')).toBe(false);
    expect(isValidLearningTransition('DEPRECATED', 'OBSERVED')).toBe(false);
    expect(isValidLearningTransition('REUSABLE', 'REUSABLE')).toBe(false);
    expect(LEARNING_TRANSITIONS.DEPRECATED).toEqual([]);
  });

  it('evaluates capitalization conditions correctly', () => {
    expect(
      meetsCapitalizationConditions({ state: 'REUSABLE', confidence: 0.9, reinforcementCount: 3 }),
    ).toBe(true);
    expect(
      meetsCapitalizationConditions({ state: 'OBSERVED', confidence: 0.9, reinforcementCount: 3 }),
    ).toBe(false);
    expect(
      meetsCapitalizationConditions({ state: 'REUSABLE', confidence: 0.5, reinforcementCount: 3 }),
    ).toBe(false);
  });

  it('creates a learning unit in OBSERVED state and audits', async () => {
    const { service, prisma, audit } = makeService();
    const tx = {
      learningState: { create: jest.fn().mockResolvedValue(learning()) },
      learningEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.createLearning('ws-1', 'user-1', { title: 'Learning' });
    expect(result.id).toBe('learn-1');
    expect(tx.learningEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'OBSERVATION', toState: 'OBSERVED' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEARNING_STATE_CREATED', success: true }),
    );
  });

  it('rejects creation with an empty title and audits failure', async () => {
    const { service, audit } = makeService();
    await expect(service.createLearning('ws-1', 'user-1', { title: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEARNING_STATE_CREATED', success: false }),
    );
  });

  it('rejects an invalid learning transition', async () => {
    const { service, prisma } = makeService();
    prisma.learningState.findFirst.mockResolvedValue(learning({ state: 'OBSERVED' }));
    await expect(
      service.transitionLearning('learn-1', 'ws-1', 'user-1', { toState: 'CAPITALIZED' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('auto-triggers capitalization when conditions are met on transition', async () => {
    const { service, prisma, audit } = makeService();
    // getLearning for transition
    prisma.learningState.findFirst
      .mockResolvedValueOnce(
        learning({ state: 'CONNECTED', confidence: 0.9, reinforcementCount: 3 }),
      ) // transition.getLearning
      .mockResolvedValueOnce(
        learning({ state: 'REUSABLE', confidence: 0.9, reinforcementCount: 3, capitalized: false }),
      ); // maybeCapitalize lookup

    const transitionTx = {
      learningState: {
        update: jest
          .fn()
          .mockResolvedValue(
            learning({ state: 'REUSABLE', confidence: 0.9, reinforcementCount: 3 }),
          ),
      },
      learningEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const capTx = {
      capitalizationEvent: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'cap-1', learningId: 'learn-1', capitalValue: 90 }),
      },
      learningState: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction
      .mockImplementationOnce(async (cb: any) => cb(transitionTx))
      .mockImplementationOnce(async (cb: any) => cb(capTx));

    const result: any = await service.transitionLearning('learn-1', 'ws-1', 'user-1', {
      toState: 'REUSABLE' as any,
    });
    expect(result.capitalization).toBeTruthy();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITALIZATION_TRIGGERED', success: true }),
    );
  });

  it('reinforces a learning unit and audits', async () => {
    const { service, prisma, audit } = makeService();
    prisma.learningState.findFirst
      .mockResolvedValueOnce(learning({ reinforcementCount: 0 })) // getLearning
      .mockResolvedValueOnce(learning({ state: 'OBSERVED', capitalized: false })); // maybeCapitalize (won't trigger)
    const tx = {
      learningState: { update: jest.fn().mockResolvedValue(learning({ reinforcementCount: 1 })) },
      learningEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result: any = await service.reinforceLearning('learn-1', 'ws-1', 'user-1', {});
    expect(result.reinforcementCount).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEARNING_REINFORCED', success: true }),
    );
  });

  it('deprecates a learning unit when superseded', async () => {
    const { service, prisma, audit } = makeService();
    prisma.learningState.findFirst.mockResolvedValue(learning({ state: 'VERIFIED' }));
    const tx = {
      knowledgeEvolution: {
        create: jest.fn().mockResolvedValue({ id: 'evo-1', evolutionType: 'SUPERSEDING' }),
      },
      learningState: { update: jest.fn().mockResolvedValue({}) },
      learningEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.recordEvolution('learn-1', 'ws-1', 'user-1', {
      evolutionType: 'SUPERSEDING' as any,
    });
    expect(result.id).toBe('evo-1');
    expect(tx.learningState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'DEPRECATED' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'KNOWLEDGE_EVOLUTION_RECORDED', success: true }),
    );
  });

  it('registers a pattern and audits', async () => {
    const { service, prisma, audit } = makeService();
    prisma.pattern.create.mockResolvedValue({ id: 'pat-1', patternType: 'SIMILARITY' });
    const result = await service.registerPattern('ws-1', 'user-1', {
      patternType: 'SIMILARITY' as any,
      label: 'Cluster',
    });
    expect(result.id).toBe('pat-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PATTERN_REGISTERED', success: true }),
    );
  });

  it('discovers repetition patterns across grouped learning units', async () => {
    const { service, prisma, audit } = makeService();
    prisma.learningState.findMany.mockResolvedValue([
      learning({ id: 'l1', objectId: 'obj-1', contradictionCount: 0 }),
      learning({ id: 'l2', objectId: 'obj-1', contradictionCount: 0 }),
      learning({ id: 'l3', objectId: 'obj-2', contradictionCount: 0 }),
    ]);
    prisma.pattern.create.mockResolvedValue({
      id: 'pat-1',
      patternType: 'REPETITION',
      occurrences: 2,
    });
    const result = await service.discoverPatterns('ws-1', 'user-1');
    expect(result.discovered).toBe(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PATTERN_DISCOVERED', success: true }),
    );
  });

  it('throws NotFound for a missing learning unit', async () => {
    const { service, prisma } = makeService();
    prisma.learningState.findFirst.mockResolvedValue(null);
    await expect(service.getLearning('missing', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

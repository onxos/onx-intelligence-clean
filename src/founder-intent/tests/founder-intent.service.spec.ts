import { ForbiddenException } from '@nestjs/common';
import { FounderIntentService } from '../founder-intent.service';

describe('FounderIntentService', () => {
  const makeService = () => {
    const prisma = {
      isConnected: jest.fn(() => true),
      memoryEntry: {
        create: jest.fn(async ({ data }) => ({
          id: 'fi-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          ...data,
        })),
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
      },
    } as any;

    const audit = {
      log: jest.fn(async () => ({})),
    } as any;

    const workspace = {
      listProjects: jest.fn(async () => [{ id: 'p1' }]),
      listAgents: jest.fn(async () => [{ id: 'a1' }]),
      listMemory: jest.fn(async () => [{ id: 'm1' }]),
      listSources: jest.fn(async () => [{ id: 's1' }]),
      listEvaluations: jest.fn(async () => [{ id: 'e1' }]),
    } as any;

    const capital = {
      getReports: jest.fn(async () => ({ allocationCount: 2 })),
    } as any;

    return {
      service: new FounderIntentService(prisma, audit, workspace, capital),
      prisma,
      audit,
      workspace,
      capital,
    };
  };

  const validInput = {
    objective: 'Scale evidence throughput',
    constraints: ['must preserve workspace isolation', 'must not leak cross-workspace data'],
    priorities: [{ area: 'evidence-quality', weight: 90 }],
    strategicContext: ['atlas-v6'],
    governanceContext: ['additive-only'],
    workspaceId: 'ws-1',
  };

  it('compiles founder intent and persists result', async () => {
    const { service, prisma } = makeService();

    const result = await service.compile('ws-1', 'user-1', validInput, { actorId: 'user-1' });

    expect(result.id).toBe('fi-1');
    expect(result.workspaceId).toBe('ws-1');
    expect(result.executionDirectives.length).toBeGreaterThan(0);
    expect(prisma.memoryEntry.create).toHaveBeenCalled();
  });

  it('returns validation errors for contradictory constraints', async () => {
    const { service } = makeService();

    const result = await service.validate(
      'ws-1',
      'user-1',
      {
        ...validInput,
        constraints: ['must use external orchestration', 'must not use external orchestration'],
      },
      { actorId: 'user-1' },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((issue: any) => issue.code === 'CONTRADICTORY_CONSTRAINT')).toBe(
      true,
    );
  });

  it('simulates without persistence mutations', async () => {
    const { service, prisma } = makeService();

    const simulation = await service.simulate('ws-1', 'user-1', validInput, { actorId: 'user-1' });

    expect(simulation.executionSequence.length).toBeGreaterThan(0);
    expect(prisma.memoryEntry.create).not.toHaveBeenCalled();
  });

  it('rejects cross-workspace payload mismatch', async () => {
    const { service } = makeService();

    await expect(
      service.compile(
        'ws-auth',
        'user-1',
        { ...validInput, workspaceId: 'ws-other' },
        {
          actorId: 'user-1',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

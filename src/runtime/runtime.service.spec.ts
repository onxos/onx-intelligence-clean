import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RuntimeService } from './runtime.service';

describe('RuntimeService (D18)', () => {
  const makeService = () => {
    const prisma = {
      $transaction: jest.fn(),
      runtimeSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      runtimeState: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      runtimeContext: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      runtimeEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      runtimeCheckpoint: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      runtimeSnapshot: {
        create: jest.fn(),
      },
      runtimeRecovery: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      runtimeHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      runtimePolicy: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new RuntimeService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'rt-1',
    sessionId: 'rt-1',
    name: 'Orchestration Runtime',
    description: null,
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    state: 'RUNNING',
    previousState: 'READY',
    healthStatus: 'HEALTHY',
    authority: 'OPERATIONAL',
    lineageRoot: null,
    parentSessionId: null,
    continuitySeq: 0,
    eventSeq: 5,
    recoveryCount: 0,
    lastCheckpointId: null,
    lastHeartbeatAt: new Date(),
    stateEnteredAt: new Date(),
    status: 'ACTIVE',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  describe('createSession', () => {
    it('creates a CREATED session with initial state/event/history and audits success', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.runtimeSession.create.mockResolvedValue(session({ state: 'CREATED' }));
      const result = await service.createSession('ws-1', 'user-1', {
        name: 'Orchestration Runtime',
      });
      expect(result.state).toBe('CREATED');
      expect(prisma.runtimeState.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ toState: 'CREATED' }) }),
      );
      expect(prisma.runtimeEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'SESSION_CREATED' }),
        }),
      );
      expect(prisma.runtimeHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'SESSION_CREATED' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a blank name and audits the failure', async () => {
      const { service, audit } = makeService();
      await expect(service.createSession('ws-1', 'user-1', { name: '  ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('transitionState', () => {
    it('applies a valid transition and records state/event/history', async () => {
      const { service, prisma, audit } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'RUNNING' }));
      prisma.runtimeSession.update.mockResolvedValue(session({ state: 'PAUSED' }));
      const result = await service.transitionState('rt-1', 'ws-1', 'user-1', {
        state: 'PAUSED' as any,
      });
      expect(result.state).toBe('PAUSED');
      expect(prisma.runtimeState.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromState: 'RUNNING', toState: 'PAUSED' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RUNTIME_STATE_TRANSITIONED', success: true }),
      );
    });

    it('rejects an invalid transition', async () => {
      const { service, prisma, audit } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'CREATED' }));
      await expect(
        service.transitionState('rt-1', 'ws-1', 'user-1', { state: 'RUNNING' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('enforces workspace isolation (missing session -> 404)', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(null);
      await expect(
        service.transitionState('rt-x', 'ws-2', 'user-2', { state: 'PAUSED' as any }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachContext', () => {
    it('supersedes the previous version and creates a new active context', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session());
      prisma.runtimeContext.findFirst.mockResolvedValue({ id: 'ctx-old', version: 1 });
      prisma.runtimeContext.create.mockResolvedValue({
        id: 'ctx-2',
        contextType: 'KNOWLEDGE',
        key: 'k1',
        referenceId: 'ref-1',
        version: 2,
      });
      const result = await service.attachContext('rt-1', 'ws-1', 'user-1', {
        contextType: 'KNOWLEDGE' as any,
        key: 'k1',
        referenceId: 'ref-1',
      });
      expect(result.version).toBe(2);
      expect(prisma.runtimeContext.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ctx-old' }, data: { active: false } }),
      );
    });
  });

  describe('recordEvent', () => {
    it('updates lastHeartbeatAt for HEARTBEAT events', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session());
      prisma.runtimeEvent.create.mockResolvedValue({
        id: 'ev-1',
        eventType: 'HEARTBEAT',
        sequence: 6,
      });
      await service.recordEvent('rt-1', 'ws-1', 'user-1', { eventType: 'HEARTBEAT' as any });
      expect(prisma.runtimeSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastHeartbeatAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('createCheckpoint', () => {
    it('captures active contexts and audits the checkpoint', async () => {
      const { service, prisma, audit } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'RUNNING' }));
      prisma.runtimeContext.findMany.mockResolvedValue([
        {
          contextType: 'KNOWLEDGE',
          key: 'k1',
          referenceId: 'r1',
          referenceType: 't',
          payload: {},
          version: 1,
        },
      ]);
      prisma.runtimeCheckpoint.count.mockResolvedValue(0);
      prisma.runtimeCheckpoint.create.mockResolvedValue({
        id: 'cp-1',
        label: 'milestone',
        capturedState: 'RUNNING',
      });
      const result = await service.createCheckpoint('rt-1', 'ws-1', 'user-1', {
        label: 'milestone',
      });
      expect(result.id).toBe('cp-1');
      expect(prisma.runtimeCheckpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contextCount: 1 }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RUNTIME_CHECKPOINT_CREATED', success: true }),
      );
    });

    it('rejects checkpointing an archived session', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'ARCHIVED' }));
      await expect(
        service.createCheckpoint('rt-1', 'ws-1', 'user-1', { label: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recover', () => {
    it('restores from a checkpoint, routes through RECOVERING and increments recoveryCount', async () => {
      const { service, prisma, audit } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'FAILED', eventSeq: 10 }));
      prisma.runtimeCheckpoint.findFirst.mockResolvedValue({
        id: 'cp-1',
        capturedState: 'RUNNING',
        contextSnapshot: {
          contexts: [{ contextType: 'KNOWLEDGE', key: 'k1', payload: {}, version: 1 }],
        },
      });
      prisma.runtimeSession.update.mockResolvedValue(
        session({ state: 'RUNNING', recoveryCount: 1 }),
      );
      prisma.runtimeRecovery.create.mockResolvedValue({ id: 'rec-1' });
      const result = await service.recover('rt-1', 'ws-1', 'user-1', {
        recoveryType: 'CHECKPOINT_RESTORE' as any,
        checkpointId: 'cp-1',
      });
      expect(result.recovery.id).toBe('rec-1');
      expect(result.session.recoveryCount).toBe(1);
      expect(prisma.runtimeContext.updateMany).toHaveBeenCalled();
      expect(prisma.runtimeRecovery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', success: true }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RUNTIME_RECOVERED', success: true }),
      );
    });

    it('requires a checkpointId for CHECKPOINT_RESTORE', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'FAILED' }));
      await expect(
        service.recover('rt-1', 'ws-1', 'user-1', { recoveryType: 'CHECKPOINT_RESTORE' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resumes a paused session to RUNNING', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'PAUSED', eventSeq: 3 }));
      prisma.runtimeSession.update.mockResolvedValue(
        session({ state: 'RUNNING', recoveryCount: 1 }),
      );
      prisma.runtimeRecovery.create.mockResolvedValue({ id: 'rec-2' });
      const result = await service.resume('rt-1', 'ws-1', 'user-1', {});
      expect(result.session.state).toBe('RUNNING');
    });

    it('blocks SESSION_RESUME from RUNNING', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session({ state: 'RUNNING' }));
      await expect(service.resume('rt-1', 'ws-1', 'user-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('createPolicy', () => {
    it('creates a governance policy and audits it', async () => {
      const { service, prisma, audit } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(session());
      prisma.runtimePolicy.create.mockResolvedValue({
        id: 'pol-1',
        name: 'recovery-limit',
        policyType: 'RECOVERY',
      });
      const result = await service.createPolicy('rt-1', 'ws-1', 'user-1', {
        name: 'recovery-limit',
        policyType: 'RECOVERY',
      });
      expect(result.id).toBe('pol-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RUNTIME_POLICY_SET', success: true }),
      );
    });
  });

  describe('health', () => {
    it('recomputes health and persists drift', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findFirst.mockResolvedValue(
        session({ state: 'FAILED', healthStatus: 'HEALTHY' }),
      );
      const result = await service.health('rt-1', 'ws-1');
      expect(result.healthStatus).toBe('UNHEALTHY');
      expect(prisma.runtimeSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { healthStatus: 'UNHEALTHY' } }),
      );
      expect(prisma.runtimeHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'HEALTH_CHECK' }) }),
      );
    });
  });

  describe('dashboard', () => {
    it('aggregates posture across sessions and recoveries', async () => {
      const { service, prisma } = makeService();
      prisma.runtimeSession.findMany.mockResolvedValue([
        session({ state: 'RUNNING', healthStatus: 'HEALTHY' }),
        session({ id: 'rt-2', state: 'FAILED', healthStatus: 'UNHEALTHY' }),
      ]);
      prisma.runtimeCheckpoint.count.mockResolvedValue(3);
      prisma.runtimeRecovery.findMany.mockResolvedValue([{ success: true }, { success: false }]);
      const result = await service.dashboard('ws-1');
      expect(result.totalSessions).toBe(2);
      expect(result.activeSessions).toBe(1);
      expect(result.failedSessions).toBe(1);
      expect(result.totalCheckpoints).toBe(3);
      expect(result.totalRecoveries).toBe(2);
      expect(result.successfulRecoveries).toBe(1);
      expect(result.recoverySuccessRate).toBe(0.5);
      expect(result.states.length).toBe(12);
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { computeChecksum } from './exchange-engine';

describe('ExchangeService (D19)', () => {
  const makeService = () => {
    const prisma = {
      $transaction: jest.fn(),
      exchangeSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      exchangeTransaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      exchangeEnvelope: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      exchangeMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      exchangeReceipt: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      exchangeAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      exchangeHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      exchangePolicy: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      exchangeLineage: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new ExchangeService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'ses-1',
    exchangeId: 'ses-1',
    name: 'Exchange Session',
    description: null,
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    ownershipClass: 'WORKSPACE',
    state: 'OPEN',
    authority: 'OPERATIONAL',
    transactionSeq: 0,
    eventSeq: 1,
    status: 'ACTIVE',
    deletedAt: null,
    ...overrides,
  });

  const payload = { subject: 'insight', value: 42 };

  const transaction = (overrides: Record<string, unknown> = {}) => ({
    id: 'txn-1',
    transactionId: 'txn-1',
    sessionId: 'ses-1',
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    intent: 'Transfer insight',
    description: null,
    stage: 'INTEND',
    previousStage: null,
    status: 'PENDING',
    ownershipClass: 'WORKSPACE',
    origin: 'agent-a',
    destination: 'agent-b',
    parentTransactionId: null,
    sourceObjectId: 'src-1',
    sourceObjectType: 'IntelligenceObject',
    targetObjectId: 'tgt-1',
    targetObjectType: 'Runtime',
    authority: 'SOVEREIGN',
    confidence: 1,
    provenance: 'founder',
    integrityHash: computeChecksum(payload),
    integrityVerified: false,
    traceable: true,
    trustScore: 0.5,
    validationState: 'PENDING',
    stageSeq: 0,
    eventSeq: 1,
    replayCount: 0,
    rolledBack: false,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  });

  const envelope = (overrides: Record<string, unknown> = {}) => ({
    id: 'env-1',
    transactionId: 'txn-1',
    sessionId: 'ses-1',
    workspaceId: 'ws-1',
    payload,
    checksum: computeChecksum(payload),
    sealed: true,
    ...overrides,
  });

  describe('createSession', () => {
    it('creates a session and audits', async () => {
      const { service, prisma, audit } = makeService();
      prisma.exchangeSession.create.mockResolvedValue(session());
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.createSession('ws-1', 'user-1', { name: 'Exchange Session' });

      expect(result.id).toBe('ses-1');
      expect(prisma.exchangeSession.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_SESSION_CREATED', success: true }),
      );
    });

    it('rejects a blank name', async () => {
      const { service, audit } = makeService();
      await expect(service.createSession('ws-1', 'user-1', { name: '  ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_SESSION_CREATED', success: false }),
      );
    });
  });

  describe('createExchange', () => {
    it('creates a transaction at INTEND and seals an envelope', async () => {
      const { service, prisma, audit } = makeService();
      prisma.exchangeSession.findFirst.mockResolvedValue(session());
      prisma.exchangeSession.update.mockResolvedValue(session({ state: 'ACTIVE' }));
      prisma.exchangeTransaction.create.mockResolvedValue(transaction());
      prisma.exchangeEnvelope.create.mockResolvedValue(envelope());
      prisma.exchangeMessage.create.mockResolvedValue({ id: 'm-1' });
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.createExchange('ws-1', 'user-1', {
        sessionId: 'ses-1',
        intent: 'Transfer insight',
        payload,
      });

      expect(result.stage).toBe('INTEND');
      expect(prisma.exchangeEnvelope.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_CREATED', success: true }),
      );
    });

    it('requires a payload', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeSession.findFirst.mockResolvedValue(session());
      await expect(
        service.createExchange('ws-1', 'user-1', {
          sessionId: 'ses-1',
          intent: 'x',
          payload: undefined as any,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when the session is in another workspace', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeSession.findFirst.mockResolvedValue(null);
      await expect(
        service.createExchange('ws-1', 'user-1', { sessionId: 'ses-x', intent: 'x', payload }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('submitExchange', () => {
    it('runs the full pipeline to COMPLETE when validation passes', async () => {
      const { service, prisma, audit } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction());
      prisma.exchangeTransaction.update.mockImplementation(async ({ data }: any) => ({
        ...transaction(),
        ...data,
      }));
      prisma.exchangeEnvelope.findFirst.mockResolvedValue(envelope());
      prisma.exchangePolicy.findMany.mockResolvedValue([]);
      prisma.exchangeMessage.create.mockResolvedValue({ id: 'm-1' });
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });
      prisma.exchangeAudit.create.mockResolvedValue({ id: 'a-1' });
      prisma.exchangeReceipt.create.mockResolvedValue({ id: 'r-1' });
      prisma.exchangeLineage.create.mockResolvedValue({ id: 'l-1' });

      const result = await service.submitExchange('txn-1', 'ws-1', 'user-1', {});

      expect(result.transaction.stage).toBe('COMPLETE');
      expect(result.validation.passed).toBe(true);
      expect(prisma.exchangeReceipt.create).toHaveBeenCalled();
      expect(prisma.exchangeLineage.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_SUBMITTED', success: true }),
      );
    });

    it('rejects submission when not at INTEND', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction({ stage: 'COMPLETE' }));
      await expect(service.submitExchange('txn-1', 'ws-1', 'user-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('fails the pipeline when a policy is violated', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction());
      prisma.exchangeTransaction.update.mockImplementation(async ({ data }: any) => ({
        ...transaction(),
        ...data,
      }));
      prisma.exchangeEnvelope.findFirst.mockResolvedValue(envelope());
      prisma.exchangePolicy.findMany.mockResolvedValue([
        {
          id: 'p-1',
          name: 'HighTrust',
          policyType: 'TRUST',
          rules: { minTrust: 0.99 },
          enabled: true,
        },
      ]);
      prisma.exchangeMessage.create.mockResolvedValue({ id: 'm-1' });
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });
      prisma.exchangeAudit.create.mockResolvedValue({ id: 'a-1' });

      const result = await service.submitExchange('txn-1', 'ws-1', 'user-1', {});
      expect(result.transaction.stage).toBe('FAILED');
      expect(result.validation.passed).toBe(false);
    });
  });

  describe('validate', () => {
    it('persists validation audits and marks PASSED', async () => {
      const { service, prisma, audit } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction());
      prisma.exchangeEnvelope.findFirst.mockResolvedValue(envelope());
      prisma.exchangeLineage.count.mockResolvedValue(1);
      prisma.exchangePolicy.findMany.mockResolvedValue([]);
      prisma.exchangeAudit.create.mockResolvedValue({ id: 'a-1' });
      prisma.exchangeTransaction.update.mockResolvedValue(transaction());
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.validate('txn-1', 'ws-1', 'user-1', {});
      expect(result.passed).toBe(true);
      expect(prisma.exchangeAudit.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_VALIDATED', success: true }),
      );
    });
  });

  describe('replay', () => {
    it('resets a completed exchange and re-runs the pipeline', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(
        transaction({ stage: 'COMPLETE', status: 'COMPLETED', replayCount: 0 }),
      );
      prisma.exchangeTransaction.update.mockImplementation(async ({ data }: any) => ({
        ...transaction(),
        ...data,
      }));
      prisma.exchangeEnvelope.findFirst.mockResolvedValue(envelope());
      prisma.exchangePolicy.findMany.mockResolvedValue([]);
      prisma.exchangeMessage.create.mockResolvedValue({ id: 'm-1' });
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });
      prisma.exchangeAudit.create.mockResolvedValue({ id: 'a-1' });
      prisma.exchangeReceipt.create.mockResolvedValue({ id: 'r-1' });
      prisma.exchangeLineage.create.mockResolvedValue({ id: 'l-1' });

      const result = await service.replay('txn-1', 'ws-1', 'user-1', {});
      expect(result.transaction.stage).toBe('COMPLETE');
    });

    it('rejects replay of a non-terminal exchange', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction({ stage: 'TRANSFER' }));
      await expect(service.replay('txn-1', 'ws-1', 'user-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('rollback', () => {
    it('rolls back a mid-pipeline exchange and issues a REJECTED receipt', async () => {
      const { service, prisma, audit } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction({ stage: 'TRANSFER' }));
      prisma.exchangeTransaction.update.mockImplementation(async ({ data }: any) => ({
        ...transaction({ stage: 'TRANSFER' }),
        ...data,
      }));
      prisma.exchangeReceipt.create.mockResolvedValue({ id: 'r-1' });
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.rollback('txn-1', 'ws-1', 'user-1', { reason: 'manual' });
      expect(result.status).toBe('ROLLED_BACK');
      expect(prisma.exchangeReceipt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_ROLLED_BACK', success: true }),
      );
    });

    it('rejects rollback before submission (INTEND)', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(transaction({ stage: 'INTEND' }));
      await expect(service.rollback('txn-1', 'ws-1', 'user-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a second rollback', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(
        transaction({ stage: 'TRANSFER', rolledBack: true }),
      );
      await expect(service.rollback('txn-1', 'ws-1', 'user-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('createPolicy', () => {
    it('creates a governance policy', async () => {
      const { service, prisma, audit } = makeService();
      prisma.exchangeSession.findFirst.mockResolvedValue(session());
      prisma.exchangePolicy.create.mockResolvedValue({
        id: 'p-1',
        name: 'HighTrust',
        policyType: 'TRUST',
      });
      prisma.exchangeHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.createPolicy('ses-1', 'ws-1', 'user-1', {
        name: 'HighTrust',
        policyType: 'TRUST',
        rules: { minTrust: 0.9 },
      });
      expect(result.id).toBe('p-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXCHANGE_POLICY_SET', success: true }),
      );
    });
  });

  describe('workspace isolation', () => {
    it('throws NotFound when a transaction is not in the workspace', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findFirst.mockResolvedValue(null);
      await expect(service.status('txn-x', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('dashboard', () => {
    it('aggregates exchange posture', async () => {
      const { service, prisma } = makeService();
      prisma.exchangeTransaction.findMany.mockResolvedValue([
        transaction({ stage: 'COMPLETE', status: 'COMPLETED', trustScore: 0.8 }),
        transaction({ id: 'txn-2', stage: 'FAILED', status: 'FAILED', trustScore: 0.2 }),
      ]);
      prisma.exchangeSession.count.mockResolvedValue(1);
      prisma.exchangeReceipt.count.mockResolvedValue(3);
      prisma.exchangeLineage.count.mockResolvedValue(1);

      const result = await service.dashboard('ws-1');
      expect(result.totalTransactions).toBe(2);
      expect(result.completedTransactions).toBe(1);
      expect(result.failedTransactions).toBe(1);
      expect(result.averageTrust).toBeCloseTo(0.5, 4);
      expect(result.byStage.COMPLETE).toBe(1);
    });
  });
});

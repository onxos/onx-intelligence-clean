import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReasoningService } from './reasoning.service';

function model() {
  return {
    create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest
      .fn()
      .mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
  };
}

function buildPrisma() {
  const prisma: any = {
    reasoningSession: model(),
    reasoningContext: model(),
    reasoningChain: model(),
    reasoningStep: model(),
    reasoningResult: model(),
    reasoningEvidence: model(),
    reasoningValidation: model(),
    reasoningHistory: model(),
  };
  prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
  return prisma;
}

describe('ReasoningService', () => {
  let prisma: any;
  let audit: any;
  let evidence: any;
  let svc: ReasoningService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: jest.fn().mockResolvedValue(null) };
    evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) };
    svc = new ReasoningService(prisma, audit, evidence);
  });

  describe('startReasoning', () => {
    it('runs the pipeline and persists session, chain, steps, result, audit', async () => {
      const res = await svc.startReasoning('ws-1', 'user-1', {
        mode: 'INDUCTIVE',
        question: 'Is flourishing improving?',
        contexts: [{ runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 }],
        evidence: [{ confidence: 1 }],
        constraints: [{ name: 'trust', satisfied: true }],
      } as any);

      expect(prisma.reasoningSession.create).toHaveBeenCalled();
      expect(prisma.reasoningChain.create).toHaveBeenCalled();
      expect(prisma.reasoningStep.create).toHaveBeenCalledTimes(7);
      expect(prisma.reasoningResult.create).toHaveBeenCalled();
      expect(prisma.reasoningHistory.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REASONING_START', success: true }),
      );
      expect(res.verdict).toBe('CONCLUSIVE');
      expect(res.outcome.alternatives.length).toBeGreaterThan(0);
    });

    it('creates one alternative chain per derived alternative path', async () => {
      await svc.startReasoning('ws-1', 'user-1', {
        mode: 'DEDUCTIVE',
        question: 'q',
        contexts: [{ runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 }],
        evidence: [{ confidence: 1 }],
        constraints: [{ name: 'c', satisfied: true }],
      } as any);
      // 1 primary + 3 alternative chains
      expect(prisma.reasoningChain.create).toHaveBeenCalledTimes(4);
    });

    it('rejects an empty question', async () => {
      await expect(
        svc.startReasoning('ws-1', 'user-1', { mode: 'INDUCTIVE', question: '   ' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getSession', () => {
    it('throws when session missing', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue(null);
      await expect(svc.getSession('ws-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns session with result, contexts and chains', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue({ id: 's-1', workspaceId: 'ws-1' });
      prisma.reasoningResult.findFirst.mockResolvedValue({ id: 'r-1' });
      const res = await svc.getSession('ws-1', 's-1');
      expect(res.session.id).toBe('s-1');
      expect(res.result.id).toBe('r-1');
    });
  });

  describe('getTrace', () => {
    it('groups steps under their chains', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue({ id: 's-1', workspaceId: 'ws-1' });
      prisma.reasoningChain.findMany.mockResolvedValue([{ id: 'c-1', sequence: 0 }]);
      prisma.reasoningStep.findMany.mockResolvedValue([
        { id: 'st-1', chainId: 'c-1', sequence: 0 },
        { id: 'st-2', chainId: 'c-1', sequence: 1 },
      ]);
      const trace = await svc.getTrace('ws-1', 's-1');
      expect(trace.chains[0].steps).toHaveLength(2);
    });
  });

  describe('validateSession', () => {
    it('persists a validation record + evidence + history and audits', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'INDUCTIVE',
        constraintsSatisfied: true,
        constitutionalRef: 'REASONING:session',
        metadata: {},
      });
      prisma.reasoningContext.findMany.mockResolvedValue([
        { runtime: 'D16', role: 'KNOWLEDGE', weight: 1, confidence: 0.9 },
      ]);
      prisma.reasoningEvidence.findMany.mockResolvedValue([{ confidence: 0.8 }]);

      const res = await svc.validateSession('ws-1', 'user-1', 's-1');
      expect(prisma.reasoningValidation.create).toHaveBeenCalled();
      expect(res.validation.valid).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REASONING_VALIDATE', success: true }),
      );
    });

    it('reports invalid when knowledge context is absent', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'INDUCTIVE',
        constraintsSatisfied: true,
        constitutionalRef: 'REASONING:session',
        metadata: {},
      });
      prisma.reasoningContext.findMany.mockResolvedValue([
        { runtime: 'D19', role: 'EXCHANGE', weight: 1, confidence: 0.9 },
      ]);
      prisma.reasoningEvidence.findMany.mockResolvedValue([]);

      const res = await svc.validateSession('ws-1', 'user-1', 's-1');
      expect(res.validation.valid).toBe(false);
    });
  });

  describe('override', () => {
    it('locks the session immutably', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        status: 'COMPLETED',
      });
      const res = await svc.override('ws-1', 'user-1', 's-1', {
        directive: 'freeze',
      } as any);
      expect(res.overridden).toBe(true);
      expect(res.status).toBe('OVERRIDDEN');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REASONING_OVERRIDE' }),
      );
    });

    it('rejects an empty directive', async () => {
      prisma.reasoningSession.findFirst.mockResolvedValue({ id: 's-1', workspaceId: 'ws-1' });
      await expect(
        svc.override('ws-1', 'user-1', 's-1', { directive: '  ' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('dashboard', () => {
    it('aggregates counts, modes, verdicts, supported modes and reused runtimes', async () => {
      prisma.reasoningSession.count.mockResolvedValue(3);
      prisma.reasoningSession.groupBy
        .mockResolvedValueOnce([{ mode: 'INDUCTIVE', _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ verdict: 'CONCLUSIVE', _count: { _all: 2 } }]);
      const res = await svc.dashboard('ws-1');
      expect(res.sessions.total).toBe(3);
      expect(res.byMode[0]).toEqual({ mode: 'INDUCTIVE', count: 2 });
      expect(res.byVerdict[0]).toEqual({ verdict: 'CONCLUSIVE', count: 2 });
      expect(res.supportedModes).toHaveLength(8);
      expect(res.reusedRuntimes).toContain('D16');
      expect(res.reusedRuntimes).toContain('FIAR');
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DecisionService } from './decision.service';

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

function makePrisma() {
  const prisma: any = {
    decisionSession: model(),
    decisionContext: model(),
    decisionCandidate: model(),
    decisionEvaluation: model(),
    decisionConstraint: model(),
    decisionVerdict: model(),
    decisionEvidence: model(),
    decisionValidation: model(),
    decisionHistory: model(),
  };
  prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
  return prisma;
}

function makeService() {
  const prisma = makePrisma();
  const audit = { log: jest.fn().mockResolvedValue(null) } as any;
  const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
  const svc = new DecisionService(prisma, audit, evidence);
  return { svc, prisma, audit, evidence };
}

const CTX = { actorId: 'user-1', requestId: 'req-1', ip: '127.0.0.1', userAgent: 'jest' };

describe('DecisionService', () => {
  describe('startDecision', () => {
    it('persists the session, context, candidates, constraints, history and audits', async () => {
      const { svc, prisma, audit } = makeService();
      const result = await svc.startDecision(
        'ws-1',
        'user-1',
        {
          mode: 'STRATEGIC' as any,
          objective: 'Choose a growth path',
          candidates: [{ label: 'A', benefit: 0.8 } as any, { label: 'B', benefit: 0.6 } as any],
          constraints: [{ name: 'budget', satisfied: true } as any],
          contexts: [{ runtime: 'REASONING', role: 'REASONING', confidence: 1 } as any],
        } as any,
        CTX,
      );

      expect(result.status).toBe('EVALUATING');
      expect(prisma.decisionSession.create).toHaveBeenCalledTimes(1);
      expect(prisma.decisionCandidate.create).toHaveBeenCalledTimes(2);
      expect(prisma.decisionConstraint.create).toHaveBeenCalledTimes(1);
      expect(prisma.decisionContext.create).toHaveBeenCalledTimes(1);
      expect(prisma.decisionHistory.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECISION_START', status: 'SUCCESS' }),
      );
    });

    it('rejects an empty objective', async () => {
      const { svc } = makeService();
      await expect(
        svc.startDecision('ws-1', 'user-1', { mode: 'STRATEGIC', objective: '  ' } as any, CTX),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('evaluateCandidates', () => {
    function seedForEvaluate(prisma: any) {
      prisma.decisionSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'STRATEGIC',
        objective: 'Choose a growth path',
        status: 'EVALUATING',
        overridden: false,
        version: 1,
        metadata: { founderGuided: false },
      });
      prisma.decisionCandidate.findMany.mockResolvedValue([
        {
          id: 'c1',
          candidateId: 'CID-1',
          label: 'strong',
          description: null,
          weight: 1,
          benefit: 0.95,
          cost: 0.05,
          admissible: true,
          reasoningConfidence: 0.9,
          planningReadiness: 0.9,
          capitalSupport: 0.9,
          constraintsSatisfied: true,
          referenceId: null,
          referenceType: null,
        },
        {
          id: 'c2',
          candidateId: 'CID-2',
          label: 'weak',
          description: null,
          weight: 1,
          benefit: 0.3,
          cost: 0.2,
          admissible: true,
          reasoningConfidence: null,
          planningReadiness: null,
          capitalSupport: null,
          constraintsSatisfied: true,
          referenceId: null,
          referenceType: null,
        },
      ]);
      prisma.decisionConstraint.findMany.mockResolvedValue([
        { name: 'budget', satisfied: true, weight: 1, required: true, category: null },
      ]);
      prisma.decisionContext.findMany.mockResolvedValue([
        { runtime: 'REASONING', role: 'REASONING', weight: 1, confidence: 1 },
        { runtime: 'PLANNING', role: 'PLAN', weight: 1, confidence: 1 },
        { runtime: 'CAPITAL', role: 'CAPITAL', weight: 1, confidence: 0.9 },
      ]);
    }

    it('runs the pipeline, persists evaluations, verdict, updates and audits', async () => {
      const { svc, prisma, audit } = makeService();
      seedForEvaluate(prisma);
      const result: any = await svc.evaluateCandidates('ws-1', 'user-1', 'sess-1', CTX);

      expect(result.outcome.verdict).toBe('SELECTED');
      expect(result.outcome.winner.label).toBe('strong');
      expect(prisma.decisionEvaluation.create).toHaveBeenCalledTimes(2);
      expect(prisma.decisionCandidate.update).toHaveBeenCalledTimes(2);
      expect(prisma.decisionVerdict.create).toHaveBeenCalledTimes(1);
      expect(prisma.decisionSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DECIDED' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECISION_EVALUATE', status: 'SUCCESS' }),
      );
    });

    it('rejects evaluating an overridden session', async () => {
      const { svc, prisma } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        workspaceId: 'ws-1',
        overridden: true,
        mode: 'STRATEGIC',
      });
      await expect(svc.evaluateCandidates('ws-1', 'user-1', 'sess-1', CTX)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects evaluating with no candidates', async () => {
      const { svc, prisma } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        workspaceId: 'ws-1',
        overridden: false,
        mode: 'STRATEGIC',
        objective: 'x',
        version: 1,
        metadata: {},
      });
      prisma.decisionCandidate.findMany.mockResolvedValue([]);
      await expect(svc.evaluateCandidates('ws-1', 'user-1', 'sess-1', CTX)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getTrace', () => {
    it('throws when the session is missing', async () => {
      const { svc } = makeService();
      await expect(svc.getTrace('ws-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when no verdict exists', async () => {
      const { svc, prisma } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({ id: 'sess-1', workspaceId: 'ws-1' });
      prisma.decisionVerdict.findFirst.mockResolvedValue(null);
      await expect(svc.getTrace('ws-1', 'sess-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the verdict, winner, evaluations and alternatives', async () => {
      const { svc, prisma } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({ id: 'sess-1', workspaceId: 'ws-1' });
      prisma.decisionVerdict.findFirst.mockResolvedValue({ id: 'v1', kind: 'SELECTED' });
      prisma.decisionCandidate.findMany.mockResolvedValue([
        { id: 'c1', label: 'strong', selected: true, admissible: true },
        { id: 'c2', label: 'weak', selected: false, admissible: true },
      ]);
      prisma.decisionEvaluation.findMany.mockResolvedValue([{ id: 'e1', score: 0.8 }]);
      const trace: any = await svc.getTrace('ws-1', 'sess-1');
      expect(trace.verdict.id).toBe('v1');
      expect(trace.winner.label).toBe('strong');
      expect(trace.evaluations).toHaveLength(1);
      expect(trace.alternatives).toHaveLength(1);
    });
  });

  describe('validateSession', () => {
    it('persists a validation, evidence, history and audits', async () => {
      const { svc, prisma, audit } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'STRATEGIC',
        constitutionalRef: 'DECISION_SESSION',
        metadata: { founderGuided: false },
      });
      prisma.decisionCandidate.findMany.mockResolvedValue([{ id: 'c1', admissible: true }]);
      prisma.decisionContext.findMany.mockResolvedValue([
        { runtime: 'REASONING', role: 'REASONING', weight: 1, confidence: 1 },
        { runtime: 'PLANNING', role: 'PLAN', weight: 1, confidence: 1 },
        { runtime: 'CAPITAL', role: 'CAPITAL', weight: 1, confidence: 0.9 },
      ]);
      prisma.decisionEvidence.count.mockResolvedValue(2);

      const result: any = await svc.validateSession('ws-1', 'user-1', 'sess-1', CTX);
      expect(result.validation.checks).toHaveLength(6);
      expect(result.validation.valid).toBe(true);
      expect(prisma.decisionValidation.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECISION_VALIDATE', status: 'SUCCESS' }),
      );
    });
  });

  describe('override', () => {
    it('locks the session immutably, records evidence, history and audits', async () => {
      const { svc, prisma, audit } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        status: 'DECIDED',
      });
      const result: any = await svc.override(
        'ws-1',
        'user-1',
        'sess-1',
        { directive: 'Founder halts this decision' } as any,
        CTX,
      );
      expect(result.status).toBe('OVERRIDDEN');
      expect(result.overridden).toBe(true);
      expect(prisma.decisionEvidence.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DECISION_OVERRIDE', status: 'SUCCESS' }),
      );
    });

    it('rejects an empty directive', async () => {
      const { svc, prisma } = makeService();
      prisma.decisionSession.findFirst.mockResolvedValue({ id: 'sess-1', workspaceId: 'ws-1' });
      await expect(
        svc.override('ws-1', 'user-1', 'sess-1', { directive: '  ' } as any, CTX),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('dashboard', () => {
    it('aggregates counts, byMode, byVerdict, supported modes and reused runtimes', async () => {
      const { svc, prisma } = makeService();
      prisma.decisionSession.count.mockResolvedValue(3);
      prisma.decisionVerdict.count.mockResolvedValue(2);
      prisma.decisionValidation.count.mockResolvedValue(1);
      const groupBy = prisma.decisionSession.groupBy as jest.Mock;
      groupBy
        .mockResolvedValueOnce([{ mode: 'STRATEGIC', _count: { _all: 3 } }])
        .mockResolvedValueOnce([{ verdict: 'SELECTED', _count: { _all: 2 } }]);

      const dash: any = await svc.dashboard('ws-1');
      expect(dash.sessions.total).toBe(3);
      expect(dash.byMode).toEqual([{ mode: 'STRATEGIC', count: 3 }]);
      expect(dash.byVerdict).toEqual([{ verdict: 'SELECTED', count: 2 }]);
      expect(dash.supportedModes).toHaveLength(8);
      expect(dash.reusedRuntimes).toContain('REASONING');
      expect(dash.reusedRuntimes).toContain('PLANNING');
    });
  });
});

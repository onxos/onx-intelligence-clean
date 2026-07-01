import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanningService } from './planning.service';

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
    planningSession: model(),
    planningContext: model(),
    planningGoal: model(),
    planningConstraint: model(),
    planningStrategy: model(),
    planningPlan: model(),
    planningStep: model(),
    planningMilestone: model(),
    planningEvidence: model(),
    planningValidation: model(),
    planningHistory: model(),
  };
  prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
  return prisma;
}

describe('PlanningService', () => {
  let prisma: any;
  let audit: any;
  let evidence: any;
  let svc: PlanningService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = { log: jest.fn().mockResolvedValue(null) };
    evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) };
    svc = new PlanningService(prisma, audit, evidence);
  });

  describe('startPlanning', () => {
    it('persists the session, contexts, goals, constraints and audits', async () => {
      const res = await svc.startPlanning('ws-1', 'user-1', {
        mode: 'STRATEGIC',
        objective: 'Grow flourishing',
        goals: [{ title: 'Raise trust', priority: 5, measurable: true }],
        constraints: [{ name: 'budget', satisfied: true }],
        contexts: [{ runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 }],
        resources: [{ name: 'team', available: true }],
      } as any);

      expect(prisma.planningSession.create).toHaveBeenCalled();
      expect(prisma.planningContext.create).toHaveBeenCalledTimes(1);
      expect(prisma.planningGoal.create).toHaveBeenCalledTimes(1);
      expect(prisma.planningConstraint.create).toHaveBeenCalledTimes(1);
      expect(prisma.planningHistory.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLANNING_START', success: true }),
      );
      expect(res.status).toBe('PLANNING');
    });

    it('rejects an empty objective', async () => {
      await expect(
        svc.startPlanning('ws-1', 'user-1', { mode: 'STRATEGIC', objective: '   ' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('generatePlan', () => {
    beforeEach(() => {
      prisma.planningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'STRATEGIC',
        objective: 'Grow flourishing',
        overridden: false,
        version: 1,
        constraintsSatisfied: true,
        constitutionalRef: 'PLANNING:session',
        metadata: { founderGuided: false, planningResources: [{ name: 'team', available: true }] },
      });
      prisma.planningGoal.findMany.mockResolvedValue([
        { title: 'Raise trust', description: 'x', priority: 5, weight: 1, measurable: true },
        { title: 'Expand knowledge', description: 'y', priority: 3, weight: 1, measurable: true },
      ]);
      prisma.planningConstraint.findMany.mockResolvedValue([
        { name: 'budget', satisfied: true, weight: 1, required: true },
      ]);
      prisma.planningContext.findMany.mockResolvedValue([
        { runtime: 'D16', role: 'KNOWLEDGE', weight: 1, confidence: 1 },
        { runtime: 'REASONING', role: 'REASONING', weight: 1, confidence: 1 },
      ]);
    });

    it('runs the pipeline, persists the primary plan + steps + milestones and audits', async () => {
      const res = await svc.generatePlan('ws-1', 'user-1', 's-1');

      expect(prisma.planningStrategy.create).toHaveBeenCalled();
      expect(prisma.planningPlan.create).toHaveBeenCalled();
      expect(prisma.planningStep.create).toHaveBeenCalledTimes(4);
      expect(prisma.planningMilestone.create).toHaveBeenCalledTimes(2);
      expect(prisma.planningSession.update).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLANNING_GENERATE', success: true }),
      );
      expect(res.outcome.readiness).toBe('EXECUTABLE');
    });

    it('creates one alternative plan per derived alternative', async () => {
      await svc.generatePlan('ws-1', 'user-1', 's-1');
      // 1 primary + 3 alternative plans
      expect(prisma.planningPlan.create).toHaveBeenCalledTimes(4);
    });

    it('rejects generation on an overridden session', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        overridden: true,
      });
      await expect(svc.generatePlan('ws-1', 'user-1', 's-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getPlan', () => {
    it('throws when session missing', async () => {
      prisma.planningSession.findFirst.mockResolvedValue(null);
      await expect(svc.getPlan('ws-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when no plan has been generated', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({ id: 's-1', workspaceId: 'ws-1' });
      prisma.planningPlan.findFirst.mockResolvedValue(null);
      await expect(svc.getPlan('ws-1', 's-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the plan with steps, milestones and alternatives', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({ id: 's-1', workspaceId: 'ws-1' });
      prisma.planningPlan.findFirst.mockResolvedValue({ id: 'p-1', primary: true });
      prisma.planningStep.findMany.mockResolvedValue([{ id: 'st-1' }]);
      prisma.planningMilestone.findMany.mockResolvedValue([{ id: 'm-1' }]);
      const res = await svc.getPlan('ws-1', 's-1');
      expect(res.plan.id).toBe('p-1');
      expect(res.steps).toHaveLength(1);
      expect(res.milestones).toHaveLength(1);
    });
  });

  describe('validateSession', () => {
    it('persists a validation record + evidence + history and audits (valid)', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'STRATEGIC',
        constraintsSatisfied: true,
        riskLevel: 'LOW',
        constitutionalRef: 'PLANNING:session',
        metadata: { founderGuided: false, planningResources: [{ name: 'team', available: true }] },
      });
      prisma.planningGoal.findMany.mockResolvedValue([
        { title: 'Raise trust', description: 'x', priority: 5, weight: 1, measurable: true },
      ]);
      prisma.planningContext.findMany.mockResolvedValue([
        { runtime: 'REASONING', role: 'REASONING', weight: 1, confidence: 1 },
      ]);

      const res = await svc.validateSession('ws-1', 'user-1', 's-1');
      expect(prisma.planningValidation.create).toHaveBeenCalled();
      expect(res.validation.valid).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLANNING_VALIDATE', success: true }),
      );
    });

    it('reports invalid when risk is critical', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        mode: 'STRATEGIC',
        constraintsSatisfied: false,
        riskLevel: 'CRITICAL',
        constitutionalRef: 'PLANNING:session',
        metadata: {},
      });
      prisma.planningGoal.findMany.mockResolvedValue([]);
      prisma.planningContext.findMany.mockResolvedValue([]);

      const res = await svc.validateSession('ws-1', 'user-1', 's-1');
      expect(res.validation.valid).toBe(false);
    });
  });

  describe('override', () => {
    it('locks the session immutably', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({
        id: 's-1',
        workspaceId: 'ws-1',
        ownerId: 'user-1',
        status: 'COMPLETED',
      });
      const res = await svc.override('ws-1', 'user-1', 's-1', { directive: 'freeze' } as any);
      expect(res.overridden).toBe(true);
      expect(res.status).toBe('OVERRIDDEN');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLANNING_OVERRIDE' }),
      );
    });

    it('rejects an empty directive', async () => {
      prisma.planningSession.findFirst.mockResolvedValue({ id: 's-1', workspaceId: 'ws-1' });
      await expect(
        svc.override('ws-1', 'user-1', 's-1', { directive: '  ' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('dashboard', () => {
    it('aggregates counts, modes, readiness, supported modes and reused runtimes', async () => {
      prisma.planningSession.count.mockResolvedValue(3);
      prisma.planningSession.groupBy
        .mockResolvedValueOnce([{ mode: 'STRATEGIC', _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ readiness: 'EXECUTABLE', _count: { _all: 2 } }]);
      const res = await svc.dashboard('ws-1');
      expect(res.sessions.total).toBe(3);
      expect(res.byMode[0]).toEqual({ mode: 'STRATEGIC', count: 2 });
      expect(res.byReadiness[0]).toEqual({ readiness: 'EXECUTABLE', count: 2 });
      expect(res.supportedModes).toHaveLength(8);
      expect(res.reusedRuntimes).toContain('REASONING');
      expect(res.reusedRuntimes).toContain('D16');
    });
  });
});

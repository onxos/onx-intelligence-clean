import { NotFoundException } from '@nestjs/common';
import { FicEnforcementService } from './fic-enforcement.service';

describe('FicEnforcementService', () => {
  const makeService = () => {
    const prisma = {
      $transaction: jest.fn(),
      ficEnforcementCheck: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      ficConstraintEvaluation: {
        createMany: jest.fn(),
      },
      ficEnforcementViolation: {
        createMany: jest.fn(),
      },
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const iurg = { bindFicEvent: jest.fn().mockResolvedValue({ node: { id: 'iurg-1' } }) } as any;
    const service = new FicEnforcementService(prisma, audit, evidence, iurg);
    return { prisma, audit, evidence, iurg, service };
  };

  beforeEach(() => jest.clearAllMocks());

  describe('registry reads', () => {
    it('summarizes the registry', () => {
      const { service } = makeService();
      const summary = service.getRegistrySummary();
      expect(summary.constraintCount).toBe(69);
      expect(summary.intentCount).toBe(38);
      expect(summary.conflictClassCount).toBe(7);
      expect(summary.playbookCount).toBe(10);
      expect(summary.checkSequenceSteps).toBe(13);
    });

    it('filters constraints by kind', () => {
      const { service } = makeService();
      const eb = service.listConstraints('eb');
      expect(eb.total).toBe(12);
      expect(eb.items.every((c) => c.kind === 'EB')).toBe(true);
    });

    it('gets a constraint by id (case-insensitive)', () => {
      const { service } = makeService();
      expect(service.getConstraint('hc-08').id).toBe('HC-08');
    });

    it('throws for an unknown constraint', () => {
      const { service } = makeService();
      expect(() => service.getConstraint('ZZ-99')).toThrow(NotFoundException);
    });
  });

  describe('runCheck', () => {
    it('persists an approved check with evaluations and no violations', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.ficEnforcementCheck.create.mockResolvedValue({
        id: 'chk-1',
        checkId: 'chk-1',
        createdAt: new Date('2026-07-02T00:00:00Z'),
      });

      const out = await service.runCheck(
        'ws-1',
        'user-1',
        { domains: ['clinical'], playbooks: ['clinic_operations'], signals: {} },
        { actorId: 'user-1' },
      );

      expect(out.decision).toBe('APPROVED');
      expect(prisma.ficEnforcementCheck.create).toHaveBeenCalledTimes(1);
      expect(prisma.ficConstraintEvaluation.createMany).toHaveBeenCalledTimes(1);
      // No EB/HC -> no violations persisted.
      expect(prisma.ficEnforcementViolation.createMany).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIC_ENFORCEMENT_APPROVED' }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('binds the enforcement event into the IURG', async () => {
      const { service, prisma, iurg } = makeService();
      prisma.ficEnforcementCheck.create.mockResolvedValue({
        id: 'chk-iurg',
        checkId: 'chk-iurg',
        createdAt: new Date(),
      });

      await service.runCheck(
        'ws-1',
        'user-1',
        { domains: ['clinical'], playbooks: ['clinic_operations'], signals: {} },
        { actorId: 'user-1' },
      );

      expect(iurg.bindFicEvent).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'APPROVED', sourceCheckId: 'chk-iurg' }),
      );
    });

    it('persists violations for a rejected staff-reduction decision', async () => {
      const { service, prisma, audit } = makeService();
      prisma.ficEnforcementCheck.create.mockResolvedValue({
        id: 'chk-2',
        checkId: 'chk-2',
        createdAt: new Date(),
      });

      const out = await service.runCheck(
        'ws-1',
        'user-1',
        {
          domains: ['people', 'commercial'],
          playbooks: ['revenue_optimization'],
          signals: { reducesClinicalStaffForRevenue: true },
        },
        undefined,
      );

      expect(out.decision).toBe('REJECTED');
      expect(prisma.ficEnforcementViolation.createMany).toHaveBeenCalledTimes(1);
      const violationArgs = prisma.ficEnforcementViolation.createMany.mock.calls[0][0];
      expect(violationArgs.data.some((v: any) => v.constraintId === 'EB-03')).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIC_ENFORCEMENT_REJECTED' }),
      );
    });

    it('audits a failure and rethrows when persistence fails', async () => {
      const { service, prisma, audit } = makeService();
      prisma.$transaction.mockRejectedValue(new Error('db down'));

      await expect(
        service.runCheck('ws-1', 'user-1', { domains: ['clinical'] }, undefined),
      ).rejects.toThrow('db down');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIC_ENFORCEMENT_CHECK_FAILED', success: false }),
      );
    });
  });

  describe('listChecks / getCheck', () => {
    it('lists workspace-scoped checks with pagination', async () => {
      const { service, prisma } = makeService();
      prisma.ficEnforcementCheck.count.mockResolvedValue(3);
      prisma.ficEnforcementCheck.findMany.mockResolvedValue([{ id: 'chk-1' }]);

      const out = await service.listChecks('ws-1', { decision: 'REJECTED', page: 1, pageSize: 20 });
      expect(out.total).toBe(3);
      const whereArg = prisma.ficEnforcementCheck.findMany.mock.calls[0][0].where;
      expect(whereArg).toEqual({ workspaceId: 'ws-1', decision: 'REJECTED' });
    });

    it('throws when a check is not found', async () => {
      const { service, prisma } = makeService();
      prisma.ficEnforcementCheck.findFirst.mockResolvedValue(null);
      await expect(service.getCheck('missing', 'ws-1')).rejects.toThrow(NotFoundException);
    });
  });
});

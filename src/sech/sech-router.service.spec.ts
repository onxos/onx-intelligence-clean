import { SECH_GATES, SECH_PRE_GATES } from './sech.constants';
import { SechRouterService } from './sech-router.service';

describe('SECH constants', () => {
  it('defines 4 gates in order with 3 pre-gates + 1 post-gate', () => {
    expect(SECH_GATES.map((g) => g.checkType)).toEqual([
      'pre_judgment',
      'pre_decision',
      'pre_execution',
      'post_outcome',
    ]);
    expect(SECH_PRE_GATES).toHaveLength(3);
  });
});

describe('SechRouterService', () => {
  const makeService = () => {
    const created: any[] = [];
    const prisma = {
      sechRoute: {
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `route-${created.length + 1}`,
            routeId: `RT-${created.length + 1}`,
            ...data,
          };
          created.push(row);
          return row;
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const fic = { runCheck: jest.fn() } as any;
    const service = new SechRouterService(prisma, audit, fic);
    return { prisma, audit, fic, service, created };
  };

  // A FicEnforcementService.runCheck-like result.
  const ficResult = (decision: string, overrides: Record<string, unknown> = {}) => ({
    id: `chk-${decision}`,
    checkId: `chk-${decision}`,
    decision,
    reason: `${decision} reason`,
    counterProposal: decision === 'REJECTED' ? 'Revise the proposal.' : null,
    requiresHumanApproval: decision === 'CONFLICT',
    softFlags: [],
    requiredGates: [],
    applicableConstraintIds: [],
    activeOverrides: decision === 'OVERRIDE' ? ['OR-01'] : [],
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  it('APPROVED flow: runs all 4 gates and completes', async () => {
    const { service, fic, prisma } = makeService();
    fic.runCheck.mockResolvedValue(ficResult('APPROVED'));

    const out = await service.route('ws-1', 'user-1', { domains: ['clinical'] });

    expect(fic.runCheck).toHaveBeenCalledTimes(4); // 3 pre + post
    expect(out.status).toBe('COMPLETED');
    expect(out.finalDecision).toBe('APPROVED');
    expect(out.executed).toBe(true);
    expect(out.outcomeValidated).toBe(true);
    expect(out.gateResults.map((g: any) => g.checkType)).toEqual([
      'pre_judgment',
      'pre_decision',
      'pre_execution',
      'post_outcome',
    ]);
    expect(prisma.sechRoute.create).toHaveBeenCalledTimes(1);
  });

  it('attaches conditions on APPROVED (soft flags + OVR tracking)', async () => {
    const { service, fic } = makeService();
    fic.runCheck.mockResolvedValue(
      ficResult('APPROVED', { softFlags: ['SC-09'], applicableConstraintIds: ['OVR-02'] }),
    );
    const out = await service.route('ws-1', 'user-1', { domains: ['commercial'] });
    expect(out.conditions.some((c: string) => c.startsWith('SC-09'))).toBe(true);
    expect(out.conditions.some((c: string) => c.startsWith('OVR-02'))).toBe(true);
  });

  it('REJECTED flow: stops at the first rejecting gate with a counter-proposal', async () => {
    const { service, fic } = makeService();
    fic.runCheck.mockResolvedValueOnce(ficResult('REJECTED')); // pre_judgment rejects

    const out = await service.route('ws-1', 'user-1', {
      domains: ['people'],
      signals: { reducesClinicalStaffForRevenue: true },
    });

    expect(fic.runCheck).toHaveBeenCalledTimes(1); // stopped immediately
    expect(out.status).toBe('REJECTED');
    expect(out.counterProposal).toBe('Revise the proposal.');
    expect(out.executed).toBe(false);
  });

  it('CONFLICT flow: pauses and escalates for human resolution', async () => {
    const { service, fic } = makeService();
    fic.runCheck
      .mockResolvedValueOnce(ficResult('APPROVED')) // pre_judgment
      .mockResolvedValueOnce(ficResult('CONFLICT')); // pre_decision conflicts

    const out = await service.route('ws-1', 'user-1', { domains: ['commercial'] });

    expect(fic.runCheck).toHaveBeenCalledTimes(2);
    expect(out.status).toBe('CONFLICT');
    expect(out.requiresHumanApproval).toBe(true);
    expect(out.escalated).toBe(true);
    expect(out.executed).toBe(false);
  });

  it('OVERRIDE flow: passes gates under a time-bound override + executes', async () => {
    const { service, fic } = makeService();
    fic.runCheck
      .mockResolvedValueOnce(ficResult('APPROVED')) // pre_judgment
      .mockResolvedValueOnce(ficResult('OVERRIDE')) // pre_decision override
      .mockResolvedValueOnce(ficResult('APPROVED')) // pre_execution
      .mockResolvedValueOnce(ficResult('APPROVED')); // post_outcome

    const out = await service.route('ws-1', 'user-1', {
      domains: ['clinical'],
      gateSignals: { pre_decision: { emergencyMedical: true } },
    });

    expect(fic.runCheck).toHaveBeenCalledTimes(4);
    expect(out.status).toBe('OVERRIDE');
    expect(out.finalDecision).toBe('OVERRIDE');
    expect(out.overrideExpiresAt).toBeInstanceOf(Date);
    expect(out.executed).toBe(true);
  });

  it('fail-safe: a FIC exception defaults the gate to REJECTED', async () => {
    const { service, fic, audit } = makeService();
    fic.runCheck.mockRejectedValueOnce(new Error('fic down'));

    const out = await service.route('ws-1', 'user-1', { domains: ['clinical'] });

    expect(out.status).toBe('REJECTED');
    expect(out.gateResults[0].failSafe).toBe(true);
    expect(out.executed).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SECH_GATE_FAILSAFE', success: false }),
    );
  });

  it('post-outcome misalignment flags the outcome without rolling back execution', async () => {
    const { service, fic } = makeService();
    fic.runCheck
      .mockResolvedValueOnce(ficResult('APPROVED')) // pre_judgment
      .mockResolvedValueOnce(ficResult('APPROVED')) // pre_decision
      .mockResolvedValueOnce(ficResult('APPROVED')) // pre_execution
      .mockResolvedValueOnce(ficResult('REJECTED')); // post_outcome misaligned

    const out = await service.route('ws-1', 'user-1', { domains: ['clinical'] });

    expect(out.executed).toBe(true);
    expect(out.outcomeValidated).toBe(false);
    expect(out.status).toBe('COMPLETED');
  });

  it('passes the per-gate checkType through to FIC', async () => {
    const { service, fic } = makeService();
    fic.runCheck.mockResolvedValue(ficResult('APPROVED'));
    await service.route('ws-1', 'user-1', { domains: ['clinical'] });
    const checkTypes = fic.runCheck.mock.calls.map((c: any[]) => c[2].checkType);
    expect(checkTypes).toEqual(['pre_judgment', 'pre_decision', 'pre_execution', 'post_outcome']);
  });

  describe('reads', () => {
    it('lists pending (CONFLICT) routes', async () => {
      const { service, prisma } = makeService();
      prisma.sechRoute.count.mockResolvedValue(1);
      prisma.sechRoute.findMany.mockResolvedValue([{ id: 'route-1', status: 'CONFLICT' }]);
      const out = await service.listPending('ws-1', {});
      expect(out.total).toBe(1);
      expect(prisma.sechRoute.findMany.mock.calls[0][0].where).toEqual({
        workspaceId: 'ws-1',
        status: 'CONFLICT',
      });
    });

    it('returns gates status with the last route', async () => {
      const { service, prisma } = makeService();
      prisma.sechRoute.findFirst.mockResolvedValue({
        id: 'route-1',
        routeId: 'RT-1',
        status: 'COMPLETED',
        finalDecision: 'APPROVED',
        gateResults: [],
        createdAt: new Date(),
      });
      const out = await service.gatesStatus('ws-1');
      expect(out.gates).toHaveLength(4);
      expect(out.lastRoute?.status).toBe('COMPLETED');
    });
  });
});

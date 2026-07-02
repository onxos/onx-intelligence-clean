import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DECISION_LADDER_STEPS,
  MAX_ITERATIONS,
  NEXT_STEP,
  stageForStep,
} from './decision-ladder.constants';
import { DecisionLadderService } from './decision-ladder.service';

describe('decision ladder constants', () => {
  it('defines 14 steps across 5 stages', () => {
    expect(DECISION_LADDER_STEPS).toHaveLength(14);
    expect(DECISION_LADDER_STEPS[0].step).toBe('D1');
    expect(DECISION_LADDER_STEPS[13].step).toBe('D14');
    expect(stageForStep('D1')).toBe('PERCEPTION');
    expect(stageForStep('D5')).toBe('UNDERSTANDING');
    expect(stageForStep('D8')).toBe('JUDGMENT');
    expect(stageForStep('D11')).toBe('LEARNING');
    expect(stageForStep('D14')).toBe('GROWTH');
  });

  it('D1-D9 auto-progress, D10-D14 gated', () => {
    expect(DECISION_LADDER_STEPS.slice(0, 9).every((s) => s.auto)).toBe(true);
    expect(DECISION_LADDER_STEPS.slice(9).every((s) => !s.auto)).toBe(true);
  });

  it('links each step to its successor (D14 terminal)', () => {
    expect(NEXT_STEP['D9']).toBe('D10');
    expect(NEXT_STEP['D13']).toBe('D14');
    expect(NEXT_STEP['D14']).toBeNull();
  });
});

describe('DecisionLadderService', () => {
  let idSeq = 0;
  const makeService = () => {
    idSeq = 0;
    const store: any[] = [];
    const prisma = {
      usfipPerceptionRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'perc-1',
          recordId: 'RC-1',
          classifiedDomain: 'clinical',
          sourceType: 'emr',
          rawPayload: { summary: 'observed pattern' },
        }),
      },
      decisionRun: {
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `run-${(idSeq += 1)}`,
            runId: `RUN-${idSeq}`,
            iterationCount: 0,
            ficCheckIds: [],
            sechRouteIds: [],
            ...data,
          };
          store.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = store.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          return store.find((r) => r.id === (where.OR?.[0]?.id ?? where.id)) ?? null;
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const sech = { route: jest.fn() } as any;
    const service = new DecisionLadderService(prisma, audit, sech);
    return { prisma, audit, sech, service, store };
  };

  const route = (status: string) => ({
    id: `route-${status}`,
    status,
    gateResults: [
      {
        gate: 'PRE_JUDGMENT',
        checkType: 'pre_decision',
        checkId: `chk-${status}`,
        decision: status,
      },
    ],
  });

  beforeEach(() => jest.clearAllMocks());

  it('start: auto-runs D1-D9 and lands ACTIVE at D9 when the FIC check APPROVES', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('COMPLETED'));
    const run = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });
    expect(run.currentStep).toBe('D9');
    expect(run.currentStage).toBe('JUDGMENT');
    expect(run.status).toBe('ACTIVE');
    expect(run.stepHistory.map((h: any) => h.step)).toContain('D8');
    expect(run.ficCheckIds).toContain('chk-COMPLETED');
    expect(sech.route).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      expect.objectContaining({ checkType: 'pre_decision', domains: ['clinical'] }),
      undefined,
    );
  });

  it('start: REJECTED at D8 abandons the ladder', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('REJECTED'));
    const run = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });
    expect(run.status).toBe('ABANDONED');
    expect(run.currentStep).toBe('D8');
    expect(run.finalDecision).toBe('REJECTED');
  });

  it('start: CONFLICT at D8 pauses the ladder for human escalation', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('CONFLICT'));
    const run = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });
    expect(run.status).toBe('PAUSED');
    expect(run.humanGateRequired).toBe(true);
    expect(run.humanGateType).toBe('CONFLICT');
  });

  it('start: unknown perception throws NotFound', async () => {
    const { service, prisma } = makeService();
    prisma.usfipPerceptionRecord.findFirst.mockResolvedValue(null);
    await expect(service.start('ws-1', 'user-1', { perceptionId: 'nope' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('D10 human gate: a configured DG pauses at D10 and resolves via approve', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('COMPLETED'));
    const started = await service.start('ws-1', 'user-1', {
      perceptionId: 'RC-1',
      humanGateType: 'DG-01',
    });
    expect(started.currentStep).toBe('D9');

    // Advance D9 -> D10 pauses for the gate.
    const gated = await service.advance(started.id, 'ws-1', 'user-1');
    expect(gated.currentStep).toBe('D10');
    expect(gated.status).toBe('PAUSED');
    expect(gated.humanGateRequired).toBe(true);

    // Advancing while gated is rejected.
    await expect(service.advance(started.id, 'ws-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );

    // Approve resolves the gate and resumes.
    const approved = await service.approve(started.id, 'ws-1', 'founder', { approver: 'founder' });
    expect(approved.status).toBe('ACTIVE');
    expect(approved.humanGateRequired).toBe(false);
    expect(approved.finalDecision).toBe(approved.subject);
  });

  it('full happy path: D9 -> D14 with post_outcome pass, then DG-10 promotes to a rule', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('COMPLETED')); // pre_decision + post_outcome both approve
    const started = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });

    let run = await service.advance(started.id, 'ws-1', 'user-1'); // D9 -> D10
    expect(run.currentStep).toBe('D10');
    run = await service.advance(started.id, 'ws-1', 'user-1'); // D10 -> D11
    expect(run.currentStep).toBe('D11');
    run = await service.advance(started.id, 'ws-1', 'user-1'); // D11 -> D12
    run = await service.advance(started.id, 'ws-1', 'user-1'); // D12 -> D13
    expect(run.currentStep).toBe('D13');

    // D13 -> D14: post_outcome APPROVES -> DG-10 gate.
    run = await service.advance(started.id, 'ws-1', 'user-1');
    expect(run.currentStep).toBe('D14');
    expect(run.outcomeValidated).toBe(true);
    expect(run.humanGateRequired).toBe(true);
    expect(run.humanGateType).toBe('DG-10');

    // Founder approval promotes to an institutional rule.
    const promoted = await service.approve(started.id, 'ws-1', 'founder', { approver: 'founder' });
    expect(promoted.status).toBe('PROMOTED');
    expect(promoted.promotedToRule).toBe(true);
    expect(promoted.ruleId).toMatch(/^RULE-/);
  });

  it('loop guard: repeated post_outcome failure pauses after MAX_ITERATIONS (no infinite loop)', async () => {
    const { service, sech } = makeService();
    // pre_decision approves so the run reaches D13; post_outcome then fails repeatedly.
    sech.route.mockResolvedValueOnce(route('COMPLETED')); // start pre_decision
    const started = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });
    await service.advance(started.id, 'ws-1', 'user-1'); // D10
    await service.advance(started.id, 'ws-1', 'user-1'); // D11
    await service.advance(started.id, 'ws-1', 'user-1'); // D12
    await service.advance(started.id, 'ws-1', 'user-1'); // D13

    sech.route.mockResolvedValue(route('REJECTED')); // every post_outcome fails
    let run = started;
    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      run = await service.getRun(started.id, 'ws-1');
      if (run.humanGateRequired) break;
      run = await service.advance(started.id, 'ws-1', 'user-1');
      expect(run.currentStep).toBe('D13'); // never advances past D13 on failure
    }
    const finalRun = await service.getRun(started.id, 'ws-1');
    expect(finalRun.iterationCount).toBe(MAX_ITERATIONS);
    expect(finalRun.status).toBe('PAUSED');
    expect(finalRun.humanGateRequired).toBe(true);
  });

  it('abandon: marks the run ABANDONED', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('COMPLETED'));
    const started = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });
    const out = await service.abandon(started.id, 'ws-1', 'user-1');
    expect(out.status).toBe('ABANDONED');
  });

  it('approve without a pending gate is rejected', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(route('COMPLETED'));
    const started = await service.start('ws-1', 'user-1', { perceptionId: 'RC-1' });
    await expect(service.approve(started.id, 'ws-1', 'user-1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('reads', () => {
    it('stats groups by stage + status', async () => {
      const { service, prisma } = makeService();
      prisma.decisionRun.groupBy
        .mockResolvedValueOnce([{ currentStage: 'JUDGMENT', _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ status: 'ACTIVE', _count: { _all: 2 } }]);
      prisma.decisionRun.count.mockResolvedValue(2);
      const out = await service.stats('ws-1');
      expect(out.total).toBe(2);
      expect(out.byStage.JUDGMENT).toBe(2);
      expect(out.byStatus.ACTIVE).toBe(2);
    });

    it('pendingGates filters humanGateRequired', async () => {
      const { service, prisma } = makeService();
      prisma.decisionRun.count.mockResolvedValue(1);
      prisma.decisionRun.findMany.mockResolvedValue([{ id: 'run-1' }]);
      const out = await service.pendingGates('ws-1', {});
      expect(out.total).toBe(1);
      expect(prisma.decisionRun.findMany.mock.calls[0][0].where).toEqual({
        workspaceId: 'ws-1',
        humanGateRequired: true,
      });
    });
  });
});

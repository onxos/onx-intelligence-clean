import { BadRequestException, NotFoundException } from '@nestjs/common';
import { scoreFounderAlignment, tierForStatus } from './judgment.constants';
import { JudgmentService } from './judgment.service';

describe('judgment constants (HC-10)', () => {
  it('scores founder alignment within [0,1] and finds applicable intents', () => {
    const out = scoreFounderAlignment('clinical');
    expect(out.alignment).toBeGreaterThanOrEqual(0.6);
    expect(out.alignment).toBeLessThanOrEqual(1);
    expect(out.applicableIntentIds.length).toBeGreaterThan(0);
  });

  it('maps status to reality tier', () => {
    expect(tierForStatus('institutional')).toBe('proven');
    expect(tierForStatus('validated')).toBe('probable');
    expect(tierForStatus('preliminary')).toBe('speculative');
  });
});

describe('JudgmentService', () => {
  let seq = 0;
  const makeService = () => {
    seq = 0;
    const store: any[] = [];
    const prisma = {
      understandingObject: { findFirst: jest.fn() },
      judgmentObject: {
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `jd-${(seq += 1)}`,
            judgmentId: `JD-${seq}`,
            validationCount: 0,
            incorrectCount: 0,
            validationBranches: [],
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
        findFirst: jest.fn(
          async ({ where }: any) =>
            store.find((r) => r.id === (where.OR?.[0]?.id ?? where.id)) ?? null,
        ),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const sech = { route: jest.fn() } as any;
    const iurg = {
      findNodeBySourceCheck: jest.fn().mockResolvedValue({ nodeType: 'ENFORCEMENT', id: 'iurg-1' }),
      createLink: jest.fn().mockResolvedValue({ edgeId: 'EDGE-1' }),
    } as any;
    const service = new JudgmentService(prisma, audit, sech, iurg);
    return { prisma, audit, sech, iurg, service, store };
  };

  const understanding = (tier = 'probable', confidence = 0.8) => ({
    id: 'un-1',
    understandingId: 'UN-1',
    domain: 'clinical',
    realityTier: tier,
    confidence,
  });
  const route = (status: string) => ({
    id: `route-${status}`,
    status,
    gateResults: [{ checkId: `chk-${status}` }],
  });

  beforeEach(() => jest.clearAllMocks());

  it('form: rejects understanding below probable (Knowledge != Judgment guard)', async () => {
    const { service, prisma, sech } = makeService();
    prisma.understandingObject.findFirst.mockResolvedValue(understanding('speculative'));
    await expect(service.form('ws-1', 'user-1', { understandingId: 'UN-1' })).rejects.toThrow(
      BadRequestException,
    );
    expect(sech.route).not.toHaveBeenCalled();
  });

  it('form: builds a preliminary judgment + realized_as edge on FIC PASS', async () => {
    const { service, prisma, sech, iurg } = makeService();
    prisma.understandingObject.findFirst.mockResolvedValue(understanding('probable'));
    sech.route.mockResolvedValue(route('COMPLETED'));
    const out = await service.form('ws-1', 'user-1', { understandingId: 'UN-1' });
    expect(out.status).toBe('preliminary');
    expect(out.realityTier).toBe('speculative'); // outcome-unproven at formation
    expect(out.constraintCheck).toBe('PASS');
    expect(out.founderAlignment).toBeGreaterThan(0);
    expect(iurg.createLink).toHaveBeenCalledWith(
      'ws-1',
      'REALIZED_AS',
      expect.objectContaining({ type: 'UNDERSTANDING' }),
      expect.objectContaining({ type: 'JUDGMENT' }),
      'JUDGMENT_FORMATION',
    );
  });

  it('form: FIC FAIL yields a rejected judgment (no edge)', async () => {
    const { service, prisma, sech, iurg } = makeService();
    prisma.understandingObject.findFirst.mockResolvedValue(understanding('proven'));
    sech.route.mockResolvedValue(route('REJECTED'));
    const out = await service.form('ws-1', 'user-1', {
      understandingId: 'UN-1',
      signals: { profitOverCare: true },
    });
    expect(out.status).toBe('rejected');
    expect(out.constraintCheck).toBe('FAIL');
    expect(iurg.createLink).not.toHaveBeenCalled();
  });

  it('validate + DG-09 ladder: 3 correct outcomes promote to validated', async () => {
    const { service, prisma, sech } = makeService();
    prisma.understandingObject.findFirst.mockResolvedValue(understanding('probable'));
    sech.route.mockResolvedValue(route('COMPLETED'));
    const j = await service.form('ws-1', 'user-1', { understandingId: 'UN-1' });

    // Fewer than 3 correct -> DG-09 blocked.
    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b1' });
    await expect(service.promote(j.id, 'ws-1', 'ops', {})).rejects.toThrow(BadRequestException);

    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b1' });
    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b1' });
    const validated = await service.promote(j.id, 'ws-1', 'ops', { approver: 'ops-manager' });
    expect(validated.status).toBe('validated');
    expect(validated.realityTier).toBe('probable');
  });

  it('DG-10 ladder: institutional requires 2+ branches', async () => {
    const { service, prisma, sech } = makeService();
    prisma.understandingObject.findFirst.mockResolvedValue(understanding('probable'));
    sech.route.mockResolvedValue(route('COMPLETED'));
    const j = await service.form('ws-1', 'user-1', { understandingId: 'UN-1' });
    // 3 correct at ONE branch -> validated but not institutional-eligible.
    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b1' });
    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b1' });
    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b1' });
    await service.promote(j.id, 'ws-1', 'ops', {});

    await expect(service.promote(j.id, 'ws-1', 'founder', {})).rejects.toThrow(BadRequestException);

    // Add a 2nd branch -> DG-10 institutionalizes.
    await service.validate(j.id, 'ws-1', 'user-1', { correct: true, branch: 'b2' });
    const inst = await service.promote(j.id, 'ws-1', 'founder', { approver: 'founder' });
    expect(inst.status).toBe('institutional');
    expect(inst.realityTier).toBe('proven');
    expect(inst.ruleId).toMatch(/^RULE-/);
  });

  it('getObject throws NotFound for missing judgment', async () => {
    const { service } = makeService();
    await expect(service.getObject('nope', 'ws-1')).rejects.toThrow(NotFoundException);
  });

  it('stats groups by status + reality tier', async () => {
    const { service, prisma } = makeService();
    prisma.judgmentObject.groupBy
      .mockResolvedValueOnce([{ status: 'preliminary', _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ realityTier: 'speculative', _count: { _all: 2 } }]);
    prisma.judgmentObject.count.mockResolvedValue(2);
    const out = await service.stats('ws-1');
    expect(out.total).toBe(2);
    expect(out.byStatus.preliminary).toBe(2);
  });
});

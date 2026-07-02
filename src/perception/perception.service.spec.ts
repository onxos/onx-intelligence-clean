import {
  EVIDENCE_TIERS,
  SOURCE_DEFAULT_DOMAIN,
  SOURCE_DEFAULT_TIER,
  isValidTier,
  tierWeight,
} from './perception.constants';
import { PerceptionService } from './perception.service';

describe('perception constants (AC-05)', () => {
  it('defines the 4-tier evidence hierarchy with descending weights', () => {
    expect(EVIDENCE_TIERS[1].weight).toBe(1.0);
    expect(EVIDENCE_TIERS[2].weight).toBe(0.95);
    expect(EVIDENCE_TIERS[3].weight).toBe(0.75);
    expect(EVIDENCE_TIERS[4].weight).toBe(0.5);
  });

  it('maps operational sources to tier 1 and defaults domains', () => {
    expect(SOURCE_DEFAULT_TIER.emr).toBe(1);
    expect(SOURCE_DEFAULT_TIER.crm).toBe(1);
    expect(SOURCE_DEFAULT_TIER.pos).toBe(1);
    expect(SOURCE_DEFAULT_DOMAIN.emr).toBe('clinical');
    expect(SOURCE_DEFAULT_DOMAIN.pos).toBe('commercial');
  });

  it('validates tiers', () => {
    expect(isValidTier(1)).toBe(true);
    expect(isValidTier(5)).toBe(false);
    expect(tierWeight(2)).toBe(0.95);
  });
});

describe('PerceptionService', () => {
  const makeService = () => {
    const created: any[] = [];
    const prisma = {
      usfipPerceptionRecord: {
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `rec-${created.length + 1}`,
            recordId: `RC-${created.length + 1}`,
            ...data,
          };
          created.push(row);
          return row;
        }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      sechRoute: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const sech = { route: jest.fn() } as any;
    const iurg = {
      findNodeBySourceCheck: jest.fn().mockResolvedValue(null),
      getEdgesForNode: jest.fn().mockResolvedValue({ edges: [] }),
    } as any;
    const service = new PerceptionService(prisma, audit, sech, iurg);
    return { prisma, audit, sech, iurg, service, created };
  };

  const routeResult = (status: string, extra: Record<string, unknown> = {}) => ({
    id: `route-${status}`,
    routeId: `RT-${status}`,
    status,
    finalDecision: status === 'COMPLETED' ? 'APPROVED' : status,
    gateResults: [
      { gate: 'PRE_JUDGMENT', checkType: 'pre_judgment', checkId: 'chk-1', decision: 'APPROVED' },
    ],
    counterProposal: status === 'REJECTED' ? 'Revise.' : null,
    ...extra,
  });

  beforeEach(() => jest.clearAllMocks());

  it('ingest APPROVED: runs the full 5-step pipeline and links the IURG node', async () => {
    const { service, sech, iurg, prisma } = makeService();
    sech.route.mockResolvedValue(routeResult('COMPLETED'));
    iurg.findNodeBySourceCheck.mockResolvedValue({
      nodeType: 'ENFORCEMENT',
      id: 'iurg-1',
      iurgId: 'IURG-x',
    });

    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'emr',
      rawPayload: { summary: 'vitals recorded' },
    });

    expect(out.status).toBe('approved');
    expect(out.classifiedDomain).toBe('clinical');
    expect(out.evidenceTier).toBe(1);
    expect(out.evidenceScore).toBe(1.0);
    expect(out.iurgNodeId).toBe('iurg-1');
    expect(out.pipeline.map((s: any) => s.name)).toEqual([
      'VALIDATE',
      'CLASSIFY',
      'RANK',
      'FIC_CHECK',
      'ROUTE',
    ]);
    expect(sech.route).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      expect.objectContaining({ checkType: 'pre_judgment', domains: ['clinical'] }),
      undefined,
    );
    expect(prisma.usfipPerceptionRecord.create).toHaveBeenCalledTimes(1);
  });

  it('ingest REJECTED: SECH blocks the perception', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(routeResult('REJECTED'));

    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'pos',
      rawPayload: { signals: { reducesClinicalStaffForRevenue: true } },
    });

    expect(out.status).toBe('rejected');
    expect(out.reason).toBeTruthy();
  });

  it('ingest CONFLICT: flagged for human review', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(routeResult('CONFLICT'));
    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'crm',
      rawPayload: { signals: { discountGate: true } },
    });
    expect(out.status).toBe('flagged');
  });

  it('AC-05: tier-3 source is flagged for human review before FIC/IURG', async () => {
    const { service, sech } = makeService();
    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'manual',
      proposedTier: 3,
      rawPayload: { note: 'consulting recommendation' },
    });
    expect(out.status).toBe('flagged');
    expect(out.evidenceTier).toBe(3);
    expect(sech.route).not.toHaveBeenCalled(); // never reaches the FIC gate
  });

  it('AC-05: tier-4 is rejected when it conflicts with existing higher-tier data', async () => {
    const { service, sech, prisma } = makeService();
    prisma.usfipPerceptionRecord.findMany.mockResolvedValue([
      { evidenceTier: 1, status: 'approved', rawPayload: { subject: 'protocol-rabies' } },
    ]);

    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'whatsapp',
      proposedTier: 4,
      proposedDomain: 'clinical',
      rawPayload: { subject: 'protocol-rabies', claim: 'change protocol' },
    });

    expect(out.status).toBe('rejected');
    expect(out.reason).toContain('AC-05');
    expect(sech.route).not.toHaveBeenCalled();
  });

  it('AC-05: tier-4 with no conflict proceeds to the FIC gate', async () => {
    const { service, sech } = makeService();
    sech.route.mockResolvedValue(routeResult('COMPLETED'));
    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'whatsapp',
      proposedTier: 4,
      rawPayload: { note: 'general web insight' },
    });
    expect(sech.route).toHaveBeenCalled();
    expect(out.status).toBe('approved');
  });

  it('validation: unknown source type is rejected without hitting the pipeline', async () => {
    const { service, sech } = makeService();
    const out = await service.ingest('ws-1', 'user-1', {
      sourceType: 'telepathy' as any,
      rawPayload: { x: 1 },
    });
    expect(out.status).toBe('rejected');
    expect(sech.route).not.toHaveBeenCalled();
  });

  it('validation: empty payload is rejected', async () => {
    const { service } = makeService();
    const out = await service.ingest('ws-1', 'user-1', { sourceType: 'emr', rawPayload: {} });
    expect(out.status).toBe('rejected');
  });

  describe('reads', () => {
    it('tierStats reports counts by tier', async () => {
      const { service, prisma } = makeService();
      prisma.usfipPerceptionRecord.groupBy.mockResolvedValue([
        { evidenceTier: 1, _count: { _all: 3 }, _avg: { evidenceScore: 1.0 } },
      ]);
      const out = await service.tierStats('ws-1');
      expect(out.total).toBe(3);
      expect(out.tiers.find((t) => t.tier === 1)?.count).toBe(3);
    });

    it('qualityReport aggregates status + tier', async () => {
      const { service, prisma } = makeService();
      prisma.usfipPerceptionRecord.groupBy
        .mockResolvedValueOnce([
          { status: 'approved', _count: { _all: 5 } },
          { status: 'flagged', _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([
          { evidenceTier: 1, _count: { _all: 5 } },
          { evidenceTier: 3, _count: { _all: 2 } },
        ]);
      prisma.usfipPerceptionRecord.count.mockResolvedValue(7);
      const out = await service.qualityReport('ws-1');
      expect(out.total).toBe(7);
      expect(out.ac05.highAuthorityCount).toBe(5);
      expect(out.ac05.flaggedForReview).toBe(2);
    });

    it('getRecord throws when missing', async () => {
      const { service, prisma } = makeService();
      prisma.usfipPerceptionRecord.findFirst.mockResolvedValue(null);
      await expect(service.getRecord('nope', 'ws-1')).rejects.toThrow();
    });
  });
});

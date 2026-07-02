import { CrossModuleAuditService } from './cross-module-audit.service';

describe('CrossModuleAuditService (D17 — Cross-Module Audit)', () => {
  const makeService = (data?: {
    patterns?: Array<{ patternId: string; perceptionIds: string[] }>;
    contexts?: Array<{ contextId: string; patternId: string }>;
    understandings?: Array<{ understandingId: string; contextId: string }>;
    judgments?: Array<{ understandingId: string }>;
  }) => {
    const prisma = {
      detectedPattern: { findMany: jest.fn(async () => data?.patterns ?? []) },
      contextualizedPattern: { findMany: jest.fn(async () => data?.contexts ?? []) },
      understandingObject: { findMany: jest.fn(async () => data?.understandings ?? []) },
      judgmentObject: { findMany: jest.fn(async () => data?.judgments ?? []) },
      crossModuleAudit: {
        create: jest.fn(async ({ data: d }: any) => ({ id: 'ca-1', auditId: 'CMA-1', ...d })),
        findFirst: jest.fn(async () => ({ id: 'ca-1', auditId: 'CMA-1' })),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new CrossModuleAuditService(prisma, audit);
    return { service, prisma, audit };
  };

  beforeEach(() => jest.clearAllMocks());

  it('reports consistent verdict when all references resolve', async () => {
    const { service, audit } = makeService({
      patterns: [{ patternId: 'P1', perceptionIds: ['PC1'] }],
      contexts: [{ contextId: 'C1', patternId: 'P1' }],
      understandings: [{ understandingId: 'U1', contextId: 'C1' }],
      judgments: [{ understandingId: 'U1' }],
    });
    const out = await service.run('ws-1', 'user-1');
    expect(out.verdict).toBe('consistent');
    expect(out.inconsistencies).toHaveLength(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CROSS_AUDIT_CONSISTENT' }),
    );
  });

  it('detects a critical orphan judgment (missing UnderstandingObject) but only reports it', async () => {
    const { service } = makeService({
      patterns: [{ patternId: 'P1', perceptionIds: ['PC1'] }],
      contexts: [{ contextId: 'C1', patternId: 'P1' }],
      understandings: [{ understandingId: 'U1', contextId: 'C1' }],
      judgments: [{ understandingId: 'MISSING' }],
    });
    const out = await service.run('ws-1', 'user-1');
    expect(out.verdict).toBe('critical');
    const inc = (out.inconsistencies as any[]).find((i) => i.moduleA === 'judgment');
    expect(inc.severity).toBe('critical');
  });

  it('flags a detected pattern with no source perceptions as minor', async () => {
    const { service } = makeService({
      patterns: [{ patternId: 'P1', perceptionIds: [] }],
    });
    const out = await service.listInconsistencies('ws-1');
    const inc = out.inconsistencies.find((i) => i.moduleA === 'usfip');
    expect(inc?.severity).toBe('minor');
  });

  it('tracks all 9 IW subsystems', async () => {
    const { service } = makeService();
    const out = await service.run('ws-1', 'user-1');
    expect(out.moduleCount).toBe(9);
  });
});

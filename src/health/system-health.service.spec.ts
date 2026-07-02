import { HEALTH_SYSTEMS, SystemHealthService } from './system-health.service';

describe('SystemHealthService (D20 — Systemic Health Monitor)', () => {
  const makeService = (failing?: string[]) => {
    const records: any[] = [];
    const counter = (system: string) =>
      jest.fn(async () => {
        if (failing?.includes(system)) {
          throw new Error(`${system} down`);
        }
        return 3;
      });
    const prisma = {
      ficEnforcementCheck: { count: counter('fic') },
      iurgEdge: { count: counter('iurg') },
      sechRoute: { count: counter('sech') },
      usfipPerceptionRecord: { count: counter('usfip') },
      decisionRun: { count: counter('decision') },
      sfisScanRecord: { count: counter('sfis') },
      understandingObject: { count: counter('understanding') },
      judgmentObject: { count: counter('judgment') },
      continuityAudit: { count: counter('continuity') },
      systemHealth: {
        create: jest.fn(async ({ data }: any) => {
          const rec = { id: `sh-${records.length + 1}`, ...data };
          records.push(rec);
          return rec;
        }),
        findFirst: jest.fn(
          async ({ where }: any) =>
            [...records].reverse().find((r) => r.system === where.system) ?? null,
        ),
        findMany: jest.fn(async ({ where }: any) =>
          records.filter((r) => r.system === where.system),
        ),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new SystemHealthService(prisma, audit);
    return { service, prisma, audit, records };
  };

  beforeEach(() => jest.clearAllMocks());

  it('tracks all 9 IW subsystems', () => {
    expect(HEALTH_SYSTEMS).toHaveLength(9);
  });

  it('checks every subsystem and reports overall healthy', async () => {
    const { service, audit } = makeService();
    const out = await service.check('ws-1', 'user-1');
    expect(out.checked).toBe(9);
    expect(out.failing).toBe(0);
    expect(out.overall).toBe('healthy');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SYSTEM_HEALTH_HEALTHY' }),
    );
  });

  it('marks a failing subsystem without crashing (STOP #3)', async () => {
    const { service } = makeService(['sfis']);
    const out = await service.check('ws-1', 'user-1');
    expect(out.overall).toBe('degraded');
    expect(out.failing).toBe(1);
    const sfis = out.systems.find((s) => s.system === 'sfis');
    expect(sfis?.status).toBe('failing');
  });

  it('report returns latest status per system', async () => {
    const { service } = makeService();
    await service.check('ws-1', 'user-1');
    const report = await service.report('ws-1');
    expect(report.total).toBe(9);
    expect(report.overall).toBe('healthy');
  });

  it('getSystem returns unknown for a system with no history', async () => {
    const { service } = makeService();
    const out = await service.getSystem('ws-1', 'fic');
    expect(out.status).toBe('unknown');
  });

  it('getSystem rejects an unknown system name', async () => {
    const { service } = makeService();
    await expect(service.getSystem('ws-1', 'bogus')).rejects.toThrow('Unknown system');
  });
});

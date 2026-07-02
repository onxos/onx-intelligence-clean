import { BadRequestException } from '@nestjs/common';
import { OVERRIDE_HANDLERS, resolveHandler } from './exception.constants';
import { ExceptionService } from './exception.service';

describe('exception constants (D18 — the 5 override handlers)', () => {
  it('registers exactly 5 handlers OR-01..OR-05', () => {
    expect(OVERRIDE_HANDLERS).toHaveLength(5);
    for (const rule of ['OR-01', 'OR-02', 'OR-03', 'OR-04', 'OR-05']) {
      expect(resolveHandler(rule)).toBeDefined();
    }
  });

  it('resolves case-insensitively and rejects unknown rules', () => {
    expect(resolveHandler('or-01')?.handlerType).toBe('EmergencyMedicalHandler');
    expect(resolveHandler('OR-99')).toBeUndefined();
  });
});

describe('ExceptionService (D18 — Exception Handling)', () => {
  const makeService = () => {
    const store: any[] = [];
    const prisma = {
      overrideExecution: {
        create: jest.fn(async ({ data }: any) => {
          const rec = {
            id: `oe-${store.length + 1}`,
            executionId: `OE-${store.length + 1}`,
            ...data,
          };
          store.push(rec);
          return rec;
        }),
        findFirst: jest.fn(
          async ({ where }: any) =>
            store.find(
              (r) => r.id === where.OR?.[0]?.id || r.executionId === where.OR?.[1]?.executionId,
            ) ?? null,
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const rec = store.find((r) => r.id === where.id);
          Object.assign(rec, data);
          return rec;
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => store.length),
        findMany: jest.fn(async () => store),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const iurg = { bindFicEvent: jest.fn().mockResolvedValue({ node: { id: 'iurg-1' } }) } as any;
    const service = new ExceptionService(prisma, audit, iurg);
    return { service, prisma, audit, iurg, store };
  };

  beforeEach(() => jest.clearAllMocks());

  it('triggers an OR-01 override, sets active status, binds IURG OVERRIDE', async () => {
    const { service, iurg, audit } = makeService();
    const out = await service.trigger('ws-1', 'user-1', {
      overrideRule: 'OR-01',
      triggeredBy: 'vet',
    });
    expect(out.status).toBe('active');
    expect(out.handlerType).toBe('EmergencyMedicalHandler');
    expect(out.iurgNodeId).toBe('iurg-1');
    expect(out.expiresAt).toBeInstanceOf(Date);
    expect(iurg.bindFicEvent).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'OVERRIDE', activeOverrides: ['OR-01'] }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OVERRIDE_TRIGGERED' }),
    );
  });

  it('all 5 override rules are executable', async () => {
    const { service } = makeService();
    for (const rule of ['OR-01', 'OR-02', 'OR-03', 'OR-04', 'OR-05']) {
      const out = await service.trigger('ws-1', 'user-1', { overrideRule: rule });
      expect(out.overrideRule).toBe(rule);
    }
  });

  it('rejects an unknown override rule', async () => {
    const { service } = makeService();
    await expect(service.trigger('ws-1', 'user-1', { overrideRule: 'OR-99' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('OR-03/OR-04 have no automatic expiry', async () => {
    const { service } = makeService();
    const out = await service.trigger('ws-1', 'user-1', { overrideRule: 'OR-03' });
    expect(out.expiresAt).toBeNull();
  });

  it('reverts an active override', async () => {
    const { service } = makeService();
    const created = await service.trigger('ws-1', 'user-1', { overrideRule: 'OR-01' });
    const reverted = await service.revert(created.id, 'ws-1', 'user-2');
    expect(reverted.status).toBe('reverted');
    expect(reverted.revertedBy).toBe('user-2');
  });

  it('survives an IURG binding failure (best-effort)', async () => {
    const { service, iurg } = makeService();
    iurg.bindFicEvent.mockRejectedValueOnce(new Error('iurg down'));
    const out = await service.trigger('ws-1', 'user-1', { overrideRule: 'OR-05' });
    expect(out.status).toBe('active');
    expect(out.iurgNodeId).toBeNull();
  });

  it('lists the handler registry', () => {
    const { service } = makeService();
    expect(service.listHandlers().total).toBe(5);
  });
});

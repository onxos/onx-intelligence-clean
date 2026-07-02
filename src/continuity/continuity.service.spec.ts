import { BadRequestException } from '@nestjs/common';
import {
  evaluateTierChange,
  isForbidden,
  normalizeOperation,
  PROTECTED_OBJECT_TYPES,
} from './continuity.constants';
import { ContinuityGuardService } from './continuity-guard.service';
import { ContinuityService } from './continuity.service';

describe('continuity constants (HC-04 / HC-03)', () => {
  it('classifies forbidden vs allowed operations', () => {
    expect(isForbidden(normalizeOperation('update'))).toBe(true);
    expect(isForbidden(normalizeOperation('delete'))).toBe(true);
    expect(isForbidden(normalizeOperation('overwrite'))).toBe(true);
    expect(isForbidden(normalizeOperation('revise'))).toBe(false);
  });

  it('exposes 6 protected object types', () => {
    expect(PROTECTED_OBJECT_TYPES).toHaveLength(6);
  });

  it('HC-03: tier upgrade requires authority, downgrade always allowed', () => {
    const upgradeNoAuth = evaluateTierChange('speculative', 'proven', 'system');
    expect(upgradeNoAuth.isUpgrade).toBe(true);
    expect(upgradeNoAuth.allowed).toBe(false);
    expect(upgradeNoAuth.requiredAuthority).toBe('DG-10');

    const upgradeAuth = evaluateTierChange('speculative', 'proven', 'DG-10');
    expect(upgradeAuth.allowed).toBe(true);

    const downgrade = evaluateTierChange('proven', 'speculative', 'system');
    expect(downgrade.isDowngrade).toBe(true);
    expect(downgrade.allowed).toBe(true);
  });
});

describe('ContinuityGuardService', () => {
  const makeGuard = () => {
    const prisma = {
      continuityAudit: {
        create: jest.fn(async ({ data }: any) => ({ id: 'ca-1', auditId: 'CA-1', ...data })),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const iurg = {
      bindFicEvent: jest.fn().mockResolvedValue({ node: { id: 'iurg-1' } }),
      createLink: jest.fn().mockResolvedValue({ edgeId: 'E1' }),
    } as any;
    const guard = new ContinuityGuardService(prisma, audit, iurg);
    return { prisma, audit, iurg, guard };
  };

  beforeEach(() => jest.clearAllMocks());

  it('BLOCKS an UPDATE on a protected object (HC-04) + logs BLOCKED_UPDATE + IURG violation', async () => {
    const { guard, iurg } = makeGuard();
    const out = await guard.guard('ws-1', 'user-1', {
      operation: 'UPDATE',
      targetType: 'understanding',
      targetId: 'UN-1',
    });
    expect(out.blocked).toBe(true);
    expect(out.allowed).toBe(false);
    expect(out.operation).toBe('BLOCKED_UPDATE');
    expect(iurg.bindFicEvent).toHaveBeenCalledWith(
      expect.objectContaining({ hardViolations: ['HC-04'] }),
    );
  });

  it('BLOCKS a DELETE (HC-04) as BLOCKED_DELETE', async () => {
    const { guard } = makeGuard();
    const out = await guard.guard('ws-1', 'user-1', {
      operation: 'DELETE',
      targetType: 'judgment',
      targetId: 'JD-1',
    });
    expect(out.operation).toBe('BLOCKED_DELETE');
    expect(out.blocked).toBe(true);
  });

  it('ALLOWS a REVISE (append-only)', async () => {
    const { guard, iurg } = makeGuard();
    const out = await guard.guard('ws-1', 'user-1', {
      operation: 'REVISE',
      targetType: 'understanding',
      targetId: 'UN-1',
      reason: 'new evidence',
    });
    expect(out.allowed).toBe(true);
    expect(out.operation).toBe('REVISE');
    expect(iurg.bindFicEvent).not.toHaveBeenCalled();
  });

  it('ALLOWS a SUPERSEDE and creates a supersedes edge', async () => {
    const { guard, iurg } = makeGuard();
    const out = await guard.guard('ws-1', 'user-1', {
      operation: 'SUPERSEDE',
      targetType: 'intent',
      targetId: 'FI-2',
      previousRef: 'FI-1',
    });
    expect(out.allowed).toBe(true);
    expect(iurg.createLink).toHaveBeenCalledWith(
      'ws-1',
      'SUPERSEDES',
      expect.objectContaining({ ref: 'FI-2' }),
      expect.objectContaining({ ref: 'FI-1' }),
      'CONTINUITY_SUPERSEDE',
    );
  });

  it('BLOCKS an unauthorised tier upgrade (HC-03)', async () => {
    const { guard } = makeGuard();
    const out = await guard.guard('ws-1', 'user-1', {
      operation: 'REVISE',
      targetType: 'evidence',
      targetId: 'EV-1',
      tierFrom: 'speculative',
      tierTo: 'proven',
      approverAuthority: 'system',
    });
    expect(out.blocked).toBe(true);
    expect(out.operation).toBe('BLOCKED_UPDATE');
  });

  it('ALLOWS a tier downgrade (never deleted)', async () => {
    const { guard } = makeGuard();
    const out = await guard.guard('ws-1', 'user-1', {
      operation: 'REVISE',
      targetType: 'evidence',
      targetId: 'EV-1',
      tierFrom: 'proven',
      tierTo: 'probable',
    });
    expect(out.allowed).toBe(true);
  });

  it('rejects an unknown target type', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.guard('ws-1', 'user-1', { operation: 'REVISE', targetType: 'nonsense', targetId: 'X' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ContinuityService reads', () => {
  const makeService = () => {
    const prisma = {
      continuityAudit: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const guardSvc = { guard: jest.fn() } as any;
    const service = new ContinuityService(prisma, guardSvc);
    return { prisma, guardSvc, service };
  };

  beforeEach(() => jest.clearAllMocks());

  it('objectHistory returns append-only history with version + blocked counts', async () => {
    const { service, prisma } = makeService();
    prisma.continuityAudit.findMany.mockResolvedValue([
      { blocked: false },
      { blocked: false },
      { blocked: true },
    ]);
    const out = await service.objectHistory('understanding', 'UN-1', 'ws-1');
    expect(out.total).toBe(3);
    expect(out.currentVersion).toBe(2);
    expect(out.blockedAttempts).toBe(1);
  });

  it('protectedObjects returns all 6 types with counts', async () => {
    const { service, prisma } = makeService();
    prisma.continuityAudit.groupBy.mockResolvedValue([
      { targetType: 'understanding', _count: { _all: 3 } },
    ]);
    const out = await service.protectedObjects('ws-1');
    expect(out.total).toBe(6);
    expect(out.types.find((t: any) => t.type === 'understanding')?.auditCount).toBe(3);
  });

  it('stats separates appended vs blocked', async () => {
    const { service, prisma } = makeService();
    prisma.continuityAudit.groupBy
      .mockResolvedValueOnce([{ operation: 'REVISE', _count: { _all: 4 } }])
      .mockResolvedValueOnce([{ targetType: 'understanding', _count: { _all: 4 } }]);
    prisma.continuityAudit.count.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    const out = await service.stats('ws-1');
    expect(out.total).toBe(5);
    expect(out.blockedTotal).toBe(1);
    expect(out.appendedTotal).toBe(4);
  });

  it('revise/supersede/deprecate delegate to the guard with the fixed operation', async () => {
    const { service, guardSvc } = makeService();
    await service.revise('ws-1', 'u', { targetType: 'judgment', targetId: 'JD-1' } as any);
    await service.supersede('ws-1', 'u', { targetType: 'judgment', targetId: 'JD-1' } as any);
    await service.deprecate('ws-1', 'u', { targetType: 'judgment', targetId: 'JD-1' } as any);
    expect(guardSvc.guard.mock.calls[0][2].operation).toBe('REVISE');
    expect(guardSvc.guard.mock.calls[1][2].operation).toBe('SUPERSEDE');
    expect(guardSvc.guard.mock.calls[2][2].operation).toBe('DEPRECATE');
  });
});

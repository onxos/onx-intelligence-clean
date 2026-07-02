import { HealthChecksService } from './health-checks.service';

describe('HealthChecksService', () => {
  const makeService = (overrides: { queryOk?: boolean; providerCount?: number } = {}) => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
    } as any;
    if (overrides.queryOk === false) {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('db down'));
    } else {
      prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    }
    const providers = new Array(overrides.providerCount ?? 6).fill({});
    const aiRouter = { availableProviders: jest.fn().mockResolvedValue(providers) } as any;
    return { prisma, aiRouter, service: new HealthChecksService(prisma, aiRouter) };
  };

  it('reports database up', async () => {
    const { service } = makeService();
    await expect(service.database()).resolves.toMatchObject({ name: 'database', status: 'up' });
  });

  it('reports database down on error', async () => {
    const { service } = makeService({ queryOk: false });
    await expect(service.database()).resolves.toMatchObject({ status: 'down' });
  });

  it('reports ai providers up with >= 2 available', async () => {
    const { service } = makeService({ providerCount: 6 });
    await expect(service.aiProviders()).resolves.toMatchObject({ status: 'up' });
  });

  it('reports ai providers degraded below the minimum', async () => {
    const { service } = makeService({ providerCount: 1 });
    await expect(service.aiProviders()).resolves.toMatchObject({ status: 'degraded' });
  });

  it('reports the constitutional corpus intact', () => {
    const { service } = makeService();
    expect(service.constitution().status).toBe('up');
  });

  it('reports redis skipped', () => {
    const { service } = makeService();
    expect(service.redis().status).toBe('skipped');
  });

  it('aggregates to ok when all critical checks pass', async () => {
    const { service } = makeService();
    const result = await service.runAll();
    expect(result.status).toBe('ok');
    expect(result.checks).toHaveLength(4);
  });

  it('aggregates to down when the database is down', async () => {
    const { service } = makeService({ queryOk: false });
    const result = await service.runAll();
    expect(result.status).toBe('down');
  });

  it('aggregates to degraded when providers are low', async () => {
    const { service } = makeService({ providerCount: 1 });
    const result = await service.runAll();
    expect(result.status).toBe('degraded');
  });
});

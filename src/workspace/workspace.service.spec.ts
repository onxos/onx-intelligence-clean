import { BadRequestException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService memory governance', () => {
  const makeService = () => {
    const prisma = {
      memoryEntry: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      intelligenceObject: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _avg: { amanahScore: 0, qualityIndex: 0 },
          _sum: { capitalValue: 0 },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      evidenceRecord: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _avg: { confidence: 0 }, _sum: { cost: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      providerProfile: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      toolProfile: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      project: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      agent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      provenanceRecord: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      providerEvaluation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      governanceDecision: {
        count: jest.fn().mockResolvedValue(0),
      },
      capitalRecord: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _avg: { amount: 0 } }),
      },
      auditLog: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sovereigntyMetric: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new WorkspaceService(prisma, audit);

    return { prisma, audit, service };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies default memory governance fields on create', async () => {
    const { prisma, audit, service } = makeService();
    prisma.memoryEntry.create.mockResolvedValue({
      id: 'mem-1',
      title: 'Governed Memory',
      classification: 'INSTITUTIONAL',
      accessScope: 'WORKSPACE',
      lifecycleStatus: 'ACTIVE',
      retentionDays: 1095,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      deletedAt: null,
    });

    await service.createMemory(
      'workspace-1',
      'user-1',
      {
        title: '  Governed Memory  ',
        content: '  Governed content  ',
        tags: ['alpha', 'alpha', 'beta '],
      },
      { actorId: 'user-1' },
    );

    expect(prisma.memoryEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Governed Memory',
          content: 'Governed content',
          category: 'GENERAL',
          classification: 'INSTITUTIONAL',
          accessScope: 'WORKSPACE',
          lifecycleStatus: 'ACTIVE',
          retentionDays: 1095,
          tags: ['alpha', 'beta'],
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMORY_CREATED',
        metadata: expect.objectContaining({
          classification: 'INSTITUTIONAL',
          accessScope: 'WORKSPACE',
          lifecycleStatus: 'ACTIVE',
          retentionDays: 1095,
        }),
      }),
    );
  });

  it('rejects restricted memory that is not owner-only', async () => {
    const { prisma, audit, service } = makeService();

    await expect(
      service.createMemory(
        'workspace-1',
        'user-1',
        {
          title: 'Restricted Memory',
          content: 'Sensitive content',
          classification: 'RESTRICTED',
          accessScope: 'WORKSPACE',
        },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.memoryEntry.create).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMORY_CREATED',
        status: 'FAILED',
        success: false,
      }),
    );
  });

  it('filters memory queries by workspace access scope and validated governance fields', async () => {
    const { prisma, service } = makeService();
    prisma.memoryEntry.findMany.mockResolvedValue([]);

    await service.listMemory('workspace-1', 'user-1', {
      classification: 'CONFIDENTIAL',
      accessScope: 'OWNER_ONLY',
      lifecycleStatus: 'EXPIRED',
      search: 'governance',
      sortBy: 'expiresAt',
      sortOrder: 'asc',
      page: 2,
      pageSize: 10,
    });

    expect(prisma.memoryEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.memoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classification: 'CONFIDENTIAL',
          accessScope: 'OWNER_ONLY',
          lifecycleStatus: 'EXPIRED',
          AND: expect.arrayContaining([
            { OR: [{ accessScope: 'WORKSPACE' }, { ownerId: 'user-1' }] },
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
        orderBy: { expiresAt: 'asc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('blocks mutation of locked memory until it is reactivated', async () => {
    const { prisma, audit, service } = makeService();
    prisma.memoryEntry.findFirst.mockResolvedValue({
      id: 'mem-1',
      title: 'Locked Memory',
      content: 'Locked content',
      category: 'GENERAL',
      classification: 'CONFIDENTIAL',
      accessScope: 'OWNER_ONLY',
      lifecycleStatus: 'LOCKED',
      retentionDays: 30,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      deletedAt: null,
      ownerId: 'user-1',
    });

    await expect(
      service.updateMemory(
        'mem-1',
        'workspace-1',
        { title: 'Still Locked' },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.memoryEntry.update).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMORY_UPDATED',
        status: 'FAILED',
        success: false,
      }),
    );
  });

  it('rejects invalid reporting date ranges', async () => {
    const { service } = makeService();

    await expect(
      service.getReports('workspace-1', 'user-1', {
        from: '2026-12-31',
        to: '2026-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns deep reporting summary with required sections', async () => {
    const { prisma, service } = makeService();
    prisma.auditLog.findMany
      .mockResolvedValueOnce([
        { action: 'MEMORY_CREATED', status: 'SUCCESS', metadata: {}, createdAt: new Date() },
        {
          action: 'MEMORY_UPDATED',
          status: 'FAILED',
          metadata: { error: 'invalid payload' },
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.getReports('workspace-1', 'user-1', {
      includeDetails: true,
      module: 'memory',
      page: 1,
      pageSize: 10,
    });

    expect(result).toMatchObject({
      snapshot: expect.any(Object),
      statistics: expect.any(Object),
      counts: expect.any(Object),
      healthSummary: expect.any(Object),
      auditSummary: expect.any(Object),
      memorySummary: expect.any(Object),
      crudActivitySummary: expect.any(Object),
      providerSummary: expect.any(Object),
      workspaceSummary: expect.any(Object),
      errorSummary: expect.any(Object),
      validationSummary: expect.any(Object),
      sovereigntySummary: expect.any(Object),
    });
    expect(result.details.memory).toMatchObject({
      total: expect.any(Number),
      page: 1,
      pageSize: 10,
      items: expect.any(Array),
    });
  });
});

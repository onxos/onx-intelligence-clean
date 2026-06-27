import { BadRequestException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService memory governance', () => {
  const makeService = () => {
    const prisma = {
      memoryEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
});

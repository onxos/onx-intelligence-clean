import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CapitalCategory } from '@prisma/client';
import { CapitalService } from './capital.service';

describe('CapitalService', () => {
  const makeService = () => {
    const allocations: any[] = [];
    const policies: any[] = [];
    const history: any[] = [];
    const decisions: any[] = [];
    const approvals: any[] = [];

    let allocationSeq = 1;
    let policySeq = 1;
    let historySeq = 1;
    let decisionSeq = 1;
    let approvalSeq = 1;

    const matchesWhere = (row: Record<string, any>, where: Record<string, any> = {}) => {
      return Object.entries(where).every(([key, value]) => {
        if (key === 'OR' && Array.isArray(value)) {
          return value.some((branch) => matchesWhere(row, branch));
        }
        if (value && typeof value === 'object' && 'contains' in value) {
          const needle = String((value as any).contains).toLowerCase();
          const haystack = String(row[key] ?? '').toLowerCase();
          return haystack.includes(needle);
        }
        if (value === null) {
          return row[key] === null || row[key] === undefined;
        }
        return row[key] === value;
      });
    };

    const applyOrder = (rows: any[], orderBy?: Record<string, 'asc' | 'desc'>) => {
      if (!orderBy) {
        return [...rows];
      }
      const [[field, direction]] = Object.entries(orderBy);
      const factor = direction === 'asc' ? 1 : -1;
      return [...rows].sort((left, right) => {
        const a = left[field];
        const b = right[field];
        if (a instanceof Date && b instanceof Date) {
          return (a.getTime() - b.getTime()) * factor;
        }
        if (a === b) {
          return 0;
        }
        return (String(a) > String(b) ? 1 : -1) * factor;
      });
    };

    const applyPagination = (rows: any[], skip = 0, take = rows.length) => {
      return rows.slice(skip, skip + take);
    };

    const prisma = {
      capitalAllocation: {
        findMany: jest.fn(async ({ where, orderBy, skip, take }: any = {}) => {
          const filtered = allocations.filter((row) => matchesWhere(row, where));
          const ordered = applyOrder(filtered, orderBy);
          return applyPagination(ordered, skip, take);
        }),
        create: jest.fn(async ({ data }: any) => {
          const created = {
            id: `alloc-${allocationSeq++}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: data.deletedAt ?? null,
          };
          allocations.push(created);
          return created;
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return allocations.find((row) => matchesWhere(row, where)) ?? null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const idx = allocations.findIndex((row) => row.id === where.id);
          if (idx === -1) {
            throw new Error('Allocation not found');
          }
          allocations[idx] = {
            ...allocations[idx],
            ...data,
            updatedAt: new Date(),
          };
          return allocations[idx];
        }),
        count: jest.fn(),
      },
      allocationPolicy: {
        findMany: jest.fn(async ({ where, orderBy, skip, take }: any = {}) => {
          const filtered = policies.filter((row) => matchesWhere(row, where));
          const ordered = applyOrder(filtered, orderBy);
          return applyPagination(ordered, skip, take);
        }),
        create: jest.fn(async ({ data }: any) => {
          const created = {
            id: `policy-${policySeq++}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: data.deletedAt ?? null,
          };
          policies.push(created);
          return created;
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return policies.find((row) => matchesWhere(row, where)) ?? null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const idx = policies.findIndex((row) => row.id === where.id);
          if (idx === -1) {
            throw new Error('Policy not found');
          }
          policies[idx] = {
            ...policies[idx],
            ...data,
            updatedAt: new Date(),
          };
          return policies[idx];
        }),
        count: jest.fn(),
      },
      allocationHistory: {
        create: jest.fn(async ({ data }: any) => {
          const created = {
            id: `hist-${historySeq++}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          history.push(created);
          return created;
        }),
        findMany: jest.fn(async ({ where, orderBy, skip, take }: any = {}) => {
          const filtered = history.filter((row) => matchesWhere(row, where));
          const ordered = applyOrder(filtered, orderBy);
          return applyPagination(ordered, skip, take);
        }),
      },
      allocationDecision: {
        create: jest.fn(async ({ data }: any) => {
          const created = {
            id: `decision-${decisionSeq++}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          decisions.push(created);
          return created;
        }),
      },
      allocationApproval: {
        create: jest.fn(async ({ data }: any) => {
          const created = {
            id: `approval-${approvalSeq++}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          approvals.push(created);
          return created;
        }),
      },
    } as any;

    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new CapitalService(prisma, audit);
    return { prisma, audit, service };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates, updates, deletes, restores, approves, and rejects an allocation with Prisma persistence', async () => {
    const { service, audit } = makeService();

    const created = await service.createAllocation(
      'workspace-1',
      'user-1',
      {
        category: CapitalCategory.OPERATIONS,
        amount: 150000,
        currency: 'usd',
        source: 'Treasury',
        target: 'Operations Sprint',
        rationale: 'Fund execution sprint',
        status: 'DRAFT',
      },
      { actorId: 'user-1' },
    );

    expect(created.currency).toBe('USD');
    expect(created.status).toBe('DRAFT');

    const updated = await service.updateAllocation(
      String(created.id),
      'workspace-1',
      'user-1',
      { status: 'PENDING_APPROVAL', priority: 2, decisionReason: 'Needs approval' },
      { actorId: 'user-1' },
    );
    expect(updated.status).toBe('PENDING_APPROVAL');
    expect(updated.priority).toBe(2);

    const approved = await service.approveAllocation(
      String(created.id),
      'workspace-1',
      'user-1',
      { decisionReason: 'Approved by governance' },
      { actorId: 'user-1' },
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvalStatus).toBe('APPROVED');

    const rejected = await service.rejectAllocation(
      String(created.id),
      'workspace-1',
      'user-1',
      { decisionReason: 'Rejected for rework', status: 'REJECTED' },
      { actorId: 'user-1' },
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.approvalStatus).toBe('REJECTED');

    const deleted = await service.deleteAllocation(String(created.id), 'workspace-1', 'user-1', {
      actorId: 'user-1',
    });
    expect(deleted).toEqual({ success: true, id: created.id });

    const restored = await service.restoreAllocation(String(created.id), 'workspace-1', 'user-1', {
      actorId: 'user-1',
    });
    expect(restored.deletedAt).toBeNull();
    expect(restored.status).toBe('DRAFT');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITAL_ALLOCATION_CREATED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITAL_ALLOCATION_APPROVED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITAL_ALLOCATION_REJECTED' }),
    );
  });

  it('lists allocations with pagination, filter, sort, and produces report summary', async () => {
    const { service } = makeService();

    await service.createAllocation(
      'workspace-1',
      'user-1',
      {
        category: CapitalCategory.OPERATIONS,
        amount: 400,
        currency: 'USD',
        target: 'Ops',
        status: 'ALLOCATED',
      },
      { actorId: 'user-1' },
    );
    await service.createAllocation(
      'workspace-1',
      'user-1',
      {
        category: CapitalCategory.GOVERNANCE,
        amount: 250,
        currency: 'USD',
        target: 'Gov',
        status: 'PENDING_APPROVAL',
      },
      { actorId: 'user-1' },
    );
    await service.createPolicy(
      'workspace-1',
      'user-1',
      {
        name: 'Governance reserve',
        category: CapitalCategory.GOVERNANCE,
      },
      { actorId: 'user-1' },
    );

    const list = await service.listAllocations('workspace-1', 'user-1', {
      category: CapitalCategory.GOVERNANCE,
      sortBy: 'amount',
      sortOrder: 'desc',
      page: 1,
      pageSize: 10,
    });
    expect(list).toHaveLength(1);
    expect(list[0].category).toBe('GOVERNANCE');

    const reports = await service.getReports('workspace-1');
    expect(reports.totalAllocated).toBe(400);
    expect(reports.totalPending).toBe(250);
    expect(reports.policyCount).toBe(1);
    expect(reports.allocationsByCategory.GOVERNANCE.count).toBe(1);
    expect(reports.allocationsByStatus.ALLOCATED).toBe(1);
  });

  it('creates, updates, deletes, restores policies and records history', async () => {
    const { service, audit } = makeService();

    const created = await service.createPolicy(
      'workspace-1',
      'user-1',
      {
        name: 'Clinical runway',
        category: CapitalCategory.CLINICAL,
        status: 'ACTIVE',
      },
      { actorId: 'user-1' },
    );
    expect(created.name).toBe('Clinical runway');

    const updated = await service.updatePolicy(
      String(created.id),
      'workspace-1',
      'user-1',
      { status: 'INACTIVE', rationale: 'Paused' },
      { actorId: 'user-1' },
    );
    expect(updated.status).toBe('INACTIVE');

    await service.deletePolicy(String(created.id), 'workspace-1', 'user-1', { actorId: 'user-1' });
    const restored = await service.restorePolicy(String(created.id), 'workspace-1', 'user-1', {
      actorId: 'user-1',
    });
    expect(restored.status).toBe('ACTIVE');

    const history = await service.getHistory('workspace-1', { policyId: String(created.id) });
    expect(history.length).toBeGreaterThanOrEqual(4);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITAL_POLICY_CREATED' }),
    );
  });

  it('rejects invalid allocation input and missing resources', async () => {
    const { service, audit } = makeService();

    await expect(
      service.createAllocation(
        'workspace-1',
        'user-1',
        {
          category: CapitalCategory.OPERATIONS,
          amount: -10,
          currency: 'USD',
        },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(service.getAllocation('missing', 'workspace-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITAL_ALLOCATION_CREATED', status: 'FAILED' }),
    );
  });

  it('uses safe workspace-scoped database queries for reports', async () => {
    const { service, prisma } = makeService();
    prisma.capitalAllocation.findMany.mockResolvedValue([
      {
        id: 'alloc-1',
        workspaceId: 'workspace-1',
        category: CapitalCategory.OPERATIONS,
        amount: 200,
        currency: 'USD',
        status: 'APPROVED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.allocationPolicy.findMany.mockResolvedValue([
      {
        id: 'policy-1',
        workspaceId: 'workspace-1',
        category: CapitalCategory.OPERATIONS,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const report = await service.getReports('workspace-1', {
      category: CapitalCategory.OPERATIONS,
      status: 'APPROVED',
      currency: 'usd',
    });

    expect(prisma.capitalAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          status: 'APPROVED',
          currency: 'USD',
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.allocationPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          deletedAt: null,
        }),
      }),
    );
    expect(report.allocationCount).toBe(1);
    expect(report.policyCount).toBe(1);
  });

  it('rejects contradictory status overrides for approve and reject actions', async () => {
    const { service } = makeService();

    const approveTarget = await service.createAllocation(
      'workspace-1',
      'user-1',
      {
        category: CapitalCategory.OPERATIONS,
        amount: 100,
        currency: 'USD',
        status: 'PENDING_APPROVAL',
      },
      { actorId: 'user-1' },
    );

    await expect(
      service.approveAllocation(
        String(approveTarget.id),
        'workspace-1',
        'user-1',
        { status: 'REJECTED' },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);

    const rejectTarget = await service.createAllocation(
      'workspace-1',
      'user-1',
      {
        category: CapitalCategory.GOVERNANCE,
        amount: 90,
        currency: 'USD',
        status: 'PENDING_APPROVAL',
      },
      { actorId: 'user-1' },
    );

    await expect(
      service.rejectAllocation(
        String(rejectTarget.id),
        'workspace-1',
        'user-1',
        { status: 'APPROVED' },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.rejectAllocation(
        String(rejectTarget.id),
        'workspace-1',
        'user-1',
        { status: 'ALLOCATED' },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.approveAllocation(
        String(approveTarget.id),
        'workspace-1',
        'user-1',
        { status: 'CANCELLED' },
        { actorId: 'user-1' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

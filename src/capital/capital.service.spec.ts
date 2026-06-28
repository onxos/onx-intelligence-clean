import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CapitalCategory } from '@prisma/client';
import { CapitalService } from './capital.service';

describe('CapitalService', () => {
  const makeService = () => {
    const prisma = {
      isConnected: jest.fn().mockReturnValue(false),
      capitalAllocation: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      allocationPolicy: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      allocationHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      allocationDecision: {
        create: jest.fn(),
      },
      allocationApproval: {
        create: jest.fn(),
      },
    } as any;

    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new CapitalService(prisma, audit);
    return { prisma, audit, service };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates, updates, deletes, restores, approves, and rejects an allocation in fallback mode', async () => {
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

    const deleted = await service.deleteAllocation(
      String(created.id),
      'workspace-1',
      'user-1',
      { actorId: 'user-1' },
    );
    expect(deleted).toEqual({ success: true, id: created.id });

    const restored = await service.restoreAllocation(
      String(created.id),
      'workspace-1',
      'user-1',
      { actorId: 'user-1' },
    );
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
    const restored = await service.restorePolicy(
      String(created.id),
      'workspace-1',
      'user-1',
      { actorId: 'user-1' },
    );
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

    await expect(service.getAllocation('missing', 'workspace-1')).rejects.toThrow(NotFoundException);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CAPITAL_ALLOCATION_CREATED', status: 'FAILED' }),
    );
  });
});
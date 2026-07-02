import { NotFoundException } from '@nestjs/common';
import {
  CONSTRAINT_SOURCE_INTENTS,
  DECISION_TO_NODE_TYPE,
  IURG_EDGE_TYPES,
  IURG_NODE_TYPES,
  sourceIntentsForConstraint,
} from './iurg.constants';
import { FicBindInput, IurgService } from './iurg.service';

describe('IURG constants', () => {
  it('exposes 8 node types and 10 edge types', () => {
    expect(IURG_NODE_TYPES).toHaveLength(8);
    expect(IURG_EDGE_TYPES).toHaveLength(10);
    expect(IURG_EDGE_TYPES).toEqual(
      expect.arrayContaining([
        'DERIVED_FROM',
        'CONSTRAINS',
        'CONFLICTS_WITH',
        'SUPERSEDES',
        'ENFORCED_BY',
        'VIOLATED_BY',
        'REVIEWED_UNDER',
        'AMENDED_BY',
        'VALIDATED_BY',
        'REALIZED_AS',
      ]),
    );
  });

  it('maps FIC decisions to the 4 object types', () => {
    expect(DECISION_TO_NODE_TYPE).toEqual({
      APPROVED: 'ENFORCEMENT',
      REJECTED: 'VIOLATION',
      CONFLICT: 'CONFLICT',
      OVERRIDE: 'OVERRIDE',
    });
  });

  it('derives source intents for constraints from the corpus', () => {
    expect(sourceIntentsForConstraint('HC-08').length).toBeGreaterThan(0);
    expect(CONSTRAINT_SOURCE_INTENTS.get('EB-03')).toEqual(
      expect.arrayContaining(['FI-2026-0016']),
    );
  });
});

describe('IurgService', () => {
  let idSeq = 0;
  const makeService = () => {
    idSeq = 0;
    const nextId = (p: string) => `${p}-${(idSeq += 1)}`;
    const objModel = (prefix: string) => ({
      create: jest.fn(async ({ data }: any) => ({
        id: nextId(prefix),
        iurgId: data.iurgId,
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    });
    const registryModel = (prefix: string, refField: string) => ({
      upsert: jest.fn(async ({ where, create }: any) => ({
        id: nextId(prefix),
        iurgId: create.iurgId,
        [refField]: create[refField] ?? where[Object.keys(where)[0]],
      })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    });
    const prisma: any = {
      $transaction: jest.fn(),
      iurgEnforcementObject: objModel('enf'),
      iurgViolationObject: objModel('vio'),
      iurgConflictObject: objModel('con'),
      iurgOverrideObject: objModel('ovr'),
      iurgReviewObject: objModel('rev'),
      iurgAmendmentObject: objModel('amd'),
      iurgIntentObject: registryModel('int', 'intentRef'),
      iurgConstraintObject: registryModel('cst', 'constraintRef'),
      iurgEdge: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      intentEvolutionLedger: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => ({ ...data })),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new IurgService(prisma, audit);
    return { prisma, audit, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const baseInput = (overrides: Partial<FicBindInput> = {}): FicBindInput => ({
    workspaceId: 'ws-1',
    actorId: 'user-1',
    decision: 'APPROVED',
    reason: 'ok',
    applicableIntentIds: ['FI-2026-0001'],
    applicableConstraintIds: ['HC-08'],
    executionBlocks: [],
    hardViolations: [],
    requiredGates: [],
    softFlags: [],
    activeOverrides: [],
    conflicts: [],
    playbooks: ['clinic_operations'],
    domains: ['clinical'],
    traceId: 'trace-1',
    sourceCheckId: 'chk-1',
    ...overrides,
  });

  const edgeTypesCreated = (prisma: any): string[] => {
    const types: string[] = [];
    for (const call of prisma.iurgEdge.createMany.mock.calls) {
      for (const row of call[0].data) {
        types.push(row.edgeType);
      }
    }
    return types;
  };

  it('binds an APPROVED check to an Enforcement Object with a full edge set + ledger', async () => {
    const { service, prisma, audit } = makeService();
    const out = await service.bindFicEvent(baseInput());

    expect(prisma.iurgEnforcementObject.create).toHaveBeenCalledTimes(1);
    const types = edgeTypesCreated(prisma);
    expect(types).toEqual(
      expect.arrayContaining([
        'ENFORCED_BY',
        'DERIVED_FROM',
        'REALIZED_AS',
        'VALIDATED_BY',
        'CONSTRAINS',
      ]),
    );
    expect(prisma.intentEvolutionLedger.create).toHaveBeenCalledTimes(1);
    const ledgerArg = prisma.intentEvolutionLedger.create.mock.calls[0][0].data;
    expect(ledgerArg.ledgerId).toMatch(/^IEL-\d{4}-\d{4}$/);
    expect(out.node.iurgId).toMatch(/^IURG-/);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'IURG_ENFORCEMENT_BOUND' }),
    );
  });

  it('binds a REJECTED check to a Violation Object with violated_by edges', async () => {
    const { service, prisma } = makeService();
    await service.bindFicEvent(
      baseInput({ decision: 'REJECTED', executionBlocks: ['EB-03'], hardViolations: ['HC-08'] }),
    );
    expect(prisma.iurgViolationObject.create).toHaveBeenCalledTimes(1);
    expect(edgeTypesCreated(prisma)).toEqual(
      expect.arrayContaining(['VIOLATED_BY', 'DERIVED_FROM']),
    );
  });

  it('binds a CONFLICT check to a Conflict Object with conflicts_with edges', async () => {
    const { service, prisma } = makeService();
    await service.bindFicEvent(
      baseInput({
        decision: 'CONFLICT',
        applicableIntentIds: ['FI-2026-0011', 'FI-2026-0013'],
        requiredGates: ['DG-04'],
        conflicts: [{ classId: 'C1', name: 'Growth vs Care' }],
      }),
    );
    expect(prisma.iurgConflictObject.create).toHaveBeenCalledTimes(1);
    expect(edgeTypesCreated(prisma)).toEqual(expect.arrayContaining(['CONFLICTS_WITH']));
  });

  it('binds an OVERRIDE check to an Override Object with enforced_by edges', async () => {
    const { service, prisma } = makeService();
    await service.bindFicEvent(baseInput({ decision: 'OVERRIDE', activeOverrides: ['OR-01'] }));
    expect(prisma.iurgOverrideObject.create).toHaveBeenCalledTimes(1);
    expect(edgeTypesCreated(prisma)).toEqual(
      expect.arrayContaining(['ENFORCED_BY', 'REALIZED_AS']),
    );
  });

  it('binds a review event with a reviewed_under edge', async () => {
    const { service, prisma } = makeService();
    await service.bindReviewEvent({
      workspaceId: 'ws-1',
      actorId: 'user-1',
      intentRef: 'FI-2026-0001',
      decision: 'APPROVED',
    });
    expect(prisma.iurgReviewObject.create).toHaveBeenCalledTimes(1);
    expect(edgeTypesCreated(prisma)).toEqual(['REVIEWED_UNDER']);
  });

  it('binds an amendment event with amended_by + supersedes edges', async () => {
    const { service, prisma } = makeService();
    await service.bindAmendmentEvent({
      workspaceId: 'ws-1',
      actorId: 'user-1',
      intentRef: 'FI-2026-0001',
      fromVersion: 1,
      toVersion: 2,
    });
    expect(prisma.iurgAmendmentObject.create).toHaveBeenCalledTimes(1);
    expect(edgeTypesCreated(prisma)).toEqual(expect.arrayContaining(['AMENDED_BY', 'SUPERSEDES']));
  });

  it('increments the Intent Evolution Ledger sequence', async () => {
    const { service, prisma } = makeService();
    prisma.intentEvolutionLedger.count.mockResolvedValue(41);
    await service.bindFicEvent(baseInput());
    const ledgerArg = prisma.intentEvolutionLedger.create.mock.calls[0][0].data;
    expect(ledgerArg.sequence).toBe(42);
    expect(ledgerArg.ledgerId).toMatch(/-0042$/);
  });

  describe('reads', () => {
    it('lists enforcement objects with pagination', async () => {
      const { service, prisma } = makeService();
      prisma.iurgEnforcementObject.count.mockResolvedValue(2);
      prisma.iurgEnforcementObject.findMany.mockResolvedValue([{ id: 'enf-1' }]);
      const out = await service.listEnforcements('ws-1', { page: 1, pageSize: 25 });
      expect(out.total).toBe(2);
      expect(out.items).toHaveLength(1);
    });

    it('gets an intent object with edges', async () => {
      const { service, prisma } = makeService();
      prisma.iurgIntentObject.findFirst.mockResolvedValue({
        id: 'int-1',
        intentRef: 'FI-2026-0001',
      });
      prisma.iurgEdge.findMany.mockResolvedValue([{ id: 'e1', edgeType: 'DERIVED_FROM' }]);
      const out = await service.getIntent('FI-2026-0001', 'ws-1');
      expect(out.edges).toHaveLength(1);
    });

    it('throws when an intent object is missing', async () => {
      const { service, prisma } = makeService();
      prisma.iurgIntentObject.findFirst.mockResolvedValue(null);
      await expect(service.getIntent('missing', 'ws-1')).rejects.toThrow(NotFoundException);
    });

    it('returns edges for a node', async () => {
      const { service, prisma } = makeService();
      prisma.iurgEdge.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
      const out = await service.getEdgesForNode('node-1', 'ws-1');
      expect(out.total).toBe(2);
    });
  });

  describe('query', () => {
    it('fans out across event tables and returns nodes + edges', async () => {
      const { service, prisma } = makeService();
      prisma.iurgViolationObject.findMany.mockResolvedValue([
        { id: 'vio-1', intentId: 'FI-2026-0001' },
      ]);
      prisma.iurgEdge.findMany.mockResolvedValue([{ id: 'e1', edgeType: 'VIOLATED_BY' }]);
      const out = await service.query('ws-1', { eventType: 'violation', intentId: 'FI-2026-0001' });
      expect(out.total).toBeGreaterThanOrEqual(1);
      expect(out.nodes[0].nodeType).toBe('VIOLATION');
      expect(prisma.iurgViolationObject.findMany).toHaveBeenCalled();
      // Only the requested event table is queried.
      expect(prisma.iurgEnforcementObject.findMany).not.toHaveBeenCalled();
    });

    it('queries all event tables when no event type is supplied', async () => {
      const { service, prisma } = makeService();
      await service.query('ws-1', { intentId: 'FI-2026-0001' });
      expect(prisma.iurgEnforcementObject.findMany).toHaveBeenCalled();
      expect(prisma.iurgViolationObject.findMany).toHaveBeenCalled();
      expect(prisma.iurgConflictObject.findMany).toHaveBeenCalled();
      expect(prisma.iurgOverrideObject.findMany).toHaveBeenCalled();
    });
  });
});

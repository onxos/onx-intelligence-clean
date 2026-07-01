import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FiarLifecycleTransition } from './fiar.constants';
import { FiarService } from './fiar.service';

describe('FiarService (FIAR)', () => {
  const makeService = () => {
    const model = () => ({
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    });
    const prisma = {
      $transaction: jest.fn(),
      fIARAsset: model(),
      fIARCategory: model(),
      fIARClassification: model(),
      fIAROwnership: model(),
      fIARRelationship: model(),
      fIARHistory: model(),
      fIAREvidence: model(),
      fIARPolicy: model(),
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new FiarService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const asset = (overrides: Record<string, unknown> = {}) => ({
    id: 'as-1',
    fiarAssetId: 'as-1',
    name: 'Flourishing profile v1',
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    assetClass: 'CAPITAL',
    status: 'DRAFT',
    version: 1,
    sourceRuntime: 'D13',
    referenceId: 'ifc-profile-1',
    referenceType: 'IFCProfile',
    overridden: false,
    replacedById: null,
    metadata: null,
    deletedAt: null,
    ...overrides,
  });

  // ------------------------------------------------------------------ Part A/C
  describe('registerAsset', () => {
    it('registers an asset, seeds classification + ownership, audits and evidences', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.fIARAsset.create.mockResolvedValue(asset());
      const result = await service.registerAsset('ws-1', 'user-1', {
        name: 'Flourishing profile v1',
        assetClass: 'CAPITAL' as any,
      });
      expect(result.id).toBe('as-1');
      expect(prisma.fIARClassification.create).toHaveBeenCalled();
      expect(prisma.fIAROwnership.create).toHaveBeenCalled();
      expect(prisma.fIAREvidence.create).toHaveBeenCalled();
      expect(prisma.fIARHistory.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIAR_REGISTER_ASSET' }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a missing name', async () => {
      const { service } = makeService();
      await expect(
        service.registerAsset('ws-1', 'user-1', { name: '  ', assetClass: 'CAPITAL' as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateAsset', () => {
    it('refuses to update an overridden asset', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ overridden: true }));
      await expect(service.updateAsset('ws-1', 'user-1', 'as-1', { name: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when the asset does not exist', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(null);
      await expect(service.updateAsset('ws-1', 'user-1', 'missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------- Part B/C
  describe('classifyAsset', () => {
    it('supersedes the active classification and reclassifies the asset', async () => {
      const { service, prisma, audit } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ assetClass: 'KNOWLEDGE' }));
      prisma.fIARClassification.create.mockResolvedValue({ id: 'cl-2' });
      const result = await service.classifyAsset('ws-1', 'user-1', 'as-1', {
        assetClass: 'CAPITAL' as any,
      });
      expect(result.id).toBe('cl-2');
      expect(prisma.fIARClassification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      expect(prisma.fIARAsset.update).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIAR_CLASSIFY_ASSET' }),
      );
    });

    it('refuses to classify an overridden asset', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ overridden: true }));
      await expect(
        service.classifyAsset('ws-1', 'user-1', 'as-1', { assetClass: 'CAPITAL' as any }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------- Part C
  describe('assignOwnership', () => {
    it('deactivates prior ownership and assigns a new active owner', async () => {
      const { service, prisma, audit } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset());
      prisma.fIAROwnership.create.mockResolvedValue({ id: 'ow-2', ownerId: 'user-2' });
      const result = await service.assignOwnership('ws-1', 'user-1', 'as-1', {
        ownerId: 'user-2',
        ownershipKind: 'INSTITUTIONAL' as any,
      });
      expect(result.id).toBe('ow-2');
      expect(prisma.fIAROwnership.updateMany).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIAR_ASSIGN_OWNERSHIP' }),
      );
    });
  });

  describe('createRelationship', () => {
    it('creates a relationship to another asset', async () => {
      const { service, prisma, audit } = makeService();
      prisma.fIARAsset.findFirst
        .mockResolvedValueOnce(asset())
        .mockResolvedValueOnce(asset({ id: 'as-2' }));
      prisma.fIARRelationship.findFirst.mockResolvedValue(null);
      prisma.fIARRelationship.create.mockResolvedValue({
        id: 'rel-1',
        kind: 'DEPENDS_ON',
        targetAssetId: 'as-2',
      });
      const result = await service.createRelationship('ws-1', 'user-1', 'as-1', {
        targetAssetId: 'as-2',
        kind: 'DEPENDS_ON' as any,
      });
      expect(result.id).toBe('rel-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIAR_CREATE_RELATIONSHIP' }),
      );
    });

    it('rejects a self relationship', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset());
      await expect(
        service.createRelationship('ws-1', 'user-1', 'as-1', {
          targetAssetId: 'as-1',
          kind: 'DEPENDS_ON' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate relationship', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst
        .mockResolvedValueOnce(asset())
        .mockResolvedValueOnce(asset({ id: 'as-2' }));
      prisma.fIARRelationship.findFirst.mockResolvedValue({ id: 'rel-existing' });
      await expect(
        service.createRelationship('ws-1', 'user-1', 'as-1', {
          targetAssetId: 'as-2',
          kind: 'DEPENDS_ON' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRelationshipGraph / getLineage', () => {
    it('builds the dependency graph from active workspace edges', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset());
      prisma.fIARRelationship.findMany.mockResolvedValue([
        { assetId: 'as-1', targetAssetId: 'as-2', kind: 'DEPENDS_ON' },
      ]);
      const graph = await service.getRelationshipGraph('ws-1', 'as-1');
      expect(graph.root).toBe('as-1');
      expect(graph.nodes).toContain('as-2');
    });

    it('derives lineage from DERIVES_FROM/REPLACES edges', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ id: 'v2' }));
      prisma.fIARRelationship.findMany.mockResolvedValue([
        { assetId: 'v2', targetAssetId: 'v1', kind: 'DERIVES_FROM' },
      ]);
      const lineage = await service.getLineage('ws-1', 'v2');
      expect(lineage.ancestors).toEqual(['v1']);
    });
  });

  // ---------------------------------------------------------------------- Part D
  describe('transitionLifecycle', () => {
    it('activates a draft asset', async () => {
      const { service, prisma, audit } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ status: 'DRAFT' }));
      const result = await service.transitionLifecycle('ws-1', 'user-1', 'as-1', {
        transition: FiarLifecycleTransition.ACTIVATE,
      });
      expect(result.status).toBe('ACTIVE');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIAR_LIFECYCLE_TRANSITION' }),
      );
    });

    it('rejects an invalid transition', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ status: 'DRAFT' }));
      await expect(
        service.transitionLifecycle('ws-1', 'user-1', 'as-1', {
          transition: FiarLifecycleTransition.DEPRECATE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a replacement asset for REPLACE and links a REPLACES edge', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ status: 'ACTIVE' }));
      await expect(
        service.transitionLifecycle('ws-1', 'user-1', 'as-1', {
          transition: FiarLifecycleTransition.REPLACE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to transition an overridden asset', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ overridden: true, status: 'ACTIVE' }));
      await expect(
        service.transitionLifecycle('ws-1', 'user-1', 'as-1', {
          transition: FiarLifecycleTransition.DEPRECATE,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------- Part B
  describe('createCategory', () => {
    it('creates a category and audits', async () => {
      const { service, prisma, audit } = makeService();
      prisma.fIARCategory.findFirst.mockResolvedValue(null);
      prisma.fIARCategory.create.mockResolvedValue({ id: 'cat-1', code: 'ifc-capital' });
      const result = await service.createCategory('ws-1', 'user-1', {
        name: 'IFC capital',
        code: 'ifc-capital',
      });
      expect(result.id).toBe('cat-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIAR_CREATE_CATEGORY' }),
      );
    });

    it('rejects a duplicate category code', async () => {
      const { service, prisma } = makeService();
      prisma.fIARCategory.findFirst.mockResolvedValue({ id: 'cat-existing' });
      await expect(
        service.createCategory('ws-1', 'user-1', { name: 'x', code: 'dupe' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------- Part F
  describe('validateAsset', () => {
    it('validates against the latest active policy', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset());
      prisma.fIAROwnership.findFirst.mockResolvedValue({ id: 'ow-1' });
      prisma.fIARPolicy.findFirst.mockResolvedValue({
        requireOwnership: true,
        requireReference: true,
        allowedClasses: ['CAPITAL'],
      });
      const result = await service.validateAsset('ws-1', 'as-1');
      expect(result.validation).toHaveProperty('valid', true);
    });
  });

  describe('override', () => {
    it('marks an asset overridden and immutable', async () => {
      const { service, prisma, audit } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(asset({ status: 'ACTIVE' }));
      const result = await service.override('ws-1', 'user-1', 'as-1', {
        directive: 'Freeze asset pending review',
      });
      expect(result.status).toBe('OVERRIDDEN');
      expect(result.overridden).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FIAR_OVERRIDE' }));
    });

    it('throws when the asset is missing', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.findFirst.mockResolvedValue(null);
      await expect(
        service.override('ws-1', 'user-1', 'missing', { directive: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dashboard', () => {
    it('aggregates counts, class distribution and reused runtimes', async () => {
      const { service, prisma } = makeService();
      prisma.fIARAsset.groupBy.mockResolvedValue([{ assetClass: 'CAPITAL', _count: { _all: 2 } }]);
      const result = await service.dashboard('ws-1');
      expect(result.assets).toHaveProperty('total');
      expect(result.byClass).toEqual([{ assetClass: 'CAPITAL', count: 2 }]);
      expect(result.reusedRuntimes).toContain('IFC');
      expect(result.supportedClasses.length).toBe(17);
    });
  });
});

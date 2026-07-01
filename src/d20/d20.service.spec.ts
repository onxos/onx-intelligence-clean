import { BadRequestException } from '@nestjs/common';
import { D20Service } from './d20.service';

function makeModel() {
  return {
    create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest
      .fn()
      .mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({}),
  };
}

function makePrisma() {
  const prisma: any = {
    implementationUnit: makeModel(),
    implementationPackage: makeModel(),
    implementationDependency: makeModel(),
    implementationBoundary: makeModel(),
    implementationEvidence: makeModel(),
    implementationHistory: makeModel(),
    buildProfile: makeModel(),
    deploymentProfile: makeModel(),
  };
  prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(prisma));
  return prisma;
}

const ctx = { actorId: 'actor-1', requestId: 'req-1', ip: '127.0.0.1', userAgent: 'jest' };

describe('D20Service', () => {
  let prisma: any;
  let audit: any;
  let evidence: any;
  let svc: D20Service;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: jest.fn().mockResolvedValue(null) };
    evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) };
    svc = new D20Service(prisma, audit, evidence);
  });

  describe('registerUnit', () => {
    it('persists a DECLARED unit and audits', async () => {
      const result = await svc.registerUnit(
        'ws-1',
        'user-1',
        {
          name: 'Reasoning Engine',
          slug: 'reasoning-engine',
          kind: 'ENGINE',
          executionScope: 'runtime',
          ownership: 'core',
        } as any,
        ctx,
      );
      expect(prisma.implementationUnit.create).toHaveBeenCalled();
      expect(result.status).toBe('DECLARED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_REGISTER_UNIT', status: 'SUCCESS' }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a duplicate slug', async () => {
      prisma.implementationUnit.findFirst.mockResolvedValueOnce({ id: 'dup' });
      await expect(
        svc.registerUnit(
          'ws-1',
          'user-1',
          {
            name: 'X',
            slug: 'x',
            kind: 'ENGINE',
            executionScope: 's',
            ownership: 'o',
          } as any,
          ctx,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('registerPackage', () => {
    it('persists a package and audits', async () => {
      await svc.registerPackage('ws-1', 'user-1', { name: 'Core', slug: 'core' } as any, ctx);
      expect(prisma.implementationPackage.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_REGISTER_PACKAGE' }),
      );
    });
  });

  describe('declareDependency', () => {
    beforeEach(() => {
      prisma.implementationUnit.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.slug === 'a')
          return { id: 'unit-a', slug: 'a', name: 'A', kind: 'ENGINE', overridden: false };
        if (where.slug === 'b')
          return { id: 'unit-b', slug: 'b', name: 'B', kind: 'ENGINE', overridden: false };
        return null;
      });
      prisma.implementationUnit.findMany.mockResolvedValue([
        { id: 'unit-a', slug: 'a', name: 'A', kind: 'ENGINE' },
        { id: 'unit-b', slug: 'b', name: 'B', kind: 'ENGINE' },
      ]);
    });

    it('resolves slugs, records the edge and audits', async () => {
      const result = await svc.declareDependency(
        'ws-1',
        'user-1',
        { fromSlug: 'a', toSlug: 'b' } as any,
        ctx,
      );
      expect(prisma.implementationDependency.create).toHaveBeenCalled();
      expect(result.cyclic).toBe(false);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_DECLARE_DEPENDENCY' }),
      );
    });

    it('rejects self-dependency', async () => {
      await expect(
        svc.declareDependency('ws-1', 'user-1', { fromSlug: 'a', toSlug: 'a' } as any, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a duplicate dependency', async () => {
      prisma.implementationDependency.findFirst.mockResolvedValueOnce({ id: 'dep-dup' });
      await expect(
        svc.declareDependency('ws-1', 'user-1', { fromSlug: 'a', toSlug: 'b' } as any, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('detects a cycle with the new edge included', async () => {
      prisma.implementationDependency.findMany.mockResolvedValue([
        {
          fromUnitId: 'unit-b',
          toUnitId: 'unit-a',
          kind: 'REQUIRED',
          required: true,
          satisfied: true,
        },
      ]);
      const result = await svc.declareDependency(
        'ws-1',
        'user-1',
        { fromSlug: 'a', toSlug: 'b' } as any,
        ctx,
      );
      expect(result.cyclic).toBe(true);
    });
  });

  describe('declareBoundary', () => {
    it('creates the boundary and increments the count', async () => {
      prisma.implementationUnit.findFirst.mockResolvedValueOnce({
        id: 'unit-a',
        slug: 'a',
        overridden: false,
      });
      await svc.declareBoundary(
        'ws-1',
        'user-1',
        'unit-a',
        { kind: 'EXECUTION', scope: 'runtime' } as any,
        ctx,
      );
      expect(prisma.implementationBoundary.create).toHaveBeenCalled();
      expect(prisma.implementationUnit.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { boundaryCount: { increment: 1 } } }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_DECLARE_BOUNDARY' }),
      );
    });
  });

  describe('dependencyGraph', () => {
    it('returns the graph and validation', async () => {
      prisma.implementationUnit.findMany.mockResolvedValue([
        { id: 'unit-a', slug: 'a', name: 'A', kind: 'ENGINE' },
      ]);
      const result = await svc.dependencyGraph('ws-1');
      expect(result.graph).toBeDefined();
      expect(result.validation).toBeDefined();
    });
  });

  describe('createBuildProfile', () => {
    it('persists a build profile with an evaluation and audits', async () => {
      const result = await svc.createBuildProfile(
        'ws-1',
        'user-1',
        {
          name: 'CI Build',
          profile: 'ci',
          stages: ['RESOLVE_DEPENDENCIES', 'COMPILE', 'VALIDATE', 'PACKAGE', 'VERIFY', 'PUBLISH'],
          compatibility: [{ module: 'REASONING', level: 'COMPATIBLE' }],
        } as any,
        ctx,
      );
      expect(prisma.buildProfile.create).toHaveBeenCalled();
      expect(prisma.implementationEvidence.create).toHaveBeenCalled();
      expect(result.evaluation.valid).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_CREATE_BUILD' }),
      );
    });
  });

  describe('validateBuild', () => {
    it('revalidates and audits', async () => {
      prisma.buildProfile.findFirst.mockResolvedValueOnce({
        id: 'build-1',
        overridden: false,
        compatibility: [{ module: 'REASONING', level: 'COMPATIBLE' }],
        stages: ['RESOLVE_DEPENDENCIES', 'COMPILE', 'VALIDATE', 'PACKAGE', 'VERIFY', 'PUBLISH'],
        artifacts: [],
      });
      const result = await svc.validateBuild('ws-1', 'user-1', 'build-1', ctx);
      expect(result.evaluation.valid).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_VALIDATE_BUILD' }),
      );
    });
  });

  describe('createDeploymentProfile', () => {
    it('validates a staging deployment', async () => {
      const result = await svc.createDeploymentProfile(
        'ws-1',
        'user-1',
        { name: 'Staging', environment: 'STAGING' } as any,
        ctx,
      );
      expect(result.evaluation.valid).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_CREATE_DEPLOYMENT' }),
      );
    });

    it('fails a production deployment without rollback metadata', async () => {
      const result = await svc.createDeploymentProfile(
        'ws-1',
        'user-1',
        { name: 'Prod', environment: 'PRODUCTION' } as any,
        ctx,
      );
      expect(result.evaluation.valid).toBe(false);
    });
  });

  describe('validateDeployment', () => {
    it('revalidates and audits', async () => {
      prisma.deploymentProfile.findFirst.mockResolvedValueOnce({
        id: 'dep-1',
        overridden: false,
        environment: 'STAGING',
        buildProfileRef: null,
        rollbackMetadata: {},
      });
      const result = await svc.validateDeployment('ws-1', 'user-1', 'dep-1', ctx);
      expect(result.evaluation.valid).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'D20_VALIDATE_DEPLOYMENT' }),
      );
    });
  });

  describe('compatibilityReport', () => {
    it('aggregates build compatibility and lists reused modules', async () => {
      prisma.buildProfile.findMany.mockResolvedValue([
        { compatibility: [{ module: 'REASONING', level: 'COMPATIBLE' }] },
      ]);
      const result = await svc.compatibilityReport('ws-1');
      expect(result.report.overall).toBe('COMPATIBLE');
      expect(result.reusedModules).toEqual(expect.arrayContaining(['REASONING', 'DECISION']));
    });
  });

  describe('validateImplementation', () => {
    it('persists evidence and audits D20_VALIDATE', async () => {
      prisma.implementationUnit.findMany.mockResolvedValue([
        { id: 'unit-a', slug: 'a', name: 'A', kind: 'ENGINE' },
      ]);
      prisma.implementationBoundary.count.mockResolvedValue(1);
      const result = await svc.validateImplementation('ws-1', 'user-1', ctx);
      expect(result.validation.checks).toHaveLength(5);
      expect(prisma.implementationEvidence.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'D20_VALIDATE' }));
    });
  });

  describe('override', () => {
    it('locks the unit immutably and audits', async () => {
      prisma.implementationUnit.findFirst.mockResolvedValueOnce({
        id: 'unit-a',
        status: 'DECLARED',
        ownerId: 'owner-1',
      });
      const result = await svc.override(
        'ws-1',
        'user-1',
        'unit-a',
        { directive: 'freeze' } as any,
        ctx,
      );
      expect(result.overridden).toBe(true);
      expect(result.status).toBe('OVERRIDDEN');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'D20_OVERRIDE' }));
    });

    it('rejects an empty directive', async () => {
      prisma.implementationUnit.findFirst.mockResolvedValueOnce({
        id: 'unit-a',
        status: 'DECLARED',
        ownerId: 'owner-1',
      });
      await expect(
        svc.override('ws-1', 'user-1', 'unit-a', { directive: '  ' } as any, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('dashboard', () => {
    it('returns counts, groupings and governance constants', async () => {
      const groupBy = prisma.implementationUnit.groupBy as jest.Mock;
      groupBy
        .mockResolvedValueOnce([{ kind: 'ENGINE', _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ status: 'DECLARED', _count: { _all: 2 } }]);
      const result = await svc.dashboard('ws-1');
      expect(result.supportedKinds).toHaveLength(7);
      expect(result.buildStages).toHaveLength(6);
      expect(result.environments).toHaveLength(3);
      expect(result.reusedModules).toEqual(expect.arrayContaining(['REASONING', 'DECISION']));
      expect(result.byKind).toEqual([{ kind: 'ENGINE', count: 2 }]);
      expect(result.byStatus).toEqual([{ status: 'DECLARED', count: 2 }]);
    });
  });
});

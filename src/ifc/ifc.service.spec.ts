import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IfcService } from './ifc.service';

describe('IfcService (IFC)', () => {
  const makeService = () => {
    const model = () => ({
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'gen-1', ...data })),
      count: jest.fn().mockResolvedValue(0),
    });
    const prisma = {
      $transaction: jest.fn(),
      iFCProfile: model(),
      iFCDimension: model(),
      iFCIndicator: model(),
      iFCScore: model(),
      iFCSignal: model(),
      iFCHistory: model(),
      iFCEvidence: model(),
      iFCPolicy: model(),
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new IfcService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const profile = (overrides: Record<string, unknown> = {}) => ({
    id: 'pf-1',
    ifcProfileId: 'pf-1',
    name: 'ONX flourishing',
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    status: 'ACTIVE',
    flourishingIndex: 0.7,
    confidence: 0.8,
    trend: 'STABLE',
    risk: 'LOW',
    degraded: false,
    overridden: false,
    scoreSeq: 1,
    intentReferenceId: 'fic-1',
    objectiveReference: null,
    metadata: null,
    deletedAt: null,
    ...overrides,
  });

  const dimension = (overrides: Record<string, unknown> = {}) => ({
    id: 'dm-1',
    profileId: 'pf-1',
    workspaceId: 'ws-1',
    kind: 'KNOWLEDGE',
    name: 'Knowledge flourishing',
    status: 'ACTIVE',
    weight: 0.125,
    score: 0.5,
    confidence: 0.5,
    deletedAt: null,
    ...overrides,
  });

  // ------------------------------------------------------------------ Part A/B
  describe('createProfile', () => {
    it('creates a profile, seeds 8 dimensions, and audits/evidences', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.iFCProfile.create.mockResolvedValue(profile());
      const result = await service.createProfile('ws-1', 'user-1', {
        name: 'ONX flourishing',
      });
      expect(result.id).toBe('pf-1');
      expect(prisma.iFCDimension.create).toHaveBeenCalledTimes(8);
      expect(prisma.iFCEvidence.create).toHaveBeenCalled();
      expect(prisma.iFCHistory.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IFC_CREATE_PROFILE' }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('skips seeding when seedDimensions is false', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.create.mockResolvedValue(profile());
      await service.createProfile('ws-1', 'user-1', {
        name: 'ONX flourishing',
        seedDimensions: false,
      });
      expect(prisma.iFCDimension.create).not.toHaveBeenCalled();
    });

    it('rejects a missing name', async () => {
      const { service } = makeService();
      await expect(service.createProfile('ws-1', 'user-1', { name: '  ' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateProfile', () => {
    it('refuses to update an overridden profile', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile({ overridden: true }));
      await expect(service.updateProfile('ws-1', 'user-1', 'pf-1', { name: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('recordIndicator', () => {
    it('records an indicator and rolls up the dimension score', async () => {
      const { service, prisma, audit } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCDimension.findFirst.mockResolvedValue(dimension());
      prisma.iFCIndicator.create.mockResolvedValue({ id: 'in-1', value: 0.8 });
      prisma.iFCIndicator.findMany.mockResolvedValue([
        { value: 0.8, weight: 1, confidence: 0.9, status: 'ACTIVE' },
      ]);
      const result = await service.recordIndicator('ws-1', 'user-1', 'pf-1', {
        kind: 'KNOWLEDGE',
        name: 'coverage',
        value: 0.8,
      });
      expect(result.id).toBe('in-1');
      expect(prisma.iFCDimension.update).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IFC_RECORD_INDICATOR' }),
      );
    });

    it('rejects an indicator for a missing dimension', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCDimension.findFirst.mockResolvedValue(null);
      await expect(
        service.recordIndicator('ws-1', 'user-1', 'pf-1', {
          kind: 'TRUST',
          name: 'x',
          value: 0.5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------- Part C
  describe('calculateScore', () => {
    it('computes the flourishing index and updates the profile', async () => {
      const { service, prisma, audit } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile({ scoreSeq: 0 }));
      prisma.iFCDimension.findMany.mockResolvedValue([
        dimension({ kind: 'KNOWLEDGE', score: 0.9, confidence: 1, weight: 0.5 }),
        dimension({ id: 'dm-2', kind: 'CAPITAL', score: 0.7, confidence: 1, weight: 0.5 }),
      ]);
      prisma.iFCScore.create.mockImplementation(async ({ data }: any) => ({ id: 'sc-1', ...data }));
      const result = await service.calculateScore('ws-1', 'user-1', 'pf-1', {});
      expect(result.result.flourishingIndex).toBeGreaterThan(0);
      expect(prisma.iFCProfile.update).toHaveBeenCalled();
      expect(prisma.iFCEvidence.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IFC_CALCULATE_SCORE' }),
      );
    });

    it('rejects scoring a profile with no dimensions', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCDimension.findMany.mockResolvedValue([]);
      await expect(service.calculateScore('ws-1', 'user-1', 'pf-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to score an overridden profile', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile({ overridden: true }));
      await expect(service.calculateScore('ws-1', 'user-1', 'pf-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -------------------------------------------------------------------- Part D
  describe('capitalizationSignal', () => {
    it('emits a capitalization signal and allocation recommendation', async () => {
      const { service, prisma, audit } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCSignal.create.mockImplementation(async ({ data }: any) => ({
        id: 'sg-1',
        ...data,
      }));
      const result = await service.capitalizationSignal('ws-1', 'user-1', 'pf-1', {});
      expect(result.signal.id).toBe('sg-1');
      expect(typeof result.allocationRecommended).toBe('boolean');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IFC_CAPITALIZATION_SIGNAL' }),
      );
    });
  });

  // -------------------------------------------------------------------- Part E
  describe('alignmentCheck', () => {
    it('returns an alignment result and audits', async () => {
      const { service, prisma, audit } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCDimension.findFirst.mockResolvedValue(
        dimension({ kind: 'FOUNDER_ALIGNMENT', score: 0.9 }),
      );
      const result = await service.alignmentCheck('ws-1', 'user-1', 'pf-1');
      expect(result.alignment.aligned).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IFC_ALIGNMENT_CHECK' }),
      );
    });
  });

  // -------------------------------------------------------------------- Part F
  describe('validateProfile', () => {
    it('validates against the active policy', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCPolicy.findFirst.mockResolvedValue({ minIndex: 0.5, minConfidence: 0.4 });
      const result = await service.validateProfile('ws-1', 'pf-1');
      expect(result.validation.valid).toBe(true);
    });
  });

  describe('override', () => {
    it('applies an immutable override and locks the profile', async () => {
      const { service, prisma, audit } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(profile());
      prisma.iFCProfile.update.mockImplementation(async ({ data }: any) => ({
        id: 'pf-1',
        ...data,
      }));
      const result = await service.override('ws-1', 'user-1', 'pf-1', { directive: 'Freeze' });
      expect(result.overridden).toBe(true);
      expect(result.status).toBe('OVERRIDDEN');
      expect(prisma.iFCEvidence.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'IFC_OVERRIDE' }));
    });

    it('throws when the profile is missing', async () => {
      const { service, prisma } = makeService();
      prisma.iFCProfile.findFirst.mockResolvedValue(null);
      await expect(
        service.override('ws-1', 'user-1', 'missing', { directive: 'Freeze' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dashboard', () => {
    it('aggregates posture and lists reused runtimes', async () => {
      const { service } = makeService();
      const result = await service.dashboard('ws-1');
      expect(result.reusedRuntimes).toContain('D13');
      expect(result.reusedRuntimes).toContain('USFIP');
      expect(result.dimensions.supportedKinds.length).toBe(8);
    });
  });
});

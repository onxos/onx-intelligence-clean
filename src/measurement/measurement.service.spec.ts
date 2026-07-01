import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeasurementService } from './measurement.service';

describe('MeasurementService', () => {
  const makeService = () => {
    const prisma = {
      $transaction: jest.fn(),
      measurementProfile: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      measurementRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      measurementHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      measurementEvidence: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      measurementBenchmark: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      measurementFeedback: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new MeasurementService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const profile = (overrides: Record<string, unknown> = {}) => ({
    id: 'mp-1',
    profileId: 'mp-1',
    name: 'Understanding Quality',
    description: null,
    indexType: 'UQI',
    ownerId: 'user-1',
    workspaceId: 'ws-1',
    targetValue: 1,
    minimumValue: 0,
    weight: 1,
    normalizationMin: 0,
    normalizationMax: 100,
    currentScore: 0,
    currentConfidence: 0,
    progressState: 'NASCENT',
    trend: 'UNKNOWN',
    authority: 'OPERATIONAL',
    status: 'ACTIVE',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

  describe('createProfile', () => {
    it('creates a profile with an initial history event and audits success', async () => {
      const { service, prisma, audit, evidence } = makeService();
      prisma.measurementProfile.create.mockResolvedValue(profile());
      const result = await service.createProfile('ws-1', 'user-1', {
        name: 'Understanding Quality',
        indexType: 'UQI' as any,
      });
      expect(result.id).toBe('mp-1');
      expect(prisma.measurementHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'PROFILE_CREATED' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a blank name', async () => {
      const { service } = makeService();
      await expect(
        service.createProfile('ws-1', 'user-1', { name: '  ', indexType: 'UQI' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid index type', async () => {
      const { service } = makeService();
      await expect(
        service.createProfile('ws-1', 'user-1', { name: 'X', indexType: 'ZZZ' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a degenerate normalization band', async () => {
      const { service } = makeService();
      await expect(
        service.createProfile('ws-1', 'user-1', {
          name: 'X',
          indexType: 'UQI' as any,
          normalizationMin: 100,
          normalizationMax: 100,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listProfiles', () => {
    it('returns a paginated envelope', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findMany.mockResolvedValue([profile()]);
      prisma.measurementProfile.count.mockResolvedValue(1);
      const result = await service.listProfiles('ws-1', { page: 1, pageSize: 10 } as any);
      expect(result).toMatchObject({ total: 1, page: 1, pageSize: 10 });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('workspace isolation', () => {
    it('throws NotFound when the profile is in another workspace', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(null);
      await expect(service.getProfile('mp-1', 'ws-other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.measurementProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'mp-1', workspaceId: 'ws-other', deletedAt: null },
      });
    });

    it('scopes calculate() to the caller workspace', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(null);
      await expect(
        service.calculate('mp-1', 'ws-other', 'user-1', {
          components: [{ key: 'a', value: 5 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('calculate', () => {
    it('computes a score, persists a record and updates the profile', async () => {
      const { service, prisma, audit } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      prisma.measurementRecord.findMany.mockResolvedValue([]);
      prisma.measurementRecord.create.mockImplementation(async ({ data }: any) => ({
        id: 'rec-1',
        ...data,
      }));
      prisma.measurementProfile.update.mockImplementation(async ({ data }: any) => ({
        ...profile(),
        ...data,
      }));
      const result = await service.calculate('mp-1', 'ws-1', 'user-1', {
        components: [{ key: 'a', value: 50 }],
      } as any);
      expect(result.record.id).toBe('rec-1');
      expect(result.profile.currentScore).toBe(50);
      expect(prisma.measurementHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventType: 'CALCULATED' }) }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEASUREMENT_CALCULATED', success: true }),
      );
    });

    it('rejects a calculation with no components', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      await expect(
        service.calculate('mp-1', 'ws-1', 'user-1', { components: [] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('trend', () => {
    it('summarises the record series with an average score', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile({ currentScore: 60 }));
      prisma.measurementRecord.findMany.mockResolvedValue([
        {
          id: 'r2',
          normalizedScore: 60,
          confidence: 1,
          delta: 20,
          trend: 'RISING',
          progressState: 'IMPROVEMENT',
          createdAt: new Date(),
        },
        {
          id: 'r1',
          normalizedScore: 40,
          confidence: 1,
          delta: 0,
          trend: 'UNKNOWN',
          progressState: 'NASCENT',
          createdAt: new Date(),
        },
      ]);
      const result = await service.trend('mp-1', 'ws-1');
      expect(result.points).toBe(2);
      expect(result.averageScore).toBe(50);
      expect(result.series).toHaveLength(2);
    });
  });

  describe('createBenchmark', () => {
    it('creates a benchmark and returns its comparison', async () => {
      const { service, prisma, audit } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile({ currentScore: 80 }));
      prisma.measurementBenchmark.create.mockImplementation(async ({ data }: any) => ({
        id: 'bm-1',
        ...data,
      }));
      const result = await service.createBenchmark('mp-1', 'ws-1', 'user-1', {
        name: 'Target',
        value: 70,
      } as any);
      expect(result.comparison).toEqual({ benchmarkDelta: 10, met: true });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEASUREMENT_BENCHMARK_SET', success: true }),
      );
    });

    it('rejects an invalid comparator', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      await expect(
        service.createBenchmark('mp-1', 'ws-1', 'user-1', {
          name: 'Target',
          value: 70,
          comparator: 'NEQ' as any,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('addEvidence', () => {
    it('links evidence and audits the mutation', async () => {
      const { service, prisma, audit } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      prisma.measurementEvidence.create.mockResolvedValue({ id: 'me-1', profileId: 'mp-1' });
      const result = await service.addEvidence('mp-1', 'ws-1', 'user-1', {
        description: 'Supporting artefact',
      } as any);
      expect(result.id).toBe('me-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEASUREMENT_EVIDENCE_ADDED', success: true }),
      );
    });

    it('rejects blank evidence descriptions', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      await expect(
        service.addEvidence('mp-1', 'ws-1', 'user-1', { description: '  ' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recordFeedback', () => {
    it('records a feedback signal with a history event', async () => {
      const { service, prisma, audit } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      prisma.measurementFeedback.create.mockImplementation(async ({ data }: any) => ({
        id: 'fb-1',
        ...data,
      }));
      const result = await service.recordFeedback('mp-1', 'ws-1', 'user-1', {
        feedbackType: 'LEARNING_FEEDBACK' as any,
        targetType: 'IUC',
        targetId: 'iuc-1',
      } as any);
      expect(result.id).toBe('fb-1');
      expect(prisma.measurementHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ eventType: 'FEEDBACK_RECORDED' }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEASUREMENT_FEEDBACK_RECORDED', success: true }),
      );
    });
  });

  describe('recordFailure', () => {
    it('records a failure dimension with mandatory notes', async () => {
      const { service, prisma, audit } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      prisma.measurementHistory.create.mockResolvedValue({
        id: 'h-1',
        failureType: 'LOW_CONFIDENCE',
        severity: 'HIGH',
      });
      const result = await service.recordFailure('mp-1', 'ws-1', 'user-1', {
        failureType: 'LOW_CONFIDENCE' as any,
        severity: 'HIGH',
        notes: 'Confidence collapsed below threshold',
      } as any);
      expect(result.id).toBe('h-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEASUREMENT_FAILURE_RECORDED', success: true }),
      );
    });

    it('rejects a failure without notes', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findFirst.mockResolvedValue(profile());
      await expect(
        service.recordFailure('mp-1', 'ws-1', 'user-1', {
          failureType: 'LOW_CONFIDENCE' as any,
          notes: '  ',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('failureReport', () => {
    it('aggregates failures by type', async () => {
      const { service, prisma } = makeService();
      prisma.measurementHistory.findMany.mockResolvedValue([
        { failureType: 'LOW_CONFIDENCE' },
        { failureType: 'LOW_CONFIDENCE' },
        { failureType: 'MISSING_EVIDENCE' },
      ]);
      const result = await service.failureReport('ws-1');
      expect(result.total).toBe(3);
      expect(result.byType).toEqual({ LOW_CONFIDENCE: 2, MISSING_EVIDENCE: 1 });
    });
  });

  describe('dashboard', () => {
    it('produces a composite posture across profiles', async () => {
      const { service, prisma } = makeService();
      prisma.measurementProfile.findMany.mockResolvedValue([
        profile({
          id: 'a',
          indexType: 'UQI',
          currentScore: 80,
          currentConfidence: 0.9,
          weight: 1,
          progressState: 'IMPROVEMENT',
        }),
        profile({
          id: 'b',
          indexType: 'JQI',
          currentScore: 40,
          currentConfidence: 0.2,
          weight: 1,
          progressState: 'GROWTH',
        }),
      ]);
      prisma.measurementHistory.count.mockResolvedValue(2);
      const result = await service.dashboard('ws-1');
      expect(result.totalProfiles).toBe(2);
      expect(result.compositeScore).toBe(60);
      expect(result.lowConfidenceCount).toBe(1);
      expect(result.totalFailures).toBe(2);
      expect(result.byIndexType.UQI.count).toBe(1);
      expect(result.byProgressState).toMatchObject({ IMPROVEMENT: 1, GROWTH: 1 });
    });
  });
});

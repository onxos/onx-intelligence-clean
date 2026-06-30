import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntelligenceFeedingService } from './intelligence-feeding.service';
import {
  isValidFeedStageTransition,
  FEED_STAGE_TRANSITIONS,
} from './intelligence-feeding.constants';

describe('IntelligenceFeedingService', () => {
  const makeService = () => {
    const prisma = {
      isConnected: jest.fn().mockReturnValue(false),
      $transaction: jest.fn(),
      intelligenceSource: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      intelligenceFeed: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      feedPipelineEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      intelligenceObject: {
        findFirst: jest.fn(),
      },
    } as any;
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new IntelligenceFeedingService(prisma, audit);
    return { prisma, audit, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const source = (overrides: Record<string, unknown> = {}) => ({
    id: 'src-1',
    identity: 'Source',
    category: 'INTERNAL',
    authorityLevel: 'INSTITUTIONAL',
    ownershipClass: 'INSTITUTIONAL',
    trustScore: 0.7,
    confidenceScore: 0.7,
    status: 'ACTIVE',
    workspaceId: 'ws-1',
    createdById: 'user-1',
    deletedAt: null,
    ...overrides,
  });

  const feed = (overrides: Record<string, unknown> = {}) => ({
    id: 'feed-1',
    sourceId: 'src-1',
    payload: 'payload',
    contentHash: 'hash',
    stage: 'RECEIVED',
    shadowMode: 'ACTIVE',
    trustScore: 0.7,
    provenanceScore: 0.6,
    verificationScore: 0.6,
    confidenceScore: 0.7,
    createdById: 'user-1',
    workspaceId: 'ws-1',
    deletedAt: null,
    ...overrides,
  });

  it('lifecycle transition map only allows declared edges', () => {
    expect(isValidFeedStageTransition('RECEIVED', 'NORMALIZED')).toBe(true);
    expect(isValidFeedStageTransition('RECEIVED', 'ACCEPTED')).toBe(false);
    expect(isValidFeedStageTransition('ARCHIVED', 'RECEIVED')).toBe(false);
    expect(isValidFeedStageTransition('NORMALIZED', 'NORMALIZED')).toBe(false);
    expect(FEED_STAGE_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it('computes a composite trust score within [0,1]', () => {
    const { service } = makeService();
    const score = service.computeTrust({
      confidence: 0.8,
      authorityLevel: 'SOVEREIGN' as any,
      provenance: 0.7,
      verification: 0.9,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('creates a source and audits success', async () => {
    const { service, prisma, audit } = makeService();
    prisma.intelligenceSource.create.mockResolvedValue(source());
    const result = await service.createSource(
      'ws-1',
      'user-1',
      { identity: 'Source' },
      { actorId: 'user-1' },
    );
    expect(result.id).toBe('src-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_SOURCE_CREATED', success: true }),
    );
  });

  it('rejects source creation with empty identity and audits failure', async () => {
    const { service, audit } = makeService();
    await expect(
      service.createSource('ws-1', 'user-1', { identity: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_SOURCE_CREATED', success: false }),
    );
  });

  it('ingests a feed against an ACTIVE source and writes a pipeline event', async () => {
    const { service, prisma, audit } = makeService();
    prisma.intelligenceSource.findFirst.mockResolvedValue(source());
    const tx = {
      intelligenceFeed: { create: jest.fn().mockResolvedValue(feed()) },
      feedPipelineEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.ingestFeed('ws-1', 'user-1', {
      sourceId: 'src-1',
      payload: 'payload',
    });
    expect(result.id).toBe('feed-1');
    expect(tx.feedPipelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ toStage: 'RECEIVED' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_FEED_INGESTED', success: true }),
    );
  });

  it('refuses to ingest from a non-ACTIVE source', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceSource.findFirst.mockResolvedValue(source({ status: 'SUSPENDED' }));
    await expect(
      service.ingestFeed('ws-1', 'user-1', { sourceId: 'src-1', payload: 'payload' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validation gate passes for a healthy feed', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceFeed.findFirst
      .mockResolvedValueOnce(feed({ trustScore: 0.7 })) // getFeed
      .mockResolvedValueOnce(null); // duplicate lookup
    prisma.intelligenceSource.findFirst.mockResolvedValue(source());
    const result = await service.validateFeed('feed-1', 'ws-1');
    expect(result.valid).toBe(true);
    expect(result.failedRules).toEqual([]);
  });

  it('validation gate fails on low trust + duplication', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceFeed.findFirst
      .mockResolvedValueOnce(feed({ trustScore: 0.1, provenanceScore: 0 })) // getFeed
      .mockResolvedValueOnce(feed({ id: 'feed-2' })); // duplicate lookup
    prisma.intelligenceSource.findFirst.mockResolvedValue(source());
    const result = await service.validateFeed('feed-1', 'ws-1');
    expect(result.valid).toBe(false);
    expect(result.failedRules).toEqual(expect.arrayContaining(['trust', 'duplication']));
  });

  it('rejects an invalid pipeline transition', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceFeed.findFirst.mockResolvedValue(feed({ stage: 'RECEIVED' }));
    await expect(
      service.advanceFeed('feed-1', 'ws-1', 'user-1', { toStage: 'ACCEPTED' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the validation gate when entering VALIDATED', async () => {
    const { service, prisma } = makeService();
    // getFeed (advance) -> NORMALIZED stage
    prisma.intelligenceFeed.findFirst
      .mockResolvedValueOnce(feed({ stage: 'NORMALIZED' })) // advanceFeed.getFeed
      .mockResolvedValueOnce(feed({ stage: 'NORMALIZED', trustScore: 0.05, provenanceScore: 0 })) // validateFeed.getFeed
      .mockResolvedValueOnce(null); // duplicate lookup
    prisma.intelligenceSource.findFirst.mockResolvedValue(source());
    await expect(
      service.advanceFeed('feed-1', 'ws-1', 'user-1', { toStage: 'VALIDATED' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets shadow mode and audits', async () => {
    const { service, prisma, audit } = makeService();
    prisma.intelligenceFeed.findFirst.mockResolvedValue(feed({ shadowMode: 'ACTIVE' }));
    prisma.intelligenceFeed.update.mockResolvedValue(feed({ shadowMode: 'SHADOW' }));
    const result = await service.setShadowMode('feed-1', 'ws-1', 'user-1', {
      shadowMode: 'SHADOW' as any,
    });
    expect(result.shadowMode).toBe('SHADOW');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_FEED_SHADOW_SET', success: true }),
    );
  });

  it('throws NotFound for a missing source', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceSource.findFirst.mockResolvedValue(null);
    await expect(service.getSource('missing', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  resolveRealityTier,
  SC05_MIN_OCCURRENCES,
  SC08_MIN_SOURCES,
} from './understanding.constants';
import { PatternDetectionService } from './pattern-detection.service';
import { ContextMatchingService } from './context-matching.service';
import { MeaningExtractionService } from './meaning-extraction.service';
import { UnderstandingService } from './understanding.service';

describe('understanding constants (HC-10 thresholds)', () => {
  it('enforces SC-05 (3) and SC-08 (2) thresholds', () => {
    expect(SC05_MIN_OCCURRENCES).toBe(3);
    expect(SC08_MIN_SOURCES).toBe(2);
  });

  it('resolves reality tiers from confidence (HC-03)', () => {
    expect(resolveRealityTier(0.9)).toBe('proven');
    expect(resolveRealityTier(0.7)).toBe('probable');
    expect(resolveRealityTier(0.3)).toBe('speculative');
  });
});

const perception = (recordId: string, domain = 'clinical', score = 0.9) => ({
  id: recordId,
  recordId,
  classifiedDomain: domain,
  evidenceScore: score,
  createdAt: new Date('2026-07-01T00:00:00Z'),
});

const makeInfra = () => {
  const prisma = {
    usfipPerceptionRecord: { findMany: jest.fn() },
    detectedPattern: {
      create: jest.fn(async ({ data }: any) => ({ id: 'pt-1', patternId: 'PT-1', ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    contextualizedPattern: {
      create: jest.fn(async ({ data }: any) => ({ id: 'cx-1', contextId: 'CX-1', ...data })),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    understandingObject: {
      create: jest.fn(async ({ data }: any) => ({ id: 'un-1', understandingId: 'UN-1', ...data })),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  } as any;
  const audit = { log: jest.fn().mockResolvedValue(null) } as any;
  const sech = { route: jest.fn() } as any;
  const iurg = {
    findNodeBySourceCheck: jest.fn().mockResolvedValue({ nodeType: 'ENFORCEMENT', id: 'iurg-1' }),
    createLink: jest.fn().mockResolvedValue({ edgeId: 'EDGE-1' }),
  } as any;
  return { prisma, audit, sech, iurg };
};

const route = (status: string) => ({
  id: `route-${status}`,
  status,
  gateResults: [{ checkId: `chk-${status}` }],
});

describe('T1 PatternDetectionService (SC-05)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects fewer than 3 occurrences (SC-05)', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.usfipPerceptionRecord.findMany.mockResolvedValue([
      perception('RC-1'),
      perception('RC-2'),
    ]);
    const svc = new PatternDetectionService(prisma, audit, sech, iurg);
    await expect(
      svc.detectPatterns('ws-1', 'user-1', { perceptionIds: ['RC-1', 'RC-2'] }),
    ).rejects.toThrow(BadRequestException);
    expect(sech.route).not.toHaveBeenCalled();
  });

  it('detects a pattern with 3+ occurrences and links perceptions into IURG', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.usfipPerceptionRecord.findMany.mockResolvedValue([
      perception('RC-1'),
      perception('RC-2'),
      perception('RC-3'),
    ]);
    sech.route.mockResolvedValue(route('COMPLETED'));
    const svc = new PatternDetectionService(prisma, audit, sech, iurg);
    const out = await svc.detectPatterns('ws-1', 'user-1', {
      perceptionIds: ['RC-1', 'RC-2', 'RC-3'],
      patternType: 'behavioral',
    });
    expect(out.status).toBe('detected');
    expect(out.occurrenceCount).toBe(3);
    expect(out.domain).toBe('clinical');
    expect(out.iurgNodeId).toBe('iurg-1');
    // T1 edge realized_as per source perception.
    expect(iurg.createLink).toHaveBeenCalledTimes(3);
    expect(iurg.createLink.mock.calls[0][1]).toBe('REALIZED_AS');
  });

  it('marks the pattern rejected when SECH blocks it (no edges)', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.usfipPerceptionRecord.findMany.mockResolvedValue([
      perception('RC-1'),
      perception('RC-2'),
      perception('RC-3'),
    ]);
    sech.route.mockResolvedValue(route('REJECTED'));
    const svc = new PatternDetectionService(prisma, audit, sech, iurg);
    const out = await svc.detectPatterns('ws-1', 'user-1', {
      perceptionIds: ['RC-1', 'RC-2', 'RC-3'],
    });
    expect(out.status).toBe('rejected');
    expect(iurg.createLink).not.toHaveBeenCalled();
  });
});

describe('T2 ContextMatchingService (SC-08)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects fewer than 2 sources (SC-08)', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.detectedPattern.findFirst.mockResolvedValue({
      id: 'pt-1',
      patternId: 'PT-1',
      domain: 'clinical',
      patternType: 'behavioral',
      confidence: 0.8,
      perceptionIds: ['RC-1'],
    });
    const svc = new ContextMatchingService(prisma, audit, sech, iurg);
    await expect(svc.matchContext('ws-1', 'user-1', { patternId: 'PT-1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('contextualizes with 2+ sources and links validated_by', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.detectedPattern.findFirst.mockResolvedValue({
      id: 'pt-1',
      patternId: 'PT-1',
      domain: 'clinical',
      patternType: 'behavioral',
      confidence: 0.8,
      perceptionIds: ['RC-1', 'RC-2', 'RC-3'],
    });
    sech.route.mockResolvedValue(route('COMPLETED'));
    const svc = new ContextMatchingService(prisma, audit, sech, iurg);
    const out = await svc.matchContext('ws-1', 'user-1', {
      patternId: 'PT-1',
      matchedContexts: ['PT-0'],
    });
    expect(out.status).toBe('contextualized');
    expect(out.sourceCount).toBe(3);
    expect(iurg.createLink).toHaveBeenCalledWith(
      'ws-1',
      'VALIDATED_BY',
      expect.objectContaining({ type: 'PATTERN' }),
      expect.objectContaining({ type: 'CONTEXT' }),
      'T2_CONTEXT_MATCHING',
    );
  });

  it('throws NotFound for a missing pattern', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.detectedPattern.findFirst.mockResolvedValue(null);
    const svc = new ContextMatchingService(prisma, audit, sech, iurg);
    await expect(svc.matchContext('ws-1', 'user-1', { patternId: 'nope' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('T3 MeaningExtractionService (HC-10)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('extracts explicit meaning + reality tier and links realized_as', async () => {
    const { prisma, audit, sech, iurg } = makeInfra();
    prisma.contextualizedPattern.findFirst.mockResolvedValue({
      id: 'cx-1',
      contextId: 'CX-1',
      patternId: 'PT-1',
      domain: 'clinical',
      interpretation: 'recurring signal',
      enrichedConfidence: 0.9,
    });
    sech.route.mockResolvedValue(route('COMPLETED'));
    const svc = new MeaningExtractionService(prisma, audit, sech, iurg);
    const out = await svc.extractMeaning('ws-1', 'user-1', { contextId: 'CX-1' });
    expect(out.status).toBe('preliminary');
    expect(out.meaning).toBeTruthy(); // HC-10: always explicit
    expect(out.realityTier).toBe('proven');
    expect(iurg.createLink).toHaveBeenCalledWith(
      'ws-1',
      'REALIZED_AS',
      expect.objectContaining({ type: 'CONTEXT' }),
      expect.objectContaining({ type: 'UNDERSTANDING' }),
      'T3_MEANING_EXTRACTION',
    );
  });
});

describe('UnderstandingService pipeline', () => {
  beforeEach(() => jest.clearAllMocks());

  const makePipeline = () => {
    const prisma = {
      detectedPattern: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      contextualizedPattern: { count: jest.fn().mockResolvedValue(0) },
      understandingObject: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const t1 = { detectPatterns: jest.fn() } as any;
    const t2 = { matchContext: jest.fn() } as any;
    const t3 = { extractMeaning: jest.fn() } as any;
    const svc = new UnderstandingService(prisma, t1, t2, t3);
    return { prisma, t1, t2, t3, svc };
  };

  it('runs T1 -> T2 -> T3 end-to-end', async () => {
    const { svc, t1, t2, t3 } = makePipeline();
    t1.detectPatterns.mockResolvedValue({ patternId: 'PT-1', status: 'detected' });
    t2.matchContext.mockResolvedValue({ contextId: 'CX-1', status: 'contextualized' });
    t3.extractMeaning.mockResolvedValue({ understandingId: 'UN-1', status: 'preliminary' });

    const out = await svc.runPipeline('ws-1', 'user-1', {
      perceptionIds: ['RC-1', 'RC-2', 'RC-3'],
    });
    expect(out.stage).toBe('T3');
    expect(out.understanding?.understandingId).toBe('UN-1');
    expect(t1.detectPatterns).toHaveBeenCalled();
    expect(t2.matchContext).toHaveBeenCalledWith(
      'ws-1',
      'user-1',
      expect.objectContaining({ patternId: 'PT-1' }),
      undefined,
    );
    expect(t3.extractMeaning).toHaveBeenCalled();
  });

  it('stops at T1 when the pattern is rejected', async () => {
    const { svc, t1, t2 } = makePipeline();
    t1.detectPatterns.mockResolvedValue({ patternId: 'PT-1', status: 'rejected' });
    const out = await svc.runPipeline('ws-1', 'user-1', {
      perceptionIds: ['RC-1', 'RC-2', 'RC-3'],
    });
    expect(out.stage).toBe('T1');
    expect(out.understanding).toBeNull();
    expect(t2.matchContext).not.toHaveBeenCalled();
  });

  it('stats reports transform counts', async () => {
    const { svc, prisma } = makePipeline();
    prisma.detectedPattern.count.mockResolvedValue(4);
    prisma.contextualizedPattern.count.mockResolvedValue(3);
    prisma.understandingObject.count.mockResolvedValue(2);
    prisma.understandingObject.groupBy.mockResolvedValue([
      { realityTier: 'proven', _count: { _all: 2 } },
    ]);
    const out = await svc.stats('ws-1');
    expect(out.transforms).toEqual({ T1_patterns: 4, T2_contexts: 3, T3_understandings: 2 });
    expect(out.byRealityTier.proven).toBe(2);
    expect(out.perceptionToUnderstandingRatio).toBe(0.5);
  });
});

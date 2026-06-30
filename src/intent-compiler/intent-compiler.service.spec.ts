import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  authorityRank,
  FIC_LIFECYCLE_TRANSITIONS,
  isValidLifecycleTransition,
} from './intent-compiler.constants';
import { IntentCompilerService } from './intent-compiler.service';

describe('IntentCompilerService', () => {
  const makeService = () => {
    const prisma = {
      isConnected: jest.fn().mockReturnValue(false),
      $transaction: jest.fn(),
      founderIntent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      founderIntentVersion: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      founderIntentRelationship: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      founderIntentReview: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      founderIntentConflict: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      founderOverrideEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;
    // $transaction invokes its callback with the prisma mock acting as the tx client.
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const evidence = { create: jest.fn().mockResolvedValue({ id: 'ev-1' }) } as any;
    const service = new IntentCompilerService(prisma, audit, evidence);
    return { prisma, audit, evidence, service };
  };

  beforeEach(() => jest.clearAllMocks());

  const intent = (overrides: Record<string, unknown> = {}) => ({
    id: 'fi-1',
    intentId: 'fi-1',
    title: 'Sovereign capital discipline',
    description: 'All capital must flow through governed FIC directives.',
    rationale: null,
    constitutionalAuthority: 'FOUNDER',
    priority: 'HIGH',
    ownerId: 'user-1',
    dependencies: [],
    affectedDomains: ['CAPITAL'],
    lifecycle: 'DRAFT',
    status: 'DRAFT',
    version: 1,
    majorVersion: 1,
    minorVersion: 0,
    revisionVersion: 0,
    parentIntentId: null,
    supersededById: null,
    contentHash: 'hash-a',
    metadata: {},
    workspaceId: 'ws-1',
    createdById: 'user-1',
    deletedAt: null,
    ...overrides,
  });

  // -- Lifecycle constants --------------------------------------------------

  describe('lifecycle transitions', () => {
    it('allows DRAFT -> SUBMITTED', () => {
      expect(isValidLifecycleTransition('DRAFT', 'SUBMITTED')).toBe(true);
    });
    it('rejects DRAFT -> ACTIVE (skipping review)', () => {
      expect(isValidLifecycleTransition('DRAFT', 'ACTIVE')).toBe(false);
    });
    it('rejects identity transitions', () => {
      expect(isValidLifecycleTransition('ACTIVE', 'ACTIVE')).toBe(false);
    });
    it('treats ARCHIVED as terminal', () => {
      expect(FIC_LIFECYCLE_TRANSITIONS.ARCHIVED).toEqual([]);
    });
  });

  describe('authorityRank', () => {
    it('ranks FOUNDER above INSTITUTIONAL', () => {
      expect(authorityRank('FOUNDER')).toBeGreaterThan(authorityRank('INSTITUTIONAL'));
    });
    it('returns -1 for unknown authority', () => {
      expect(authorityRank('UNKNOWN')).toBe(-1);
    });
  });

  // -- Create ---------------------------------------------------------------

  describe('createIntent', () => {
    it('creates an intent with an initial MAJOR version', async () => {
      const { prisma, service, evidence } = makeService();
      const created = intent();
      prisma.founderIntent.create.mockResolvedValue(created);
      prisma.founderIntentVersion.create.mockResolvedValue({ id: 'v-1' });

      const result = await service.createIntent('ws-1', 'user-1', {
        title: created.title,
        description: created.description,
        constitutionalAuthority: 'FOUNDER',
      } as any);

      expect(result).toEqual(created);
      expect(prisma.founderIntentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ versionNumber: 1, versionType: 'MAJOR', isActive: true }),
        }),
      );
      expect(evidence.create).toHaveBeenCalled();
    });

    it('rejects a missing title', async () => {
      const { service } = makeService();
      await expect(
        service.createIntent('ws-1', 'user-1', {
          title: '',
          description: 'x',
          constitutionalAuthority: 'FOUNDER',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -- Update / versioning --------------------------------------------------

  describe('updateIntent', () => {
    it('bumps the revision and writes a new active version', async () => {
      const { prisma, service } = makeService();
      const existing = intent();
      prisma.founderIntent.findFirst.mockResolvedValue(existing);
      prisma.founderIntent.update.mockResolvedValue(
        intent({ version: 2, revisionVersion: 1, title: 'Updated' }),
      );
      prisma.founderIntentVersion.updateMany.mockResolvedValue({ count: 1 });
      prisma.founderIntentVersion.create.mockResolvedValue({ id: 'v-2' });

      const result = await service.updateIntent('fi-1', 'ws-1', 'user-1', {
        title: 'Updated',
      } as any);

      expect(result.version).toBe(2);
      expect(prisma.founderIntentVersion.updateMany).toHaveBeenCalled();
      expect(prisma.founderIntentVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ versionType: 'REVISION' }) }),
      );
    });

    it('rejects updating an archived intent', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(intent({ lifecycle: 'ARCHIVED' }));
      await expect(
        service.updateIntent('fi-1', 'ws-1', 'user-1', { title: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -- Lifecycle ------------------------------------------------------------

  describe('transitionLifecycle', () => {
    it('rejects an invalid transition', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(intent({ lifecycle: 'DRAFT' }));
      await expect(
        service.transitionLifecycle('fi-1', 'ws-1', 'user-1', { to: 'ACTIVE' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies a valid transition', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(intent({ lifecycle: 'DRAFT' }));
      prisma.founderIntent.update.mockResolvedValue(intent({ lifecycle: 'SUBMITTED' }));
      const result = await service.transitionLifecycle('fi-1', 'ws-1', 'user-1', {
        to: 'SUBMITTED',
      } as any);
      expect(result.lifecycle).toBe('SUBMITTED');
    });
  });

  // -- Override -------------------------------------------------------------

  describe('overrideIntent', () => {
    it('requires a priority value for a PRIORITY override', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(intent());
      await expect(
        service.overrideIntent('fi-1', 'ws-1', 'user-1', {
          overrideType: 'PRIORITY',
          reason: 'r',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records an immutable override event', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(intent({ priority: 'LOW' }));
      prisma.founderIntent.update.mockResolvedValue(intent({ priority: 'CRITICAL' }));
      prisma.founderOverrideEvent.create.mockResolvedValue({ id: 'ovr-1' });
      const result = await service.overrideIntent('fi-1', 'ws-1', 'user-1', {
        overrideType: 'PRIORITY',
        priority: 'CRITICAL',
        reason: 'Founder directive',
      } as any);
      expect(result.override.id).toBe('ovr-1');
      expect(prisma.founderOverrideEvent.create).toHaveBeenCalled();
    });
  });

  // -- Conflict engine ------------------------------------------------------

  describe('detectConflicts', () => {
    it('detects a duplicate intent by content hash', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(intent({ contentHash: 'dup' }));
      prisma.founderIntent.findMany.mockResolvedValue([
        intent({ id: 'fi-2', contentHash: 'dup', title: 'Other' }),
      ]);
      prisma.founderIntentRelationship.findMany.mockResolvedValue([]);
      prisma.founderIntentConflict.findMany.mockResolvedValue([]);
      prisma.founderIntentConflict.create.mockResolvedValue({
        id: 'c-1',
        conflictType: 'DUPLICATE',
      });

      const result = await service.detectConflicts('fi-1', 'ws-1', 'user-1');
      expect(result.autoResolution).toBe(false);
      expect(result.report.some((c) => c.conflictType === 'DUPLICATE')).toBe(true);
    });

    it('detects a circular dependency', async () => {
      const { prisma, service } = makeService();
      const a = intent({ id: 'a', dependencies: ['b'], contentHash: 'ha' });
      const b = intent({ id: 'b', dependencies: ['a'], contentHash: 'hb', title: 'B' });
      prisma.founderIntent.findFirst.mockResolvedValue(a);
      prisma.founderIntent.findMany.mockResolvedValue([b]);
      prisma.founderIntentRelationship.findMany.mockResolvedValue([]);
      prisma.founderIntentConflict.findMany.mockResolvedValue([]);
      prisma.founderIntentConflict.create.mockResolvedValue({
        id: 'c-2',
        conflictType: 'CIRCULAR_DEPENDENCY',
      });

      const result = await service.detectConflicts('a', 'ws-1', 'user-1');
      expect(result.report.some((c) => c.conflictType === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });
  });

  // -- Not found ------------------------------------------------------------

  describe('getIntent', () => {
    it('throws when the intent does not exist', async () => {
      const { prisma, service } = makeService();
      prisma.founderIntent.findFirst.mockResolvedValue(null);
      await expect(service.getIntent('missing', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

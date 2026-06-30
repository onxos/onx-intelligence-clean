import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IntelligenceObjectService } from './intelligence-object.service';
import { isValidLifecycleTransition, LIFECYCLE_TRANSITIONS } from './intelligence-object.constants';

describe('IntelligenceObjectService', () => {
  const makeService = () => {
    const prisma = {
      isConnected: jest.fn().mockReturnValue(false),
      $transaction: jest.fn(),
      intelligenceObject: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      intelligenceObjectLifecycleEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      intelligenceObjectRelationship: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      intelligenceObjectProvenance: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    } as any;

    const audit = { log: jest.fn().mockResolvedValue(null) } as any;
    const service = new IntelligenceObjectService(prisma, audit);
    return { prisma, audit, service };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseObject = (overrides: Record<string, unknown> = {}) => ({
    id: 'obj-1',
    name: 'Object',
    content: 'Payload',
    contentHash: 'hash',
    objectType: 'KNOWLEDGE',
    lifecycleState: 'DRAFT',
    authorityLevel: 'OPERATIONAL',
    trustScore: 0.5,
    confidenceScore: 0.5,
    amanahScore: 0.5,
    qualityIndex: 0.5,
    ownerId: 'user-1',
    creatorId: 'user-1',
    workspaceId: 'ws-1',
    deletedAt: null,
    ...overrides,
  });

  it('creates an object, writes a lifecycle event, and audits success', async () => {
    const { service, prisma, audit } = makeService();
    const tx = {
      intelligenceObject: { create: jest.fn().mockResolvedValue(baseObject()) },
      intelligenceObjectLifecycleEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const result = await service.create(
      'ws-1',
      'user-1',
      { name: 'Object', content: 'Payload', objectType: 'KNOWLEDGE' as any },
      { actorId: 'user-1' },
    );

    expect(result.id).toBe('obj-1');
    expect(tx.intelligenceObjectLifecycleEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromState: null, toState: 'DRAFT' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_OBJECT_CREATED', success: true }),
    );
  });

  it('rejects creation with an invalid object type and audits failure', async () => {
    const { service, audit } = makeService();
    await expect(
      service.create('ws-1', 'user-1', { name: 'X', content: 'Y', objectType: 'NOPE' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_OBJECT_CREATED', success: false }),
    );
  });

  it('rejects creation with an out-of-range trust score', async () => {
    const { service } = makeService();
    await expect(
      service.create('ws-1', 'user-1', {
        name: 'X',
        content: 'Y',
        objectType: 'KNOWLEDGE' as any,
        trustScore: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFound when fetching a missing object', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValue(null);
    await expect(service.findOne('missing', 'ws-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('soft deletes then restores an object', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValueOnce(baseObject());
    prisma.intelligenceObject.update.mockResolvedValueOnce(baseObject({ deletedAt: new Date() }));
    const removed = await service.remove('obj-1', 'ws-1', 'user-1');
    expect(removed).toEqual({ success: true, id: 'obj-1' });

    prisma.intelligenceObject.findFirst.mockResolvedValueOnce(
      baseObject({ deletedAt: new Date() }),
    );
    prisma.intelligenceObject.update.mockResolvedValueOnce(baseObject({ deletedAt: null }));
    const restored = await service.restore('obj-1', 'ws-1', 'user-1');
    expect(restored.deletedAt).toBeNull();
  });

  it('performs a valid lifecycle transition and records an event', async () => {
    const { service, prisma, audit } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValue(baseObject({ lifecycleState: 'DRAFT' }));
    const tx = {
      intelligenceObject: {
        update: jest.fn().mockResolvedValue(baseObject({ lifecycleState: 'INGESTED' })),
      },
      intelligenceObjectLifecycleEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const updated = await service.transitionLifecycle('obj-1', 'ws-1', 'user-1', {
      toState: 'INGESTED' as any,
    });
    expect(updated.lifecycleState).toBe('INGESTED');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INTELLIGENCE_OBJECT_LIFECYCLE_CHANGED', success: true }),
    );
  });

  it('rejects an invalid lifecycle transition', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValue(baseObject({ lifecycleState: 'DRAFT' }));
    await expect(
      service.transitionLifecycle('obj-1', 'ws-1', 'user-1', { toState: 'CAPITALIZED' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a relationship between two distinct objects', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst
      .mockResolvedValueOnce(baseObject({ id: 'obj-1' }))
      .mockResolvedValueOnce(baseObject({ id: 'obj-2' }));
    prisma.intelligenceObjectRelationship.create.mockResolvedValue({
      id: 'rel-1',
      sourceObjectId: 'obj-1',
      targetObjectId: 'obj-2',
      relationshipType: 'DERIVES_FROM',
    });

    const rel = await service.createRelationship('obj-1', 'ws-1', 'user-1', {
      targetObjectId: 'obj-2',
      relationshipType: 'DERIVES_FROM' as any,
    });
    expect(rel.id).toBe('rel-1');
  });

  it('rejects a self-referential relationship', async () => {
    const { service } = makeService();
    await expect(
      service.createRelationship('obj-1', 'ws-1', 'user-1', {
        targetObjectId: 'obj-1',
        relationshipType: 'SUPPORTS' as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a relationship to a missing target object', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValueOnce(baseObject({ id: 'obj-1' }));
    prisma.intelligenceObject.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createRelationship('obj-1', 'ws-1', 'user-1', {
        targetObjectId: 'ghost',
        relationshipType: 'SUPPORTS' as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects provenance missing required dimensions', async () => {
    const { service } = makeService();
    await expect(
      service.addProvenance('obj-1', 'ws-1', 'user-1', {
        sourceIdentity: '',
        origin: 'L2',
        creator: 'engine',
        extractionMethod: '',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates a healthy object as valid', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValue(baseObject());
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', workspaceId: 'ws-1' });
    prisma.intelligenceObjectRelationship.findMany.mockResolvedValue([]);
    prisma.intelligenceObjectProvenance.findMany.mockResolvedValue([]);

    const report = await service.validate('obj-1', 'ws-1', 'user-1');
    expect(report.valid).toBe(true);
    expect(report.canonicalD16Type).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('flags ownership and trust issues during validation', async () => {
    const { service, prisma } = makeService();
    prisma.intelligenceObject.findFirst.mockResolvedValue(
      baseObject({ trustScore: 9, ownerId: 'user-1' }),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.intelligenceObjectRelationship.findMany.mockResolvedValue([]);
    prisma.intelligenceObjectProvenance.findMany.mockResolvedValue([]);

    const report = await service.validate('obj-1', 'ws-1', 'user-1');
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.rule === 'trust_score')).toBe(true);
    expect(report.issues.some((i) => i.rule === 'ownership')).toBe(true);
  });

  describe('lifecycle transition rules', () => {
    it('allows the canonical forward path', () => {
      expect(isValidLifecycleTransition('DRAFT', 'INGESTED')).toBe(true);
      expect(isValidLifecycleTransition('INGESTED', 'VALIDATED')).toBe(true);
      expect(isValidLifecycleTransition('VALIDATED', 'ACTIVE')).toBe(true);
      expect(isValidLifecycleTransition('MEASURED', 'CAPITALIZED')).toBe(true);
    });

    it('treats ARCHIVED as terminal and rejects no-op transitions', () => {
      expect(LIFECYCLE_TRANSITIONS.ARCHIVED).toHaveLength(0);
      expect(isValidLifecycleTransition('ARCHIVED', 'ACTIVE')).toBe(false);
      expect(isValidLifecycleTransition('ACTIVE', 'ACTIVE')).toBe(false);
    });
  });
});

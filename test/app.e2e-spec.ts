import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('ONX Intelligence (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let createdIntelligenceId: string;
  let createdEvidenceId: string;
  let createdProviderId: string;
  let createdToolId: string;
  let createdProjectId: string;
  let createdAgentId: string;
  let createdSourceId: string;
  let createdMemoryId: string;
  let createdCapitalAllocationId: string;
  let rejectedCapitalAllocationId: string;
  let createdCapitalPolicyId: string;
  let createdFounderIntentId: string;
  let currentWorkspaceId: string;
  const password = 'StrongPass123!';
  const email = `e2e-${Date.now()}@onx.test`;
  const hasDatabase = Boolean(process.env.DATABASE_URL);
  let hasSchema = false;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    if (hasDatabase) {
      try {
        const prisma = app.get(PrismaService);
        const result = (await prisma.$queryRawUnsafe(
          "SELECT to_regclass('public.users')::text AS users_table",
        )) as Array<{ users_table: string | null }>;
        hasSchema = Boolean(result?.[0]?.users_table);
      } catch {
        hasSchema = false;
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const listAudit = async (search?: string) => {
    const path = search
      ? `/monitoring/audit?search=${encodeURIComponent(search)}`
      : '/monitoring/audit';
    const res = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    return res.body as Array<any>;
  };

  const expectUnifiedAuditShape = (entry: any) => {
    expect(entry).toHaveProperty('eventId');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('actorId');
    expect(entry).toHaveProperty('resourceType');
    expect(entry).toHaveProperty('resourceId');
    expect(entry).toHaveProperty('action');
    expect(entry).toHaveProperty('before');
    expect(entry).toHaveProperty('after');
    expect(entry).toHaveProperty('requestId');
    expect(entry).toHaveProperty('ipAddress');
    expect(entry).toHaveProperty('userAgent');
    expect(entry).toHaveProperty('status');
    expect(entry).toHaveProperty('success');
    expect(entry).toHaveProperty('metadata');
  };

  const registerAndLogin = async (nextEmail: string) => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'E2E Memory User',
        email: nextEmail,
        password,
      })
      .expect(201);

    expect(typeof registerRes.body).toBe('string');

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: nextEmail, password })
      .expect(200);

    return loginRes.body as string;
  };

  const getWorkspaceIdFromToken = (token: string) => {
    const [, payload] = token.split('.');
    if (!payload) {
      return '';
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.workspaceId as string;
  };

  it('/health returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toBeDefined();
    expect(['ok', 'degraded']).toContain(res.body.status);
  });

  it('/health/liveness returns 200 with uptime and timestamp', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness').expect(200);
    expect(res.body).toBeDefined();
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('/health/readiness returns 200 with readiness status', async () => {
    const res = await request(app.getHttpServer()).get('/health/readiness').expect(200);
    expect(res.body).toBeDefined();
    expect(['ok', 'degraded']).toContain(res.body.status);
  });

  it('/auth/register creates user and returns JWT token', async () => {
    if (!hasDatabase || !hasSchema) {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'E2E User', email, password });
      expect([500, 503]).toContain(res.status);
      return;
    }

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'E2E User',
        email,
        password,
      })
      .expect(201);

    expect(typeof res.body).toBe('string');
    expect(res.body.length).toBeGreaterThan(20);
    authToken = res.body;
  });

  it('/auth/login returns JWT token', async () => {
    if (!hasDatabase || !hasSchema) {
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
      expect([500, 503]).toContain(res.status);
      return;
    }

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password,
      })
      .expect(200);

    expect(typeof res.body).toBe('string');
    expect(res.body.length).toBeGreaterThan(20);
    authToken = res.body;

    const loginAudit = await listAudit('AUTH_LOGGED_IN');
    expect(loginAudit.length).toBeGreaterThan(0);
    expectUnifiedAuditShape(loginAudit[0]);
  });

  it('/auth/me returns safe user profile without password fields', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      return;
    }

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.email).toBe(email);
    currentWorkspaceId = res.body.workspaceId || getWorkspaceIdFromToken(authToken);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('intelligence CRUD works with ownership/workspace scoping', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer())
        .post('/intelligence')
        .send({
          name: 'E2E Intelligence',
          content: 'Initial intelligence content',
          objectType: 'JUDGMENT',
        })
        .expect(401);
      return;
    }

    const createRes = await request(app.getHttpServer())
      .post('/intelligence')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'E2E Intelligence',
        content: 'Initial intelligence content',
        objectType: 'JUDGMENT',
        semanticSummary: 'Short summary',
      })
      .expect(201);

    expect(createRes.body).toBeDefined();
    expect(createRes.body.id).toBeDefined();
    createdIntelligenceId = createRes.body.id;

    const listRes = await request(app.getHttpServer())
      .get('/intelligence')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((item: { id: string }) => item.id === createdIntelligenceId)).toBe(
      true,
    );

    const updateRes = await request(app.getHttpServer())
      .put(`/intelligence/${createdIntelligenceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'E2E Intelligence Updated',
        content: 'Updated intelligence content',
      })
      .expect(200);

    expect(updateRes.body.name).toBe('E2E Intelligence Updated');

    await request(app.getHttpServer())
      .delete(`/intelligence/${createdIntelligenceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/intelligence/${createdIntelligenceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    const createdAudit = await listAudit('INTELLIGENCE_CREATED');
    const updatedAudit = await listAudit('INTELLIGENCE_UPDATED');
    const deletedAudit = await listAudit('INTELLIGENCE_DELETED');
    expect(createdAudit.length).toBeGreaterThan(0);
    expect(updatedAudit.length).toBeGreaterThan(0);
    expect(deletedAudit.length).toBeGreaterThan(0);
    expect(deletedAudit.some((item) => item.status === 'SUCCESS' && item.success === true)).toBe(
      true,
    );
    expectUnifiedAuditShape(createdAudit[0]);
  });

  it('D16 intelligence object foundation: full lifecycle, relationships, provenance, validation', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer())
        .post('/intelligence-objects')
        .send({ name: 'D16', content: 'payload', objectType: 'KNOWLEDGE' })
        .expect(401);
      return;
    }

    const createRes = await request(app.getHttpServer())
      .post('/intelligence-objects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'D16 Knowledge Object',
        content: 'Canonical D16 knowledge payload',
        objectType: 'KNOWLEDGE',
        semanticSummary: 'Foundational knowledge',
        authorityLevel: 'INSTITUTIONAL',
      })
      .expect(201);
    const objectId = createRes.body.id as string;
    expect(objectId).toBeDefined();
    expect(createRes.body.lifecycleState).toBe('DRAFT');

    const secondRes = await request(app.getHttpServer())
      .post('/intelligence-objects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'D16 Source Object',
        content: 'Canonical D16 source payload',
        objectType: 'SOURCE',
      })
      .expect(201);
    const sourceObjectId = secondRes.body.id as string;

    const listRes = await request(app.getHttpServer())
      .get('/intelligence-objects?type=KNOWLEDGE')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items.some((item: { id: string }) => item.id === objectId)).toBe(true);

    await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const updateRes = await request(app.getHttpServer())
      .put(`/intelligence-objects/${objectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'D16 Knowledge Object Updated', trustScore: 0.91 })
      .expect(200);
    expect(updateRes.body.name).toBe('D16 Knowledge Object Updated');

    // valid lifecycle transition
    const transitionRes = await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/lifecycle`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toState: 'INGESTED', reason: 'Ingested from corpus' })
      .expect(201);
    expect(transitionRes.body.lifecycleState).toBe('INGESTED');

    // invalid lifecycle transition
    await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/lifecycle`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toState: 'CAPITALIZED' })
      .expect(400);

    const lifecycleEvents = await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}/lifecycle`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(lifecycleEvents.body)).toBe(true);
    expect(lifecycleEvents.body.length).toBeGreaterThanOrEqual(2);

    // relationship creation
    const relRes = await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/relationships`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetObjectId: sourceObjectId, relationshipType: 'DERIVES_FROM' })
      .expect(201);
    expect(relRes.body.relationshipType).toBe('DERIVES_FROM');

    // invalid relationship (self-reference)
    await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/relationships`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetObjectId: objectId, relationshipType: 'SUPPORTS' })
      .expect(400);

    const relsRes = await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}/relationships`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(relsRes.body.outgoing.length).toBeGreaterThanOrEqual(1);

    // lineage traversal
    const lineageRes = await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}/lineage`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(
      lineageRes.body.lineage.some((edge: any) => edge.targetObjectId === sourceObjectId),
    ).toBe(true);

    // provenance
    await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/provenance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceIdentity: 'corpus-001',
        origin: 'L2_SIL',
        creator: 'founder-intent-engine',
        extractionMethod: 'structured-extraction',
        verificationStatus: 'VERIFIED',
        confidence: 0.88,
      })
      .expect(201);

    // invalid provenance (missing dimensions)
    await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/provenance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ sourceIdentity: '', origin: 'L2', creator: 'x', extractionMethod: '' })
      .expect(400);

    const provRes = await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}/provenance`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(provRes.body.length).toBeGreaterThanOrEqual(1);

    // validation
    const validateRes = await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}/validate`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(validateRes.body.valid).toBe(true);
    expect(validateRes.body.canonicalD16Type).toBe(true);

    // soft delete + restore
    await request(app.getHttpServer())
      .delete(`/intelligence-objects/${objectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
    const restoreRes = await request(app.getHttpServer())
      .post(`/intelligence-objects/${objectId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);
    expect(restoreRes.body.deletedAt).toBeNull();

    // audit trail evidence
    const createdAudit = await listAudit('INTELLIGENCE_OBJECT_CREATED');
    const lifecycleAudit = await listAudit('INTELLIGENCE_OBJECT_LIFECYCLE_CHANGED');
    const relationshipAudit = await listAudit('INTELLIGENCE_OBJECT_RELATIONSHIP_CREATED');
    expect(createdAudit.length).toBeGreaterThan(0);
    expect(lifecycleAudit.length).toBeGreaterThan(0);
    expect(relationshipAudit.length).toBeGreaterThan(0);
    expectUnifiedAuditShape(createdAudit[0]);

    // workspace ownership isolation
    const otherToken = await registerAndLogin(`d16-isolation-${Date.now()}@onx.test`);
    await request(app.getHttpServer())
      .get(`/intelligence-objects/${objectId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('exposes intelligence object endpoints and schemas in the OpenAPI document', async () => {
    const config = new DocumentBuilder()
      .setTitle('ONX Intelligence API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);

    expect(document.paths['/intelligence-objects']).toBeDefined();
    expect(document.paths['/intelligence-objects'].post).toBeDefined();
    expect(document.paths['/intelligence-objects'].get).toBeDefined();
    expect(document.paths['/intelligence-objects/{id}/lifecycle']).toBeDefined();
    expect(document.paths['/intelligence-objects/{id}/relationships']).toBeDefined();
    expect(document.paths['/intelligence-objects/{id}/provenance']).toBeDefined();
    expect(document.paths['/intelligence-objects/{id}/lineage']).toBeDefined();
    expect(document.paths['/intelligence-objects/{id}/validate']).toBeDefined();
    expect(document.components?.schemas?.CreateIntelligenceObjectDto).toBeDefined();
    expect(document.components?.schemas?.CreateRelationshipDto).toBeDefined();
    expect(document.components?.schemas?.LifecycleTransitionDto).toBeDefined();
    expect(document.components?.schemas?.CreateProvenanceDto).toBeDefined();
  });

  it('D11 intelligence feeding: source registry, pipeline, validation gate, shadow protocol', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer())
        .post('/intelligence-feeding/sources')
        .send({ identity: 'Source' })
        .expect(401);
      return;
    }

    // Source registry
    const sourceRes = await request(app.getHttpServer())
      .post('/intelligence-feeding/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        identity: 'E2E Telemetry Source',
        category: 'INTERNAL',
        authorityLevel: 'INSTITUTIONAL',
        trustScore: 0.8,
        confidenceScore: 0.8,
      })
      .expect(201);
    const sourceId = sourceRes.body.id as string;
    expect(sourceId).toBeDefined();

    const sourceList = await request(app.getHttpServer())
      .get('/intelligence-feeding/sources?category=INTERNAL')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(sourceList.body.items.some((s: { id: string }) => s.id === sourceId)).toBe(true);

    // We need a linkable D16 object for the LINKED stage.
    const objRes = await request(app.getHttpServer())
      .post('/intelligence-objects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Feed target', content: 'payload', objectType: 'KNOWLEDGE' })
      .expect(201);
    const linkObjectId = objRes.body.id as string;

    // Feed pipeline: ingest (RECEIVED)
    const feedRes = await request(app.getHttpServer())
      .post('/intelligence-feeding/feeds')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        sourceId,
        payload: 'Canonical feed payload',
        confidenceScore: 0.8,
        provenanceScore: 0.7,
        verificationScore: 0.8,
        shadowMode: 'SHADOW',
      })
      .expect(201);
    const feedId = feedRes.body.id as string;
    expect(feedRes.body.stage).toBe('RECEIVED');
    expect(feedRes.body.shadowMode).toBe('SHADOW');

    // Shadow protocol: bring it back to ACTIVE
    const shadowRes = await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/shadow`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ shadowMode: 'ACTIVE', reason: 'Cleared review' })
      .expect(201);
    expect(shadowRes.body.shadowMode).toBe('ACTIVE');

    // Validation gate (read-only)
    const gateRes = await request(app.getHttpServer())
      .get(`/intelligence-feeding/feeds/${feedId}/validate`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(gateRes.body.valid).toBe(true);
    expect(Array.isArray(gateRes.body.checks)).toBe(true);

    // Staged ingestion: RECEIVED -> NORMALIZED -> VALIDATED -> CLASSIFIED -> LINKED -> ACCEPTED
    await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toStage: 'NORMALIZED', notes: 'normalized' })
      .expect(201);

    // invalid transition (skip stages)
    await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toStage: 'ACCEPTED' })
      .expect(400);

    const validatedRes = await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toStage: 'VALIDATED' })
      .expect(201);
    expect(validatedRes.body.stage).toBe('VALIDATED');

    await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toStage: 'CLASSIFIED', classification: 'KNOWLEDGE' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toStage: 'LINKED', linkedObjectId: linkObjectId })
      .expect(201);

    const acceptedRes = await request(app.getHttpServer())
      .post(`/intelligence-feeding/feeds/${feedId}/advance`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toStage: 'ACCEPTED' })
      .expect(201);
    expect(acceptedRes.body.stage).toBe('ACCEPTED');

    const events = await request(app.getHttpServer())
      .get(`/intelligence-feeding/feeds/${feedId}/events`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(events.body.length).toBeGreaterThanOrEqual(5);

    // Audit evidence
    const ingestAudit = await listAudit('INTELLIGENCE_FEED_INGESTED');
    const advanceAudit = await listAudit('INTELLIGENCE_FEED_STAGE_ADVANCED');
    expect(ingestAudit.length).toBeGreaterThan(0);
    expect(advanceAudit.length).toBeGreaterThan(0);
    expectUnifiedAuditShape(ingestAudit[0]);

    // Workspace isolation
    const otherToken = await registerAndLogin(`d11-isolation-${Date.now()}@onx.test`);
    await request(app.getHttpServer())
      .get(`/intelligence-feeding/feeds/${feedId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('D12 intelligence learning: states, reinforcement, capitalization, patterns, evolution', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer())
        .post('/intelligence-learning/learnings')
        .send({ title: 'Learning' })
        .expect(401);
      return;
    }

    const createRes = await request(app.getHttpServer())
      .post('/intelligence-learning/learnings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'E2E recurring signal', objectId: 'obj-e2e-1', confidence: 0.6 })
      .expect(201);
    const learningId = createRes.body.id as string;
    expect(createRes.body.state).toBe('OBSERVED');

    // Walk the learning states up to REUSABLE
    for (const toState of ['UNDERSTOOD', 'VERIFIED', 'GENERALIZED', 'CONNECTED', 'REUSABLE']) {
      await request(app.getHttpServer())
        .post(`/intelligence-learning/learnings/${learningId}/transition`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ toState })
        .expect(201);
    }

    // invalid transition
    await request(app.getHttpServer())
      .post(`/intelligence-learning/learnings/${learningId}/transition`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toState: 'OBSERVED' })
      .expect(400);

    // Reinforce until capitalization conditions met (REUSABLE + confidence>=0.8 + reinforcement>=3)
    let capitalizationTriggered = false;
    for (let i = 0; i < 6; i++) {
      const r = await request(app.getHttpServer())
        .post(`/intelligence-learning/learnings/${learningId}/reinforce`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(201);
      if (r.body.capitalization) {
        capitalizationTriggered = true;
      }
    }
    expect(capitalizationTriggered).toBe(true);

    const capEvents = await request(app.getHttpServer())
      .get(`/intelligence-learning/learnings/${learningId}/capitalization`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(capEvents.body.length).toBeGreaterThanOrEqual(1);

    const learningEvents = await request(app.getHttpServer())
      .get(`/intelligence-learning/learnings/${learningId}/events`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(learningEvents.body.length).toBeGreaterThanOrEqual(5);

    // Pattern engine: register + discover
    await request(app.getHttpServer())
      .post('/intelligence-learning/patterns')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ patternType: 'SIMILARITY', label: 'Cluster A', strength: 0.7 })
      .expect(201);

    // create a second learning sharing the same object to enable repetition discovery
    await request(app.getHttpServer())
      .post('/intelligence-learning/learnings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'E2E recurring signal 2', objectId: 'obj-e2e-1' })
      .expect(201);

    const discoverRes = await request(app.getHttpServer())
      .post('/intelligence-learning/patterns/discover')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);
    expect(discoverRes.body.discovered).toBeGreaterThanOrEqual(1);

    const patternList = await request(app.getHttpServer())
      .get('/intelligence-learning/patterns')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(patternList.body.items.length).toBeGreaterThanOrEqual(1);

    // Knowledge evolution: superseding deprecates the unit
    await request(app.getHttpServer())
      .post(`/intelligence-learning/learnings/${learningId}/evolution`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ evolutionType: 'SUPERSEDING', reason: 'Replaced by improved model' })
      .expect(201);

    const evolutionList = await request(app.getHttpServer())
      .get(`/intelligence-learning/learnings/${learningId}/evolution`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(evolutionList.body.length).toBeGreaterThanOrEqual(1);

    const deprecated = await request(app.getHttpServer())
      .get(`/intelligence-learning/learnings/${learningId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(deprecated.body.state).toBe('DEPRECATED');

    // Audit evidence
    const createdAudit = await listAudit('LEARNING_STATE_CREATED');
    const capAudit = await listAudit('CAPITALIZATION_TRIGGERED');
    const evolutionAudit = await listAudit('KNOWLEDGE_EVOLUTION_RECORDED');
    expect(createdAudit.length).toBeGreaterThan(0);
    expect(capAudit.length).toBeGreaterThan(0);
    expect(evolutionAudit.length).toBeGreaterThan(0);
    expectUnifiedAuditShape(createdAudit[0]);
  });

  it('exposes D11/D12 feeding and learning endpoints in the OpenAPI document', async () => {
    const config = new DocumentBuilder()
      .setTitle('ONX Intelligence API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);

    // D11 feeding
    expect(document.paths['/intelligence-feeding/sources']).toBeDefined();
    expect(document.paths['/intelligence-feeding/sources'].post).toBeDefined();
    expect(document.paths['/intelligence-feeding/feeds']).toBeDefined();
    expect(document.paths['/intelligence-feeding/feeds/{id}/advance']).toBeDefined();
    expect(document.paths['/intelligence-feeding/feeds/{id}/validate']).toBeDefined();
    expect(document.paths['/intelligence-feeding/feeds/{id}/shadow']).toBeDefined();
    expect(document.components?.schemas?.CreateSourceDto).toBeDefined();
    expect(document.components?.schemas?.IngestFeedDto).toBeDefined();
    expect(document.components?.schemas?.AdvanceFeedDto).toBeDefined();

    // D12 learning
    expect(document.paths['/intelligence-learning/learnings']).toBeDefined();
    expect(document.paths['/intelligence-learning/learnings/{id}/transition']).toBeDefined();
    expect(document.paths['/intelligence-learning/learnings/{id}/reinforce']).toBeDefined();
    expect(document.paths['/intelligence-learning/learnings/{id}/capitalize']).toBeDefined();
    expect(document.paths['/intelligence-learning/learnings/{id}/evolution']).toBeDefined();
    expect(document.paths['/intelligence-learning/patterns']).toBeDefined();
    expect(document.paths['/intelligence-learning/patterns/discover']).toBeDefined();
    expect(document.components?.schemas?.CreateLearningDto).toBeDefined();
    expect(document.components?.schemas?.LearningTransitionDto).toBeDefined();
    expect(document.components?.schemas?.RegisterPatternDto).toBeDefined();
  });

  it('evidence create/list returns created records correctly', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer())
        .post('/evidence')
        .send({ intent: 'Validate evidence list consistency', confidence: 0.77 })
        .expect(401);
      return;
    }

    const createRes = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        intent: 'Validate evidence list consistency',
        confidence: 0.77,
      })
      .expect(201);

    expect(createRes.body).toBeDefined();
    expect(createRes.body.id).toBeDefined();
    createdEvidenceId = createRes.body.id;

    const getRes = await request(app.getHttpServer())
      .get(`/evidence/${createdEvidenceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(getRes.body.id).toBe(createdEvidenceId);

    const listRes = await request(app.getHttpServer())
      .get('/evidence')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((item: { id: string }) => item.id === createdEvidenceId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/evidence/${createdEvidenceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const afterDeleteList = await request(app.getHttpServer())
      .get('/evidence')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(afterDeleteList.body.some((item: { id: string }) => item.id === createdEvidenceId)).toBe(
      false,
    );

    const evidenceCreateAudit = await listAudit('EVIDENCE_CREATED');
    const evidenceDeleteAudit = await listAudit('EVIDENCE_DELETED');
    expect(evidenceCreateAudit.length).toBeGreaterThan(0);
    expect(evidenceDeleteAudit.length).toBeGreaterThan(0);
    expect(
      evidenceDeleteAudit.some((item) => item.status === 'SUCCESS' && item.success === true),
    ).toBe(true);
    expectUnifiedAuditShape(evidenceDeleteAudit[0]);
  });

  it('provider/tool/workspace/sovereignty mutating operations are audited', async () => {
    if (!hasDatabase || !hasSchema) {
      return;
    }

    const providerCreate = await request(app.getHttpServer())
      .post('/providers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ providerId: `prov-${Date.now()}`, providerName: 'Audit Provider', models: ['gpt-5'] })
      .expect(201);
    createdProviderId = providerCreate.body.id;

    const providerGet = await request(app.getHttpServer())
      .get(`/providers/${createdProviderId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(providerGet.body.id).toBe(createdProviderId);

    await request(app.getHttpServer())
      .put(`/providers/${createdProviderId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ providerName: 'Audit Provider Updated' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/providers/evaluate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ providerId: providerCreate.body.providerId, intent: 'audit coverage' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/providers/${createdProviderId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const toolCreate = await request(app.getHttpServer())
      .post('/tools')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toolId: `tool-${Date.now()}`, toolName: 'Audit Tool' })
      .expect(201);
    createdToolId = toolCreate.body.id;

    const toolGet = await request(app.getHttpServer())
      .get(`/tools/${createdToolId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(toolGet.body.id).toBe(createdToolId);

    await request(app.getHttpServer())
      .put(`/tools/${createdToolId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ toolName: 'Audit Tool Updated' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/tools/${createdToolId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const projectCreate = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Audit Project' })
      .expect(201);
    createdProjectId = projectCreate.body.id;

    await request(app.getHttpServer())
      .put(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Audit Project Updated' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const agentCreate = await request(app.getHttpServer())
      .post('/agents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Audit Agent', description: 'CRUD completeness agent' })
      .expect(201);
    createdAgentId = agentCreate.body.id;

    const agentGet = await request(app.getHttpServer())
      .get(`/agents/${createdAgentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(agentGet.body.id).toBe(createdAgentId);

    await request(app.getHttpServer())
      .delete(`/agents/${createdAgentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/sovereignty/evaluate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ intent: 'audit coverage sovereignty' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/revoke')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    const providerAudit = await listAudit('PROVIDER_');
    const toolAudit = await listAudit('TOOL_');
    const projectAudit = await listAudit('PROJECT_');
    const agentAudit = await listAudit('AGENT_');
    const sovereigntyAudit = await listAudit('SOVEREIGNTY_EVALUATED');
    const revokeAudit = await listAudit('AUTH_REVOKED');

    expect(providerAudit.length).toBeGreaterThan(0);
    expect(toolAudit.length).toBeGreaterThan(0);
    expect(projectAudit.length).toBeGreaterThan(0);
    expect(agentAudit.length).toBeGreaterThan(0);
    expect(sovereigntyAudit.length).toBeGreaterThan(0);
    expect(revokeAudit.length).toBeGreaterThan(0);
    expectUnifiedAuditShape(providerAudit[0]);
  });

  it('failure and unauthorized behaviors are audited correctly', async () => {
    if (!hasDatabase || !hasSchema) {
      return;
    }

    const beforeUnauthorizedCount = (await listAudit()).length;

    await request(app.getHttpServer())
      .post('/intelligence')
      .send({ name: 'Unauthorized', content: 'x', objectType: 'PATTERN' })
      .expect(401);

    const afterUnauthorizedCount = (await listAudit()).length;
    expect(afterUnauthorizedCount).toBe(beforeUnauthorizedCount);

    const missingId = `missing-${Date.now()}`;
    await request(app.getHttpServer())
      .delete(`/intelligence/${missingId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    const failedDeleteAudit = await listAudit('INTELLIGENCE_DELETED');
    expect(
      failedDeleteAudit.some((item) => item.status === 'FAILED' && item.success === false),
    ).toBe(true);
  });

  it('memory governance enforces policy, lifecycle, access control, and audit', async () => {
    if (!hasDatabase || !hasSchema) {
      return;
    }

    await request(app.getHttpServer())
      .post('/memory')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Invalid Restricted Memory',
        content: 'Should fail',
        classification: 'RESTRICTED',
        accessScope: 'WORKSPACE',
      })
      .expect(400);

    const createRes = await request(app.getHttpServer())
      .post('/memory')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: `Restricted Memory ${Date.now()}`,
        content: 'Operationally sensitive memory record',
        category: 'GOVERNANCE',
        classification: 'RESTRICTED',
        accessScope: 'OWNER_ONLY',
        retentionDays: 30,
        tags: ['governance', 'restricted'],
      })
      .expect(201);

    createdMemoryId = createRes.body.id;
    expect(createRes.body.classification).toBe('RESTRICTED');
    expect(createRes.body.accessScope).toBe('OWNER_ONLY');
    expect(createRes.body.lifecycleStatus).toBe('ACTIVE');
    expect(createRes.body.retentionDays).toBe(30);

    const ownerList = await request(app.getHttpServer())
      .get('/memory?classification=RESTRICTED')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(ownerList.body.some((item: { id: string }) => item.id === createdMemoryId)).toBe(true);

    const ownerDetails = await request(app.getHttpServer())
      .get(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(ownerDetails.body.id).toBe(createdMemoryId);

    const lockRes = await request(app.getHttpServer())
      .put(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lifecycleStatus: 'LOCKED', category: 'GOVERNANCE_LOCKED' })
      .expect(200);
    expect(lockRes.body.lifecycleStatus).toBe('LOCKED');

    await request(app.getHttpServer())
      .put(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Should not mutate while locked' })
      .expect(400);

    const secondToken = await registerAndLogin(`e2e-memory-${Date.now()}@onx.test`);
    const secondUserList = await request(app.getHttpServer())
      .get('/memory')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    expect(secondUserList.body.some((item: { id: string }) => item.id === createdMemoryId)).toBe(
      false,
    );

    await request(app.getHttpServer())
      .get(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .send({ lifecycleStatus: 'ACTIVE' })
      .expect(404);

    await request(app.getHttpServer())
      .put(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ lifecycleStatus: 'ACTIVE', category: 'GOVERNANCE_UNLOCKED' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const memoryAudit = await listAudit('MEMORY_');
    const createdAudit = memoryAudit.find(
      (item) => item.action === 'MEMORY_CREATED' && item.resourceId === createdMemoryId,
    );
    const updatedAudit = memoryAudit.find(
      (item) => item.action === 'MEMORY_UPDATED' && item.resourceId === createdMemoryId,
    );
    const deletedAudit = memoryAudit.find(
      (item) => item.action === 'MEMORY_DELETED' && item.resourceId === createdMemoryId,
    );

    expect(createdAudit).toBeDefined();
    expect(updatedAudit).toBeDefined();
    expect(deletedAudit).toBeDefined();
    expectUnifiedAuditShape(createdAudit);
    expect(createdAudit.metadata.classification).toBe('RESTRICTED');
    expect(createdAudit.metadata.accessScope).toBe('OWNER_ONLY');
    expect(createdAudit.metadata.retentionDays).toBe(30);
    expect(deletedAudit.success).toBe(true);
  });

  it('/w/ route is available (no server error)', async () => {
    const res = await request(app.getHttpServer()).get('/w/');
    expect(res.status).toBeLessThan(500);
  });

  it('capital allocation lifecycle, policy lifecycle, reports, audit, authorization, and validation work end to end', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/capital/allocations').expect(401);
      return;
    }

    await request(app.getHttpServer())
      .post('/capital/allocations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ category: 'OPERATIONS', amount: -100, currency: 'USD' })
      .expect(400);

    const policyCreate = await request(app.getHttpServer())
      .post('/capital/policies')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `Capital Policy ${Date.now()}`,
        category: 'GOVERNANCE',
        currency: 'USD',
        source: 'Treasury Reserve',
        target: 'Governance Programs',
        priority: 2,
        rationale: 'Guard reserve deployment',
      })
      .expect(201);

    createdCapitalPolicyId = policyCreate.body.id;
    expect(policyCreate.body.status).toBe('ACTIVE');

    const policyGet = await request(app.getHttpServer())
      .get(`/capital/policies/${createdCapitalPolicyId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(policyGet.body.id).toBe(createdCapitalPolicyId);

    const policyList = await request(app.getHttpServer())
      .get('/capital/policies?page=1&pageSize=10&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(policyList.body)).toBe(true);
    expect(policyList.body.some((item: { id: string }) => item.id === createdCapitalPolicyId)).toBe(
      true,
    );

    const policyUpdate = await request(app.getHttpServer())
      .put(`/capital/policies/${createdCapitalPolicyId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'INACTIVE', rationale: 'Paused after review' })
      .expect(200);
    expect(policyUpdate.body.status).toBe('INACTIVE');

    const allocationCreate = await request(app.getHttpServer())
      .post('/capital/allocations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'OPERATIONS',
        amount: 500000,
        currency: 'USD',
        source: 'Treasury Reserve',
        target: 'Capital Engine Rollout',
        priority: 2,
        rationale: 'Fund Atlas capital runtime rollout',
        status: 'DRAFT',
        policyId: createdCapitalPolicyId,
      })
      .expect(201);
    createdCapitalAllocationId = allocationCreate.body.id;
    expect(allocationCreate.body.status).toBe('DRAFT');

    const rejectableCreate = await request(app.getHttpServer())
      .post('/capital/allocations')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'COMMERCIAL',
        amount: 120000,
        currency: 'USD',
        source: 'Commercial Budget',
        target: 'Exploratory Spend',
        priority: 5,
        rationale: 'Candidate allocation for rejection path',
        status: 'PENDING_APPROVAL',
      })
      .expect(201);
    rejectedCapitalAllocationId = rejectableCreate.body.id;

    const allocationGet = await request(app.getHttpServer())
      .get(`/capital/allocations/${createdCapitalAllocationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(allocationGet.body.id).toBe(createdCapitalAllocationId);

    const allocationList = await request(app.getHttpServer())
      .get(
        '/capital/allocations?page=1&pageSize=10&sortBy=createdAt&sortOrder=desc&category=OPERATIONS',
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(allocationList.body)).toBe(true);
    expect(
      allocationList.body.some((item: { id: string }) => item.id === createdCapitalAllocationId),
    ).toBe(true);

    const allocationUpdate = await request(app.getHttpServer())
      .put(`/capital/allocations/${createdCapitalAllocationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'PENDING_APPROVAL', decisionReason: 'Submitted for review', priority: 1 })
      .expect(200);
    expect(allocationUpdate.body.status).toBe('PENDING_APPROVAL');

    const allocationApprove = await request(app.getHttpServer())
      .post(`/capital/allocations/${createdCapitalAllocationId}/approve`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ decisionReason: 'Thresholds satisfied', rationale: 'Approved by capital operator' })
      .expect(201);
    expect(allocationApprove.body.status).toBe('APPROVED');
    expect(allocationApprove.body.approvalStatus).toBe('APPROVED');

    const allocationReject = await request(app.getHttpServer())
      .post(`/capital/allocations/${rejectedCapitalAllocationId}/reject`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ decisionReason: 'Rejected due to poor priority fit', rationale: 'Rework request' })
      .expect(201);
    expect(allocationReject.body.status).toBe('REJECTED');
    expect(allocationReject.body.approvalStatus).toBe('REJECTED');

    await request(app.getHttpServer())
      .delete(`/capital/allocations/${createdCapitalAllocationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/capital/allocations/${createdCapitalAllocationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    const allocationRestore = await request(app.getHttpServer())
      .post(`/capital/allocations/${createdCapitalAllocationId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);
    expect(allocationRestore.body.deletedAt).toBeNull();

    await request(app.getHttpServer())
      .delete(`/capital/policies/${createdCapitalPolicyId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/capital/policies/${createdCapitalPolicyId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    const policyRestore = await request(app.getHttpServer())
      .post(`/capital/policies/${createdCapitalPolicyId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);
    expect(policyRestore.body.status).toBe('ACTIVE');

    const peerToken = await registerAndLogin(`e2e-capital-peer-${Date.now()}@onx.test`);
    await request(app.getHttpServer())
      .put(`/capital/allocations/${createdCapitalAllocationId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .send({ rationale: 'peer should not mutate' })
      .expect(404);

    const capitalReports = await request(app.getHttpServer())
      .get('/capital/reports')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(capitalReports.body).toEqual(
      expect.objectContaining({
        totalAllocated: expect.any(Number),
        totalPending: expect.any(Number),
        totalApproved: expect.any(Number),
        totalRejected: expect.any(Number),
        allocationCount: expect.any(Number),
        policyCount: expect.any(Number),
        allocationsByCategory: expect.any(Object),
        allocationsByStatus: expect.any(Object),
      }),
    );
    expect(capitalReports.body.allocationCount).toBeGreaterThanOrEqual(2);

    const capitalHistory = await request(app.getHttpServer())
      .get(`/capital/history?page=1&pageSize=20&allocationId=${createdCapitalAllocationId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(capitalHistory.body)).toBe(true);
    expect(capitalHistory.body.length).toBeGreaterThan(0);

    const monitoring = await request(app.getHttpServer())
      .get('/monitoring')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(monitoring.body.metrics.capitalAllocationCount).toBeGreaterThanOrEqual(1);
    expect(monitoring.body.metrics.capitalPolicyCount).toBeGreaterThanOrEqual(1);

    const capitalAudit = await listAudit('CAPITAL_');
    expect(capitalAudit.length).toBeGreaterThan(0);
    expect(
      capitalAudit.some(
        (item) =>
          item.action === 'CAPITAL_ALLOCATION_APPROVED' &&
          item.resourceId === createdCapitalAllocationId,
      ),
    ).toBe(true);
    expect(
      capitalAudit.some(
        (item) =>
          item.action === 'CAPITAL_ALLOCATION_REJECTED' &&
          item.resourceId === rejectedCapitalAllocationId,
      ),
    ).toBe(true);
    expect(
      capitalAudit.some(
        (item) =>
          item.action === 'CAPITAL_POLICY_RESTORED' && item.resourceId === createdCapitalPolicyId,
      ),
    ).toBe(true);

    await request(app.getHttpServer()).get('/capital/reports').expect(401);
    await request(app.getHttpServer()).get('/capital/history').expect(401);
  });

  it('founder intent compile/validate/simulate/history/get enforce jwt, workspace scope, audit, and OpenAPI exposure', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).post('/founder-intent/compile').expect(401);
      return;
    }

    const compilePayload = {
      objective: 'Scale founder-directed execution orchestration for Atlas V6',
      constraints: ['must preserve workspace isolation', 'must not duplicate platform modules'],
      priorities: [
        { area: 'execution-speed', weight: 85 },
        { area: 'evidence-quality', weight: 80 },
      ],
      strategicContext: ['atlas-v6 launch window', 'platform continuity'],
      governanceContext: ['additive-only implementation', 'audit-required execution'],
      workspaceId: currentWorkspaceId,
    };

    const compileRes = await request(app.getHttpServer())
      .post('/founder-intent/compile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(compilePayload)
      .expect(201);

    createdFounderIntentId = compileRes.body.id;
    expect(createdFounderIntentId).toBeDefined();
    expect(compileRes.body.normalizedIntent.objective).toContain('Atlas V6');
    expect(compileRes.body.executionDirectives.length).toBeGreaterThan(0);

    const validateRes = await request(app.getHttpServer())
      .post('/founder-intent/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send(compilePayload)
      .expect(201);

    expect(validateRes.body).toEqual(
      expect.objectContaining({
        workspaceId: currentWorkspaceId,
        valid: expect.any(Boolean),
        dependencies: expect.any(Object),
      }),
    );

    const simulateRes = await request(app.getHttpServer())
      .post('/founder-intent/simulate')
      .set('Authorization', `Bearer ${authToken}`)
      .send(compilePayload)
      .expect(201);

    expect(simulateRes.body.executionSequence.length).toBeGreaterThan(0);
    expect(simulateRes.body.dependencyOrder.length).toBeGreaterThan(0);

    const historyRes = await request(app.getHttpServer())
      .get('/founder-intent/history?page=1&pageSize=20')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(historyRes.body)).toBe(true);
    expect(historyRes.body.some((item: any) => item.id === createdFounderIntentId)).toBe(true);

    const getRes = await request(app.getHttpServer())
      .get(`/founder-intent/${createdFounderIntentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(getRes.body.id).toBe(createdFounderIntentId);

    const peerToken = await registerAndLogin(`e2e-founder-peer-${Date.now()}@onx.test`);
    await request(app.getHttpServer())
      .get(`/founder-intent/${createdFounderIntentId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/founder-intent/compile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...compilePayload, workspaceId: `${currentWorkspaceId}-other` })
      .expect(403);

    const founderAudit = await listAudit('FOUNDER_INTENT_');
    expect(founderAudit.some((item) => item.action === 'FOUNDER_INTENT_COMPILED')).toBe(true);
    expect(founderAudit.some((item) => item.action === 'FOUNDER_INTENT_VALIDATED')).toBe(true);
    expect(founderAudit.some((item) => item.action === 'FOUNDER_INTENT_SIMULATED')).toBe(true);

    const openApi = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/founder-intent/compile']).toBeDefined();
    expect(openApi.body.paths['/founder-intent/validate']).toBeDefined();
    expect(openApi.body.paths['/founder-intent/simulate']).toBeDefined();
    expect(openApi.body.paths['/founder-intent/history']).toBeDefined();
    expect(openApi.body.paths['/founder-intent/{id}']).toBeDefined();

    await request(app.getHttpServer()).get('/founder-intent/history').expect(401);
  });

  it('FIC v0.2: founder intent compiler enforces jwt, lifecycle, versioning, review, override, conflicts, and OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).post('/founder-intent-compiler/intents').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // Create canonical intent (DRAFT).
    const createRes = await auth(request(server).post('/founder-intent-compiler/intents'))
      .send({
        title: 'Sovereign capital allocation discipline',
        description: 'All capital allocation must flow through governed FIC directives.',
        rationale: 'Prevents ungoverned capital drift across workspaces.',
        constitutionalAuthority: 'FOUNDER',
        priority: 'HIGH',
        affectedDomains: ['CAPITAL', 'GOVERNANCE'],
      })
      .expect(201);

    const intentId = createRes.body.id;
    expect(intentId).toBeDefined();
    expect(createRes.body.lifecycle).toBe('DRAFT');
    expect(createRes.body.version).toBe(1);

    // Update -> new version.
    const updateRes = await auth(
      request(server).put(`/founder-intent-compiler/intents/${intentId}`),
    )
      .send({ description: 'Refined capital governance directive.', versionType: 'MINOR' })
      .expect(200);
    expect(updateRes.body.version).toBe(2);
    expect(updateRes.body.minorVersion).toBe(1);

    // List versions + compare.
    const versionsRes = await auth(
      request(server).get(`/founder-intent-compiler/intents/${intentId}/versions`),
    ).expect(200);
    expect(versionsRes.body.total).toBeGreaterThanOrEqual(2);

    const compareRes = await auth(
      request(server).get(
        `/founder-intent-compiler/intents/${intentId}/versions/compare?from=1&to=2`,
      ),
    ).expect(200);
    expect(compareRes.body.changedFields).toContain('description');

    // Lifecycle: DRAFT -> SUBMITTED; invalid skip rejected.
    await auth(request(server).post(`/founder-intent-compiler/intents/${intentId}/transition`))
      .send({ to: 'ACTIVE' })
      .expect(400);
    await auth(request(server).post(`/founder-intent-compiler/intents/${intentId}/transition`))
      .send({ to: 'SUBMITTED' })
      .expect(201);

    // Review -> advances to REVIEWED.
    await auth(request(server).post(`/founder-intent-compiler/intents/${intentId}/reviews`))
      .send({
        decision: 'APPROVED',
        constitutionalReferences: ['V1_CONSTITUTIONAL_SEAL'],
        notes: 'Aligned with sovereignty constraints.',
      })
      .expect(201);

    const reviewsRes = await auth(
      request(server).get(`/founder-intent-compiler/intents/${intentId}/reviews`),
    ).expect(200);
    expect(reviewsRes.body.total).toBeGreaterThanOrEqual(1);

    // Approve.
    const approveRes = await auth(
      request(server).post(`/founder-intent-compiler/intents/${intentId}/approve`),
    )
      .send({ notes: 'Approved under founder authority.' })
      .expect(201);
    expect(approveRes.body.lifecycle).toBe('APPROVED');

    // Override (priority) -> immutable event.
    const overrideRes = await auth(
      request(server).post(`/founder-intent-compiler/intents/${intentId}/override`),
    )
      .send({ overrideType: 'PRIORITY', priority: 'CRITICAL', reason: 'Founder directive.' })
      .expect(201);
    expect(overrideRes.body.intent.priority).toBe('CRITICAL');
    expect(overrideRes.body.override.id).toBeDefined();

    const overridesRes = await auth(
      request(server).get(`/founder-intent-compiler/intents/${intentId}/overrides`),
    ).expect(200);
    expect(overridesRes.body.total).toBeGreaterThanOrEqual(1);

    // Second intent + relationship + conflict detection (duplicate).
    const dupRes = await auth(request(server).post('/founder-intent-compiler/intents'))
      .send({
        title: 'Sovereign capital allocation discipline',
        description: 'All capital allocation must flow through governed FIC directives.',
        constitutionalAuthority: 'INSTITUTIONAL',
        affectedDomains: ['CAPITAL'],
      })
      .expect(201);
    const dupId = dupRes.body.id;

    await auth(request(server).post(`/founder-intent-compiler/intents/${intentId}/relationships`))
      .send({ targetIntentId: dupId, relationType: 'GOVERNS' })
      .expect(201);

    const graphRes = await auth(request(server).get('/founder-intent-compiler/graph')).expect(200);
    expect(graphRes.body.nodes.length).toBeGreaterThanOrEqual(2);

    const conflictRes = await auth(
      request(server).post(`/founder-intent-compiler/intents/${dupId}/conflicts/detect`),
    ).expect(201);
    expect(conflictRes.body.autoResolution).toBe(false);
    expect(conflictRes.body.report.some((c: any) => c.conflictType === 'DUPLICATE')).toBe(true);

    const listConflictsRes = await auth(
      request(server).get('/founder-intent-compiler/conflicts?status=OPEN'),
    ).expect(200);
    expect(listConflictsRes.body.total).toBeGreaterThanOrEqual(1);

    // History timeline.
    const historyRes = await auth(
      request(server).get(`/founder-intent-compiler/intents/${intentId}/history`),
    ).expect(200);
    expect(historyRes.body.counts.versions).toBeGreaterThanOrEqual(2);
    expect(historyRes.body.counts.overrides).toBeGreaterThanOrEqual(1);

    // Workspace scope isolation.
    const peerToken = await registerAndLogin(`e2e-fic-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/founder-intent-compiler/intents/${intentId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // Audit trail.
    const ficAudit = await listAudit('FOUNDER_INTENT_');
    expect(ficAudit.some((item) => item.action === 'FOUNDER_INTENT_CREATED')).toBe(true);
    expect(ficAudit.some((item) => item.action === 'FOUNDER_INTENT_OVERRIDDEN')).toBe(true);
    expect(ficAudit.some((item) => item.action === 'FOUNDER_INTENT_APPROVED')).toBe(true);

    // OpenAPI exposure.
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/founder-intent-compiler/intents']).toBeDefined();
    expect(openApi.body.paths['/founder-intent-compiler/intents/{id}/versions']).toBeDefined();
    expect(openApi.body.paths['/founder-intent-compiler/intents/{id}/override']).toBeDefined();
    expect(openApi.body.paths['/founder-intent-compiler/conflicts']).toBeDefined();
    expect(openApi.body.paths['/founder-intent-compiler/graph']).toBeDefined();

    await request(server).get('/founder-intent-compiler/intents').expect(401);
  });

  it('IW-07: D13 intelligence capital, accumulation, allocation execution/rollback, and IUC enforce jwt, rules, and OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/intelligence-capital').expect(401);
      await request(app.getHttpServer()).get('/iuc').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- D13: create intelligence capital ---
    const capitalRes = await auth(request(server).post('/intelligence-capital'))
      .send({
        identity: 'Sovereign knowledge reserve',
        category: 'KNOWLEDGE',
        initialValue: 100,
        minimumValue: 10,
        authority: 'SOVEREIGN',
      })
      .expect(201);
    const capitalId = capitalRes.body.id;
    expect(capitalId).toBeDefined();
    expect(capitalRes.body.currentValue).toBe(100);
    expect(capitalRes.body.status).toBe('ACTIVE');

    // --- D13 Part B: accumulation (compounding) ---
    const compoundRes = await auth(
      request(server).post(`/intelligence-capital/${capitalId}/accumulate`),
    )
      .send({ eventType: 'COMPOUNDING', rate: 0.1, reason: 'Quarterly compounding' })
      .expect(201);
    expect(compoundRes.body.currentValue).toBeCloseTo(110, 5);

    const eventsRes = await auth(
      request(server).get(`/intelligence-capital/${capitalId}/accumulation-events`),
    ).expect(200);
    expect(eventsRes.body.some((e: any) => e.eventType === 'COMPOUNDING')).toBe(true);
    expect(eventsRes.body.some((e: any) => e.eventType === 'CREATION')).toBe(true);

    // --- D13.5: create an allocation via the existing capital module, approve it ---
    const allocRes = await auth(request(server).post('/capital/allocations'))
      .send({ category: 'KNOWLEDGE', amount: 40, currency: 'IUC', rationale: 'Fund initiative' })
      .expect(201);
    const allocId = allocRes.body.id;
    await auth(request(server).post(`/capital/allocations/${allocId}/approve`))
      .send({ decisionReason: 'Approved for execution', status: 'APPROVED' })
      .expect(201);

    // --- D13.5 Part C: execute allocation against capital (rules engine) ---
    const execRes = await auth(
      request(server).post(`/intelligence-capital/allocations/${allocId}/execute`),
    )
      .send({ capitalId, reason: 'Directive ONX-IW07-001' })
      .expect(201);
    expect(execRes.body.status).toBe('EXECUTED');

    const afterExec = await auth(request(server).get(`/intelligence-capital/${capitalId}`)).expect(
      200,
    );
    expect(afterExec.body.currentValue).toBeCloseTo(70, 5);
    expect(afterExec.body.allocatedValue).toBeCloseTo(40, 5);

    // --- Rollback restores capital ---
    const rollbackRes = await auth(
      request(server).post(`/intelligence-capital/allocations/${allocId}/rollback`),
    )
      .send({ reason: 'Downstream validation failed' })
      .expect(201);
    expect(rollbackRes.body.status).toBe('ROLLED_BACK');

    const afterRollback = await auth(
      request(server).get(`/intelligence-capital/${capitalId}`),
    ).expect(200);
    expect(afterRollback.body.currentValue).toBeCloseTo(110, 5);

    // --- Rules engine rejects an over-large allocation ---
    const bigAllocRes = await auth(request(server).post('/capital/allocations'))
      .send({ category: 'KNOWLEDGE', amount: 105, currency: 'IUC' })
      .expect(201);
    await auth(request(server).post(`/capital/allocations/${bigAllocRes.body.id}/approve`))
      .send({ status: 'APPROVED' })
      .expect(201);
    await auth(
      request(server).post(`/intelligence-capital/allocations/${bigAllocRes.body.id}/execute`),
    )
      .send({ capitalId })
      .expect(403);

    // --- D13 status transition ---
    await auth(request(server).post(`/intelligence-capital/${capitalId}/status`))
      .send({ status: 'PRESERVED', reason: 'Preservation mode' })
      .expect(201);

    // --- IUC: create, progress, state machine, evidence, evolution, relationships ---
    const iucRes = await auth(request(server).post('/iuc'))
      .send({
        title: 'Understanding of capital governance',
        domain: 'CAPITAL',
        capitalId,
      })
      .expect(201);
    const iucId = iucRes.body.id;
    expect(iucRes.body.state).toBe('NASCENT');

    await auth(request(server).post(`/iuc/${iucId}/state`))
      .send({ state: 'FORMING' })
      .expect(201);
    await auth(request(server).post(`/iuc/${iucId}/state`))
      .send({ state: 'DEVELOPING' })
      .expect(201);

    // Cannot reach ESTABLISHED below the progress threshold.
    await auth(request(server).post(`/iuc/${iucId}/state`))
      .send({ state: 'ESTABLISHED' })
      .expect(400);

    await auth(request(server).post(`/iuc/${iucId}/progress`))
      .send({ progress: 0.7, notes: 'Milestone reached' })
      .expect(201);
    await auth(request(server).post(`/iuc/${iucId}/confidence`))
      .send({ confidence: 0.8 })
      .expect(201);
    const establishedRes = await auth(request(server).post(`/iuc/${iucId}/state`))
      .send({ state: 'ESTABLISHED' })
      .expect(201);
    expect(establishedRes.body.state).toBe('ESTABLISHED');

    await auth(request(server).post(`/iuc/${iucId}/evidence`))
      .send({ description: 'Governance audit confirms enforcement', weight: 2 })
      .expect(201);

    const evolveRes = await auth(request(server).post(`/iuc/${iucId}/evolve`))
      .send({ reason: 'Underlying assumptions changed' })
      .expect(201);
    expect(evolveRes.body.state).toBe('EVOLVING');

    // Second IUC + relationship.
    const iuc2Res = await auth(request(server).post('/iuc'))
      .send({ title: 'Understanding of allocation discipline', domain: 'CAPITAL' })
      .expect(201);
    await auth(request(server).post(`/iuc/${iucId}/relationships`))
      .send({ targetIucId: iuc2Res.body.id, relationType: 'DEPENDS_ON' })
      .expect(201);

    const iucDetail = await auth(request(server).get(`/iuc/${iucId}`)).expect(200);
    expect(iucDetail.body.events.length).toBeGreaterThanOrEqual(1);
    expect(iucDetail.body.evidence.length).toBeGreaterThanOrEqual(1);
    expect(iucDetail.body.outgoingRelations.length).toBeGreaterThanOrEqual(1);

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw07-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/intelligence-capital/${capitalId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);
    await request(server)
      .get(`/iuc/${iucId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // --- Audit trail ---
    const capitalAudit = await listAudit('INTELLIGENCE_CAPITAL_');
    expect(capitalAudit.some((item) => item.action === 'INTELLIGENCE_CAPITAL_CREATED')).toBe(true);
    expect(capitalAudit.some((item) => item.action === 'INTELLIGENCE_CAPITAL_ACCUMULATED')).toBe(
      true,
    );
    const allocAudit = await listAudit('CAPITAL_ALLOCATION_EXECUTED');
    expect(allocAudit.some((item) => item.action === 'CAPITAL_ALLOCATION_EXECUTED')).toBe(true);
    const iucAudit = await listAudit('IUC_');
    expect(iucAudit.some((item) => item.action === 'IUC_CREATED')).toBe(true);
    expect(iucAudit.some((item) => item.action === 'IUC_EVOLVED')).toBe(true);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/intelligence-capital']).toBeDefined();
    expect(openApi.body.paths['/intelligence-capital/{id}/accumulate']).toBeDefined();
    expect(openApi.body.paths['/intelligence-capital/allocations/{id}/execute']).toBeDefined();
    expect(openApi.body.paths['/iuc']).toBeDefined();
    expect(openApi.body.paths['/iuc/{id}/state']).toBeDefined();
    expect(openApi.body.paths['/iuc/{id}/evolve']).toBeDefined();

    await request(server).get('/intelligence-capital').expect(401);
    await request(server).get('/iuc').expect(401);
  });

  it('IW-08: D17 intelligence measurement — profiles, scoring, trend, benchmarks, evidence, feedback, failures, dashboard, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/measurement').expect(401);
      await request(app.getHttpServer()).get('/measurement/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create a measurement profile (index) ---
    const profileRes = await auth(request(server).post('/measurement'))
      .send({
        name: 'Understanding Quality Index',
        indexType: 'UQI',
        normalizationMin: 0,
        normalizationMax: 100,
        weight: 1,
        authority: 'OPERATIONAL',
      })
      .expect(201);
    const profileId = profileRes.body.id;
    expect(profileId).toBeDefined();
    expect(profileRes.body.progressState).toBe('NASCENT');
    expect(profileRes.body.currentScore).toBe(0);

    // --- First calculation: NASCENT baseline ---
    const calc1 = await auth(request(server).post(`/measurement/${profileId}/calculate`))
      .send({ components: [{ key: 'clarity', value: 40 }], reason: 'Baseline measurement' })
      .expect(201);
    expect(calc1.body.record.normalizedScore).toBe(40);
    expect(calc1.body.profile.progressState).toBe('NASCENT');

    // --- Second calculation: improvement + rising trend ---
    const calc2 = await auth(request(server).post(`/measurement/${profileId}/calculate`))
      .send({ components: [{ key: 'clarity', value: 80, confidence: 0.9 }] })
      .expect(201);
    expect(calc2.body.record.normalizedScore).toBe(80);
    expect(calc2.body.record.delta).toBeCloseTo(40, 5);
    expect(['RISING', 'VOLATILE']).toContain(calc2.body.profile.trend);

    // --- Trend + history ---
    const trendRes = await auth(request(server).get(`/measurement/${profileId}/trend`)).expect(200);
    expect(trendRes.body.points).toBe(2);
    expect(trendRes.body.currentScore).toBe(80);
    expect(trendRes.body.series).toHaveLength(2);

    const historyRes = await auth(request(server).get(`/measurement/${profileId}/history`)).expect(
      200,
    );
    expect(historyRes.body.events.some((e: any) => e.eventType === 'CALCULATED')).toBe(true);
    expect(historyRes.body.events.some((e: any) => e.eventType === 'PROFILE_CREATED')).toBe(true);

    // --- Benchmark: set + compare ---
    const benchRes = await auth(request(server).post(`/measurement/${profileId}/benchmarks`))
      .send({ name: 'Target', value: 70, comparator: 'GTE' })
      .expect(201);
    expect(benchRes.body.comparison.met).toBe(true);
    expect(benchRes.body.comparison.benchmarkDelta).toBeCloseTo(10, 5);

    const benchListRes = await auth(
      request(server).get(`/measurement/${profileId}/benchmarks`),
    ).expect(200);
    expect(benchListRes.body.benchmarks.length).toBeGreaterThanOrEqual(1);

    // --- Evidence: integrates with D16 objects via optional references ---
    await auth(request(server).post(`/measurement/${profileId}/evidence`))
      .send({ description: 'Judgement transcript supports the score', weight: 2 })
      .expect(201);

    // --- Feedback loop: cross-domain target (D12/D13/IUC) ---
    await auth(request(server).post(`/measurement/${profileId}/feedback`))
      .send({
        feedbackType: 'LEARNING_FEEDBACK',
        targetType: 'IUC',
        targetId: 'iuc-example',
        recommendation: 'Reinforce clarity training',
      })
      .expect(201);

    // --- Failure dimension ---
    await auth(request(server).post(`/measurement/${profileId}/failures`))
      .send({
        failureType: 'LOW_CONFIDENCE',
        severity: 'HIGH',
        notes: 'Confidence briefly dropped below the reliability floor',
      })
      .expect(201);

    const failureReport = await auth(request(server).get('/measurement/failures')).expect(200);
    expect(failureReport.body.total).toBeGreaterThanOrEqual(1);
    expect(failureReport.body.byType.LOW_CONFIDENCE).toBeGreaterThanOrEqual(1);

    // --- Profile detail aggregates all related entities ---
    const detailRes = await auth(request(server).get(`/measurement/${profileId}`)).expect(200);
    expect(detailRes.body.records.length).toBeGreaterThanOrEqual(2);
    expect(detailRes.body.benchmarks.length).toBeGreaterThanOrEqual(1);
    expect(detailRes.body.evidence.length).toBeGreaterThanOrEqual(1);
    expect(detailRes.body.feedback.length).toBeGreaterThanOrEqual(1);

    // --- Update + list ---
    await auth(request(server).put(`/measurement/${profileId}`))
      .send({ description: 'Primary understanding quality index' })
      .expect(200);
    const listRes = await auth(request(server).get('/measurement?indexType=UQI')).expect(200);
    expect(listRes.body.total).toBeGreaterThanOrEqual(1);

    // --- Dashboard composite ---
    const dashboardRes = await auth(request(server).get('/measurement/dashboard')).expect(200);
    expect(dashboardRes.body.totalProfiles).toBeGreaterThanOrEqual(1);
    expect(dashboardRes.body.byIndexType.UQI).toBeDefined();
    expect(typeof dashboardRes.body.compositeScore).toBe('number');
    expect(dashboardRes.body.totalFailures).toBeGreaterThanOrEqual(1);

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw08-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/measurement/${profileId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);
    await request(server)
      .post(`/measurement/${profileId}/calculate`)
      .set('Authorization', `Bearer ${peerToken}`)
      .send({ components: [{ key: 'clarity', value: 10 }] })
      .expect(404);

    // --- Audit trail ---
    const measurementAudit = await listAudit('MEASUREMENT_');
    expect(measurementAudit.some((item) => item.action === 'MEASUREMENT_PROFILE_CREATED')).toBe(
      true,
    );
    expect(measurementAudit.some((item) => item.action === 'MEASUREMENT_CALCULATED')).toBe(true);
    expect(measurementAudit.some((item) => item.action === 'MEASUREMENT_BENCHMARK_SET')).toBe(true);
    expect(measurementAudit.some((item) => item.action === 'MEASUREMENT_FEEDBACK_RECORDED')).toBe(
      true,
    );
    expect(measurementAudit.some((item) => item.action === 'MEASUREMENT_FAILURE_RECORDED')).toBe(
      true,
    );
    measurementAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/measurement']).toBeDefined();
    expect(openApi.body.paths['/measurement/dashboard']).toBeDefined();
    expect(openApi.body.paths['/measurement/failures']).toBeDefined();
    expect(openApi.body.paths['/measurement/{id}/calculate']).toBeDefined();
    expect(openApi.body.paths['/measurement/{id}/trend']).toBeDefined();
    expect(openApi.body.paths['/measurement/{id}/benchmarks']).toBeDefined();
    expect(openApi.body.paths['/measurement/{id}/feedback']).toBeDefined();
    expect(openApi.body.paths['/measurement/{id}/failures']).toBeDefined();

    await request(server).get('/measurement').expect(401);
    await request(server).get('/measurement/dashboard').expect(401);
  });

  it('IW-09: D18 intelligence runtime — sessions, state machine, contexts, events, checkpoints, recovery, continuity, health, dashboard, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/runtime').expect(401);
      await request(app.getHttpServer()).get('/runtime/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create a runtime session (Part A) ---
    const createRes = await auth(request(server).post('/runtime'))
      .send({ name: 'Orchestration Runtime', authority: 'OPERATIONAL' })
      .expect(201);
    const sessionId = createRes.body.id;
    expect(sessionId).toBeDefined();
    expect(createRes.body.state).toBe('CREATED');
    expect(createRes.body.healthStatus).toBe('UNKNOWN');

    // --- Drive the validated state machine (Part B): CREATED -> INITIALIZING -> READY -> RUNNING ---
    const transition = (state: string) =>
      auth(request(server).post(`/runtime/${sessionId}/state`))
        .send({ state })
        .expect(201);
    await transition('INITIALIZING');
    await transition('READY');
    const runningRes = await transition('RUNNING');
    expect(runningRes.body.state).toBe('RUNNING');

    // --- Invalid transition is rejected ---
    await auth(request(server).post(`/runtime/${sessionId}/state`))
      .send({ state: 'CREATED' })
      .expect(400);

    // --- Attach a runtime context object (Part C), integrating with a prior domain by reference ---
    const ctxRes = await auth(request(server).post(`/runtime/${sessionId}/contexts`))
      .send({
        contextType: 'KNOWLEDGE',
        key: 'primary-corpus',
        referenceId: 'd16-object-1',
        referenceType: 'IntelligenceObject',
        payload: { scope: 'session' },
      })
      .expect(201);
    expect(ctxRes.body.version).toBe(1);
    const ctxList = await auth(request(server).get(`/runtime/${sessionId}/contexts`)).expect(200);
    expect(ctxList.body.contexts.length).toBeGreaterThanOrEqual(1);

    // --- Record a heartbeat event ---
    await auth(request(server).post(`/runtime/${sessionId}/events`))
      .send({ eventType: 'HEARTBEAT' })
      .expect(201);
    const events = await auth(request(server).get(`/runtime/${sessionId}/events`)).expect(200);
    expect(events.body.events.some((e: any) => e.eventType === 'HEARTBEAT')).toBe(true);

    // --- Create a checkpoint capturing current contexts (Part D) ---
    const checkpointRes = await auth(request(server).post(`/runtime/${sessionId}/checkpoints`))
      .send({ label: 'stable-milestone', checkpointType: 'MILESTONE' })
      .expect(201);
    const checkpointId = checkpointRes.body.id;
    expect(checkpointRes.body.capturedState).toBe('RUNNING');
    expect(checkpointRes.body.contextCount).toBeGreaterThanOrEqual(1);

    // --- Snapshot the runtime ---
    await auth(request(server).post(`/runtime/${sessionId}/snapshots`)).expect(201);

    // --- Degrade then fail the runtime, then recover from the checkpoint ---
    await transition('DEGRADED');
    await transition('FAILED');
    const recoverRes = await auth(request(server).post(`/runtime/${sessionId}/recover`))
      .send({ recoveryType: 'CHECKPOINT_RESTORE', checkpointId, reason: 'Restore after failure' })
      .expect(201);
    expect(recoverRes.body.recovery.status).toBe('COMPLETED');
    expect(recoverRes.body.session.state).toBe('RUNNING');
    expect(recoverRes.body.session.recoveryCount).toBe(1);

    // --- Restore endpoint (dedicated checkpoint restore) after pausing ---
    await transition('PAUSED');
    const restoreRes = await auth(
      request(server).post(`/runtime/${sessionId}/checkpoints/${checkpointId}/restore`),
    )
      .send({ reason: 'Restore from milestone' })
      .expect(201);
    expect(restoreRes.body.session.recoveryCount).toBe(2);

    // --- Session resume from a paused posture ---
    await transition('PAUSED');
    const resumeRes = await auth(request(server).post(`/runtime/${sessionId}/resume`))
      .send({ reason: 'Resume work' })
      .expect(201);
    expect(resumeRes.body.session.state).toBe('RUNNING');

    // --- Recovery history ---
    const recoveries = await auth(request(server).get(`/runtime/${sessionId}/recoveries`)).expect(
      200,
    );
    expect(recoveries.body.recoveries.length).toBeGreaterThanOrEqual(3);

    // --- Continuity (Part E): lineage + state history ---
    const continuity = await auth(request(server).get(`/runtime/${sessionId}/continuity`)).expect(
      200,
    );
    expect(continuity.body.recoveryCount).toBeGreaterThanOrEqual(3);
    expect(continuity.body.stateHistory.length).toBeGreaterThanOrEqual(4);

    // --- History stream ---
    const history = await auth(request(server).get(`/runtime/${sessionId}/history`)).expect(200);
    expect(history.body.events.some((e: any) => e.eventType === 'RECOVERY')).toBe(true);
    expect(history.body.events.some((e: any) => e.eventType === 'CHECKPOINT_CREATED')).toBe(true);

    // --- Governance policy (Part F) ---
    await auth(request(server).post(`/runtime/${sessionId}/policies`))
      .send({ name: 'recovery-ceiling', policyType: 'RECOVERY', rules: { maxRecoveries: 5 } })
      .expect(201);
    const policies = await auth(request(server).get(`/runtime/${sessionId}/policies`)).expect(200);
    expect(policies.body.policies.length).toBeGreaterThanOrEqual(1);

    // --- Health evaluation ---
    const healthRes = await auth(request(server).get(`/runtime/${sessionId}/health`)).expect(200);
    expect(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN']).toContain(healthRes.body.healthStatus);

    // --- Session detail aggregates related entities ---
    const detail = await auth(request(server).get(`/runtime/${sessionId}`)).expect(200);
    expect(detail.body.states.length).toBeGreaterThanOrEqual(4);
    expect(detail.body.checkpoints.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.recoveries.length).toBeGreaterThanOrEqual(3);

    // --- Dashboard composite ---
    const dashboard = await auth(request(server).get('/runtime/dashboard')).expect(200);
    expect(dashboard.body.totalSessions).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.totalCheckpoints).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.totalRecoveries).toBeGreaterThanOrEqual(3);
    expect(dashboard.body.states.length).toBe(12);

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw09-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/runtime/${sessionId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);
    await request(server)
      .post(`/runtime/${sessionId}/state`)
      .set('Authorization', `Bearer ${peerToken}`)
      .send({ state: 'STOPPING' })
      .expect(404);

    // --- Audit trail ---
    const runtimeAudit = await listAudit('RUNTIME_');
    expect(runtimeAudit.some((item) => item.action === 'RUNTIME_SESSION_CREATED')).toBe(true);
    expect(runtimeAudit.some((item) => item.action === 'RUNTIME_STATE_TRANSITIONED')).toBe(true);
    expect(runtimeAudit.some((item) => item.action === 'RUNTIME_CHECKPOINT_CREATED')).toBe(true);
    expect(runtimeAudit.some((item) => item.action === 'RUNTIME_RECOVERED')).toBe(true);
    expect(runtimeAudit.some((item) => item.action === 'RUNTIME_POLICY_SET')).toBe(true);
    runtimeAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/runtime']).toBeDefined();
    expect(openApi.body.paths['/runtime/dashboard']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/state']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/contexts']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/checkpoints']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/checkpoints/{checkpointId}/restore']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/recover']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/continuity']).toBeDefined();
    expect(openApi.body.paths['/runtime/{id}/health']).toBeDefined();

    await request(server).get('/runtime').expect(401);
    await request(server).get('/runtime/dashboard').expect(401);
  });

  it('IW-10: D19 intelligence exchange — sessions, pipeline, ownership, trust, lineage, validation, governance, replay, rollback, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/exchange').expect(401);
      await request(app.getHttpServer()).get('/exchange/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create an exchange session (Part A) ---
    const sessionRes = await auth(request(server).post('/exchange/sessions'))
      .send({ name: 'Intelligence Exchange', authority: 'SOVEREIGN', ownershipClass: 'FOUNDER' })
      .expect(201);
    const sessionId = sessionRes.body.id;
    expect(sessionId).toBeDefined();
    expect(sessionRes.body.state).toBe('OPEN');
    expect(sessionRes.body.ownershipClass).toBe('FOUNDER');

    // --- Create an exchange transaction (Part A/C/D/E), sealing an envelope at INTEND ---
    const createRes = await auth(request(server).post('/exchange'))
      .send({
        sessionId,
        intent: 'Transfer insight to runtime',
        authority: 'SOVEREIGN',
        origin: 'agent-a',
        destination: 'agent-b',
        sourceObjectId: 'd16-object-1',
        sourceObjectType: 'IntelligenceObject',
        targetObjectId: 'd18-runtime-1',
        targetObjectType: 'Runtime',
        confidence: 1,
        provenance: 'founder-intent',
        payload: { subject: 'insight', value: 42 },
      })
      .expect(201);
    const txnId = createRes.body.id;
    expect(txnId).toBeDefined();
    expect(createRes.body.stage).toBe('INTEND');
    expect(createRes.body.ownershipClass).toBe('FOUNDER');

    // --- Submit through the full validated pipeline (Part B) to COMPLETE ---
    const submitRes = await auth(request(server).post(`/exchange/${txnId}/submit`))
      .send({})
      .expect(201);
    expect(submitRes.body.transaction.stage).toBe('COMPLETE');
    expect(submitRes.body.transaction.status).toBe('COMPLETED');
    expect(submitRes.body.validation.passed).toBe(true);

    // --- Cannot submit twice (guarded to INTEND) ---
    await auth(request(server).post(`/exchange/${txnId}/submit`))
      .send({})
      .expect(400);

    // --- Status snapshot (Part B/D) ---
    const statusRes = await auth(request(server).get(`/exchange/${txnId}/status`)).expect(200);
    expect(statusRes.body.stage).toBe('COMPLETE');
    expect(statusRes.body.terminal).toBe(true);
    expect(statusRes.body.trustScore).toBeGreaterThan(0);

    // --- History records every persisted stage transition (Part B) ---
    const historyRes = await auth(request(server).get(`/exchange/${txnId}/history`)).expect(200);
    const eventTypes = historyRes.body.events.map((e: any) => e.eventType);
    expect(eventTypes).toContain('STAGE_ADVANCED');
    expect(eventTypes).toContain('COMPLETED');
    expect(eventTypes).toContain('RECEIPT_ISSUED');
    expect(eventTypes).toContain('LINEAGE_RECORDED');

    // --- Lineage (Part E) ---
    const lineageRes = await auth(request(server).get(`/exchange/${txnId}/lineage`)).expect(200);
    expect(lineageRes.body.lineages.length).toBeGreaterThanOrEqual(1);
    expect(lineageRes.body.origin).toBe('agent-a');

    // --- Audit/validation records (Part F) ---
    const auditRes = await auth(request(server).get(`/exchange/${txnId}/audit`)).expect(200);
    expect(auditRes.body.audits.some((a: any) => a.dimension === 'integrity')).toBe(true);

    // --- Receipts issued during VERIFY ---
    const receiptsRes = await auth(request(server).get(`/exchange/${txnId}/receipts`)).expect(200);
    expect(receiptsRes.body.receipts.length).toBeGreaterThanOrEqual(1);

    // --- Explicit validation run (Part F) ---
    const validateRes = await auth(request(server).post(`/exchange/${txnId}/validate`))
      .send({})
      .expect(201);
    expect(validateRes.body.passed).toBe(true);
    expect(validateRes.body.checks.length).toBe(8);

    // --- Replay a completed exchange (Part G) ---
    const replayRes = await auth(request(server).post(`/exchange/${txnId}/replay`))
      .send({ reason: 'Re-run exchange' })
      .expect(201);
    expect(replayRes.body.transaction.stage).toBe('COMPLETE');

    // --- Rollback the (now completed) exchange (Part G) ---
    const rollbackRes = await auth(request(server).post(`/exchange/${txnId}/rollback`))
      .send({ reason: 'Manual reversal' })
      .expect(201);
    expect(rollbackRes.body.status).toBe('ROLLED_BACK');
    expect(rollbackRes.body.rolledBack).toBe(true);

    // --- Governance policy that forces a validation failure (Part F/G) ---
    await auth(request(server).post(`/exchange/sessions/${sessionId}/policies`))
      .send({ name: 'unreachable-trust', policyType: 'TRUST', rules: { minTrust: 0.999 } })
      .expect(201);
    const policiesRes = await auth(
      request(server).get(`/exchange/sessions/${sessionId}/policies`),
    ).expect(200);
    expect(policiesRes.body.policies.length).toBeGreaterThanOrEqual(1);

    const failCreate = await auth(request(server).post('/exchange'))
      .send({
        sessionId,
        intent: 'Low-trust exchange',
        payload: { subject: 'weak' },
      })
      .expect(201);
    const failSubmit = await auth(request(server).post(`/exchange/${failCreate.body.id}/submit`))
      .send({})
      .expect(201);
    expect(failSubmit.body.transaction.stage).toBe('FAILED');
    expect(failSubmit.body.validation.passed).toBe(false);

    // --- Transaction detail aggregates related entities ---
    const detail = await auth(request(server).get(`/exchange/${txnId}`)).expect(200);
    expect(detail.body.envelopes.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.receipts.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.lineages.length).toBeGreaterThanOrEqual(1);

    // --- Dashboard composite ---
    const dashboard = await auth(request(server).get('/exchange/dashboard')).expect(200);
    expect(dashboard.body.totalSessions).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.totalTransactions).toBeGreaterThanOrEqual(2);
    expect(dashboard.body.stages.length).toBe(10);
    expect(dashboard.body.ownershipClasses.length).toBe(7);

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw10-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/exchange/${txnId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);
    await request(server)
      .post(`/exchange/${txnId}/submit`)
      .set('Authorization', `Bearer ${peerToken}`)
      .send({})
      .expect(404);

    // --- Audit trail ---
    const exchangeAudit = await listAudit('EXCHANGE_');
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_SESSION_CREATED')).toBe(true);
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_CREATED')).toBe(true);
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_SUBMITTED')).toBe(true);
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_VALIDATED')).toBe(true);
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_REPLAYED')).toBe(true);
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_ROLLED_BACK')).toBe(true);
    expect(exchangeAudit.some((item) => item.action === 'EXCHANGE_POLICY_SET')).toBe(true);
    exchangeAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/exchange']).toBeDefined();
    expect(openApi.body.paths['/exchange/dashboard']).toBeDefined();
    expect(openApi.body.paths['/exchange/sessions']).toBeDefined();
    expect(openApi.body.paths['/exchange/{id}/submit']).toBeDefined();
    expect(openApi.body.paths['/exchange/{id}/status']).toBeDefined();
    expect(openApi.body.paths['/exchange/{id}/lineage']).toBeDefined();
    expect(openApi.body.paths['/exchange/{id}/validate']).toBeDefined();
    expect(openApi.body.paths['/exchange/{id}/replay']).toBeDefined();
    expect(openApi.body.paths['/exchange/{id}/rollback']).toBeDefined();

    await request(server).get('/exchange').expect(401);
    await request(server).get('/exchange/dashboard').expect(401);
  });

  it('IW-11: D15 proof & stress architecture — proof sessions, certification gates, failure injection, contradictions, stress campaigns, recovery, dashboards, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/proof/dashboard').expect(401);
      await request(app.getHttpServer()).get('/stress/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create a proof session (Part A) ---
    const sessionRes = await auth(request(server).post('/proof/sessions'))
      .send({ name: 'Constitutional verification', scope: 'full-system', targetDomain: 'EXCHANGE' })
      .expect(201);
    const proofSessionId = sessionRes.body.id;
    expect(proofSessionId).toBeDefined();
    expect(sessionRes.body.state).toBe('OPEN');

    // --- Create a proof scenario (Part F) ---
    const scenarioRes = await auth(
      request(server).post(`/proof/sessions/${proofSessionId}/scenarios`),
    )
      .send({ name: 'Exchange integrity replay', group: 'EXCHANGE', gate: 'EXCHANGE_INTEGRITY' })
      .expect(201);
    expect(scenarioRes.body.id).toBeDefined();
    expect(scenarioRes.body.version).toBe(1);

    // --- Run the certification gates (Part C) ---
    const runRes = await auth(request(server).post(`/proof/sessions/${proofSessionId}/run`))
      .send({})
      .expect(201);
    expect(runRes.body.results.length).toBe(10);
    expect(runRes.body.summary.gatesTotal).toBe(10);

    // --- Certify the session across all gates (Part G) ---
    const certifyRes = await auth(request(server).post(`/proof/sessions/${proofSessionId}/certify`))
      .send({})
      .expect(201);
    expect(certifyRes.body.certifications.length).toBe(10);
    expect(certifyRes.body.session.state).toBe('CERTIFIED');
    expect(['PASS', 'WARNING', 'FAIL', 'CRITICAL']).toContain(certifyRes.body.summary.outcome);

    // --- A gate run with injected violations produces findings ---
    const failRun = await auth(request(server).post(`/proof/sessions/${proofSessionId}/run`))
      .send({ gate: 'CAPITAL_INTEGRITY', signals: { capitalViolations: 6 } })
      .expect(201);
    expect(failRun.body.summary.passed).toBe(false);

    const findingsRes = await auth(
      request(server).get(`/proof/sessions/${proofSessionId}/findings`),
    ).expect(200);
    expect(findingsRes.body.length).toBeGreaterThanOrEqual(1);

    // --- Certification report enumerates all ten gates (Part G) ---
    const reportRes = await auth(
      request(server).get(`/proof/sessions/${proofSessionId}/report`),
    ).expect(200);
    expect(reportRes.body.gates.length).toBe(10);
    expect(reportRes.body.gatesTotal).toBe(10);

    // --- Certifications list ---
    const certsRes = await auth(
      request(server).get(`/proof/sessions/${proofSessionId}/certifications`),
    ).expect(200);
    expect(certsRes.body.length).toBeGreaterThanOrEqual(10);

    // --- History + evidence trails ---
    const proofHistory = await auth(
      request(server).get(`/proof/sessions/${proofSessionId}/history`),
    ).expect(200);
    expect(proofHistory.body.some((e: any) => e.eventType === 'PROOF_CERTIFIED')).toBe(true);
    const proofEvidence = await auth(
      request(server).get(`/proof/sessions/${proofSessionId}/evidence`),
    ).expect(200);
    expect(proofEvidence.body.length).toBeGreaterThanOrEqual(1);

    // --- Contradiction engine (Part E) ---
    const contraRes = await auth(request(server).post('/proof/contradictions'))
      .send({
        sessionId: proofSessionId,
        candidates: [
          { type: 'KNOWLEDGE', leftValue: 1, rightValue: 1 },
          { type: 'GOVERNANCE', leftValue: true, rightValue: false },
        ],
      })
      .expect(201);
    expect(contraRes.body.count).toBe(1);
    expect(contraRes.body.evaluated).toBe(2);
    const contraList = await auth(request(server).get('/proof/contradictions')).expect(200);
    expect(contraList.body.length).toBeGreaterThanOrEqual(1);

    // --- Proof dashboard ---
    const proofDash = await auth(request(server).get('/proof/dashboard')).expect(200);
    expect(proofDash.body.gates.length).toBe(10);
    expect(proofDash.body.sessions).toBeGreaterThanOrEqual(1);

    // --- Create a stress campaign (Part B) ---
    const campaignRes = await auth(request(server).post('/stress/campaigns'))
      .send({ name: 'Runtime resilience campaign', group: 'RUNTIME' })
      .expect(201);
    const campaignId = campaignRes.body.id;
    expect(campaignId).toBeDefined();
    expect(campaignRes.body.state).toBe('OPEN');

    // --- Create a stress scenario (Part F) ---
    const stressScenarioRes = await auth(
      request(server).post(`/stress/campaigns/${campaignId}/scenarios`),
    )
      .send({
        name: 'Runtime interruption',
        group: 'RUNTIME',
        injectionType: 'RUNTIME_INTERRUPTION',
      })
      .expect(201);
    expect(stressScenarioRes.body.id).toBeDefined();

    // --- Run the full failure-injection battery (Part D) ---
    const stressRun = await auth(request(server).post(`/stress/campaigns/${campaignId}/run`))
      .send({})
      .expect(201);
    expect(stressRun.body.results.length).toBe(10);
    expect(stressRun.body.resilienceScore).toBe(1);
    expect(stressRun.body.recoveredCount).toBe(10);

    // --- Inject a single controlled failure that cannot recover (Part D) ---
    const injectRes = await auth(request(server).post(`/stress/campaigns/${campaignId}/inject`))
      .send({ injectionType: 'STATE_CORRUPTION', defenses: { canDetect: false } })
      .expect(201);
    expect(injectRes.body.result.status).toBe('UNRECOVERED');
    expect(injectRes.body.result.outcome).toBe('CRITICAL');

    // --- Stress evidence + history ---
    const stressEvidence = await auth(
      request(server).get(`/stress/campaigns/${campaignId}/evidence`),
    ).expect(200);
    expect(stressEvidence.body.length).toBeGreaterThanOrEqual(1);
    const stressHistory = await auth(
      request(server).get(`/stress/campaigns/${campaignId}/history`),
    ).expect(200);
    expect(stressHistory.body.some((e: any) => e.eventType === 'STRESS_RUN')).toBe(true);
    expect(stressHistory.body.some((e: any) => e.eventType === 'FAILURE_INJECTED')).toBe(true);

    // --- Stress dashboard ---
    const stressDash = await auth(request(server).get('/stress/dashboard')).expect(200);
    expect(stressDash.body.injectionTypes.length).toBe(10);
    expect(stressDash.body.campaigns).toBeGreaterThanOrEqual(1);

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw11-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/proof/sessions/${proofSessionId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);
    await request(server)
      .get(`/stress/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // --- Audit trail ---
    const proofAudit = await listAudit('PROOF_');
    expect(proofAudit.some((item) => item.action === 'PROOF_SESSION_CREATED')).toBe(true);
    expect(proofAudit.some((item) => item.action === 'PROOF_RUN')).toBe(true);
    expect(proofAudit.some((item) => item.action === 'PROOF_CERTIFIED')).toBe(true);
    proofAudit.slice(0, 3).forEach(expectUnifiedAuditShape);
    const stressAudit = await listAudit('STRESS_');
    expect(stressAudit.some((item) => item.action === 'STRESS_CAMPAIGN_CREATED')).toBe(true);
    expect(stressAudit.some((item) => item.action === 'STRESS_RUN')).toBe(true);
    const injectAudit = await listAudit('FAILURE_INJECTED');
    expect(injectAudit.some((item) => item.action === 'FAILURE_INJECTED')).toBe(true);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/proof/sessions']).toBeDefined();
    expect(openApi.body.paths['/proof/dashboard']).toBeDefined();
    expect(openApi.body.paths['/proof/contradictions']).toBeDefined();
    expect(openApi.body.paths['/proof/sessions/{id}/run']).toBeDefined();
    expect(openApi.body.paths['/proof/sessions/{id}/certify']).toBeDefined();
    expect(openApi.body.paths['/proof/sessions/{id}/report']).toBeDefined();
    expect(openApi.body.paths['/stress/campaigns']).toBeDefined();
    expect(openApi.body.paths['/stress/dashboard']).toBeDefined();
    expect(openApi.body.paths['/stress/campaigns/{id}/run']).toBeDefined();
    expect(openApi.body.paths['/stress/campaigns/{id}/inject']).toBeDefined();

    await request(server).get('/proof/dashboard').expect(401);
    await request(server).get('/stress/dashboard').expect(401);
  });

  it('IW-13: D14 meta-intelligence orchestration — orchestration, routing, arbitration, merge, override, governance, coordination, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/meta/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create an orchestration session (Part A) ---
    const sessionRes = await auth(request(server).post('/meta/orchestrations'))
      .send({
        name: 'Capital reconciliation',
        objective: 'reconcile capital',
        targetDomain: 'CAPITAL',
      })
      .expect(201);
    const sessionId = sessionRes.body.id;
    expect(sessionId).toBeDefined();
    expect(sessionRes.body.state).toBe('OPEN');

    // --- Start orchestration — builds a routed plan (Part A/B) ---
    const startRes = await auth(request(server).post(`/meta/orchestrations/${sessionId}/start`))
      .send({
        planName: 'Plan v1',
        steps: [
          { name: 'Load capital', intent: 'allocate capital' },
          { name: 'Run session', target: 'RUNTIME' },
        ],
      })
      .expect(201);
    expect(startRes.body.plan.stepCount).toBe(2);

    // --- Execution plan + state + history (Part A) ---
    const planRes = await auth(
      request(server).get(`/meta/orchestrations/${sessionId}/plan`),
    ).expect(200);
    expect(planRes.body.steps.length).toBe(2);
    expect(planRes.body.steps[0].target).toBe('CAPITAL');

    const stateRes = await auth(
      request(server).get(`/meta/orchestrations/${sessionId}/state`),
    ).expect(200);
    expect(stateRes.body.status).toBe('RUNNING');

    // --- Routing engine (Part B) ---
    const routeRes = await auth(request(server).post(`/meta/orchestrations/${sessionId}/route`))
      .send({ intent: 'measure benchmark score' })
      .expect(201);
    expect(routeRes.body.target).toBe('MEASUREMENT');
    expect(routeRes.body.constitutionalRef).toContain('D17');

    // --- Arbitration engine (Part C) ---
    const arbRes = await auth(request(server).post(`/meta/orchestrations/${sessionId}/arbitrate`))
      .send({
        type: 'PRIORITY',
        paths: [
          { id: 'path-a', priority: 0.9 },
          { id: 'path-b', priority: 0.2 },
        ],
      })
      .expect(201);
    expect(arbRes.body.winningPath).toBe('path-a');
    expect(arbRes.body.outcome).toBe('RESOLVED');

    // --- Merge engine (Part D) ---
    const mergeRes = await auth(request(server).post(`/meta/orchestrations/${sessionId}/merge`))
      .send({ sourcePaths: ['path-a', 'path-c'] })
      .expect(201);
    const mergeId = mergeRes.body.id;
    expect(mergeRes.body.validated).toBe(true);

    const commitRes = await auth(request(server).post(`/meta/merges/${mergeId}/commit`))
      .send({})
      .expect(201);
    expect(commitRes.body.status).toBe('MERGED');

    const rollbackRes = await auth(request(server).post(`/meta/merges/${mergeId}/rollback`))
      .send({ reason: 'reverting' })
      .expect(201);
    expect(rollbackRes.body.status).toBe('ROLLED_BACK');

    // --- Governance policy (Part G) ---
    const policyRes = await auth(request(server).post('/meta/policies'))
      .send({ name: 'Capital-first routing', policyType: 'ROUTING', target: 'CAPITAL' })
      .expect(201);
    expect(policyRes.body.policyType).toBe('ROUTING');
    const policiesRes = await auth(request(server).get('/meta/policies')).expect(200);
    expect(policiesRes.body.routing.length).toBeGreaterThanOrEqual(1);

    // --- Founder override (Part E) — immutable, locks the session ---
    const overrideRes = await auth(
      request(server).post(`/meta/orchestrations/${sessionId}/override`),
    )
      .send({ overrideType: 'CONSTITUTIONAL', directive: 'Force path A under founder authority' })
      .expect(201);
    expect(overrideRes.body.overrideType).toBe('CONSTITUTIONAL');
    // Session is now overridden — starting again is refused
    await auth(request(server).post(`/meta/orchestrations/${sessionId}/start`))
      .send({})
      .expect(400);

    // --- History trail (Part A) ---
    const historyRes = await auth(
      request(server).get(`/meta/orchestrations/${sessionId}/history`),
    ).expect(200);
    expect(historyRes.body.some((e: any) => e.eventType === 'FOUNDER_OVERRIDE')).toBe(true);
    expect(historyRes.body.some((e: any) => e.eventType === 'ARBITRATED')).toBe(true);

    // --- Dashboard + cross-runtime coordination (Part F) ---
    const dashRes = await auth(request(server).get('/meta/dashboard')).expect(200);
    expect(dashRes.body.routing.supportedTargets.length).toBe(9);
    expect(dashRes.body.coordination.coordinatedRuntimes).toContain('IUC');
    expect(dashRes.body.coordination.footprint).toHaveProperty('D18');

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw13-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/meta/orchestrations/${sessionId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // --- Audit trail ---
    const metaAudit = await listAudit('META_');
    expect(metaAudit.some((item) => item.action === 'META_CREATE_ORCHESTRATION')).toBe(true);
    expect(metaAudit.some((item) => item.action === 'META_ROUTE')).toBe(true);
    expect(metaAudit.some((item) => item.action === 'META_ARBITRATE')).toBe(true);
    expect(metaAudit.some((item) => item.action === 'META_OVERRIDE')).toBe(true);
    metaAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/meta/orchestrations']).toBeDefined();
    expect(openApi.body.paths['/meta/dashboard']).toBeDefined();
    expect(openApi.body.paths['/meta/policies']).toBeDefined();
    expect(openApi.body.paths['/meta/orchestrations/{id}/start']).toBeDefined();
    expect(openApi.body.paths['/meta/orchestrations/{id}/route']).toBeDefined();
    expect(openApi.body.paths['/meta/orchestrations/{id}/arbitrate']).toBeDefined();
    expect(openApi.body.paths['/meta/orchestrations/{id}/merge']).toBeDefined();
    expect(openApi.body.paths['/meta/orchestrations/{id}/override']).toBeDefined();

    await request(server).get('/meta/dashboard').expect(401);
  });

  it('IW-14: USFIP universal strategic founder intelligence protocol — session, interpretation, protocol, rules, policies, execution, governance, override, history, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/usfip/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create a USFIP session — interprets founder intent (Part A/B) ---
    const sessionRes = await auth(request(server).post('/usfip/sessions'))
      .send({
        name: 'FY26 strategic protocol',
        founderDirective: 'Establish durable capital advantage',
        strategicPriority: 'HIGH',
        strategicHorizon: 'SHORT',
      })
      .expect(201);
    const sessionId = sessionRes.body.id;
    expect(sessionId).toBeDefined();
    expect(sessionRes.body.state).toBe('INTERPRETING');
    expect(sessionRes.body.strategicPriority).toBe('HIGH');

    // --- Re-interpret the directive (Part B) ---
    const interpretRes = await auth(request(server).post(`/usfip/sessions/${sessionId}/interpret`))
      .send({ strategicPriority: 'CRITICAL' })
      .expect(201);
    expect(interpretRes.body.interpretation.strategicPriority).toBe('CRITICAL');

    // --- Create a protocol under the session (Part A) ---
    const protocolRes = await auth(request(server).post(`/usfip/sessions/${sessionId}/protocols`))
      .send({ name: 'Capital advantage protocol' })
      .expect(201);
    const protocolId = protocolRes.body.id;
    expect(protocolId).toBeDefined();
    expect(protocolRes.body.status).toBe('DRAFT');

    // --- Add a rule and a policy (Part C management) ---
    await auth(request(server).post(`/usfip/protocols/${protocolId}/rules`))
      .send({ name: 'Prioritise compounding', ordering: 1, weight: 0.8 })
      .expect(201);
    const policyRes = await auth(request(server).post(`/usfip/protocols/${protocolId}/policies`))
      .send({ name: 'Capital-first', priority: 5, strategicPriority: 'HIGH' })
      .expect(201);
    const policyId = policyRes.body.id;
    expect(policyId).toBeDefined();

    // --- Activate the protocol (Part C) ---
    const activateRes = await auth(request(server).post(`/usfip/protocols/${protocolId}/activate`))
      .send({})
      .expect(201);
    expect(activateRes.body.status).toBe('ACTIVE');

    // --- Protocol detail with ordered rules + policies (Part A/C) ---
    const detailRes = await auth(request(server).get(`/usfip/protocols/${protocolId}`)).expect(200);
    expect(detailRes.body.rules.length).toBe(1);
    expect(detailRes.body.policies.length).toBe(1);

    // --- Constitutional governance validation (Part D) ---
    const validateRes = await auth(
      request(server).get(`/usfip/protocols/${protocolId}/validate`),
    ).expect(200);
    expect(validateRes.body.validation.valid).toBe(true);
    expect(validateRes.body.validation.founderAuthorityValid).toBe(true);

    // --- Execute the protocol — governed policy + rule ordering (Part C) ---
    const executeRes = await auth(request(server).post(`/usfip/protocols/${protocolId}/execute`))
      .send({})
      .expect(201);
    expect(executeRes.body.evaluation.selectedPolicyId).toBe(policyId);
    expect(executeRes.body.evaluation.selectedRuleIds.length).toBe(1);
    expect(executeRes.body.evaluation.executionPath[0]).toBe('INTERPRET');
    expect(
      executeRes.body.evaluation.executionPath[executeRes.body.evaluation.executionPath.length - 1],
    ).toBe('EXECUTE');
    expect(executeRes.body.evaluation.score).toBeGreaterThan(0);

    // --- Immutable protocol history (Part E) ---
    const historyRes = await auth(
      request(server).get(`/usfip/sessions/${sessionId}/history`),
    ).expect(200);
    expect(historyRes.body.some((e: any) => e.eventType === 'PROTOCOL_EXECUTED')).toBe(true);
    expect(historyRes.body.some((e: any) => e.eventType === 'PROTOCOL_ACTIVATED')).toBe(true);

    // --- Founder override (Part D) — immutable, locks the session ---
    const overrideRes = await auth(request(server).post(`/usfip/sessions/${sessionId}/override`))
      .send({ directive: 'Halt under founder authority' })
      .expect(201);
    expect(overrideRes.body.overridden).toBe(true);
    expect(overrideRes.body.state).toBe('OVERRIDDEN');
    // Re-execution is refused under an override
    await auth(request(server).post(`/usfip/protocols/${protocolId}/execute`))
      .send({})
      .expect(400);

    // --- Dashboard + reused runtimes (compatibility) ---
    const dashRes = await auth(request(server).get('/usfip/dashboard')).expect(200);
    expect(dashRes.body.protocols.active).toBeGreaterThanOrEqual(1);
    expect(dashRes.body.reusedRuntimes).toContain('FIC');
    expect(dashRes.body.reusedRuntimes).toContain('IUC');
    expect(dashRes.body.sessions.overridden).toBeGreaterThanOrEqual(1);

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw14-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/usfip/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // --- Audit trail ---
    const usfipAudit = await listAudit('USFIP_');
    expect(usfipAudit.some((item) => item.action === 'USFIP_CREATE_SESSION')).toBe(true);
    expect(usfipAudit.some((item) => item.action === 'USFIP_EXECUTE')).toBe(true);
    expect(usfipAudit.some((item) => item.action === 'USFIP_OVERRIDE')).toBe(true);
    usfipAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/usfip/sessions']).toBeDefined();
    expect(openApi.body.paths['/usfip/dashboard']).toBeDefined();
    expect(openApi.body.paths['/usfip/protocols/{protocolId}/execute']).toBeDefined();
    expect(openApi.body.paths['/usfip/protocols/{protocolId}/validate']).toBeDefined();
    expect(openApi.body.paths['/usfip/protocols/{protocolId}/activate']).toBeDefined();
    expect(openApi.body.paths['/usfip/sessions/{id}/override']).toBeDefined();
    expect(openApi.body.paths['/usfip/sessions/{id}/history']).toBeDefined();

    await request(server).get('/usfip/dashboard').expect(401);
  });

  it('IW-15: IFC institutional flourishing capital — profile, dimensions, indicators, scoring, capitalization, alignment, governance, override, history, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/ifc/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Create an IFC profile — seeds the 8 flourishing dimensions (Part A/B) ---
    const profileRes = await auth(request(server).post('/ifc/profiles'))
      .send({
        name: 'ONX institutional flourishing',
        intentReferenceId: 'fic-intent-1',
        objectiveReference: 'usfip-objective-1',
      })
      .expect(201);
    const profileId = profileRes.body.id;
    expect(profileId).toBeDefined();
    expect(profileRes.body.status).toBe('ACTIVE');

    // --- Profile detail exposes the seeded dimensions (Part B) ---
    const detailRes = await auth(request(server).get(`/ifc/profiles/${profileId}`)).expect(200);
    expect(detailRes.body.dimensions.length).toBe(8);

    // --- Record indicators against dimensions (Part B) ---
    await auth(request(server).post(`/ifc/profiles/${profileId}/indicators`))
      .send({ kind: 'KNOWLEDGE', name: 'Object coverage', value: 0.9, weight: 1, confidence: 0.9 })
      .expect(201);
    await auth(request(server).post(`/ifc/profiles/${profileId}/indicators`))
      .send({
        kind: 'FOUNDER_ALIGNMENT',
        name: 'Intent adherence',
        value: 0.9,
        weight: 1,
        confidence: 0.9,
      })
      .expect(201);

    // --- Calculate the flourishing index (Part C) ---
    const scoreRes = await auth(request(server).post(`/ifc/profiles/${profileId}/score`))
      .send({})
      .expect(201);
    expect(scoreRes.body.result.flourishingIndex).toBeGreaterThan(0);
    expect(['LOW', 'MODERATE', 'ELEVATED', 'CRITICAL']).toContain(scoreRes.body.result.risk);
    expect(scoreRes.body.result.dimensionScores.length).toBe(8);

    // --- Score history (Part C) ---
    const scoresRes = await auth(request(server).get(`/ifc/profiles/${profileId}/scores`)).expect(
      200,
    );
    expect(scoresRes.body.length).toBeGreaterThanOrEqual(1);

    // --- Capitalization signal — connects to D13 by value only (Part D) ---
    const capRes = await auth(request(server).post(`/ifc/profiles/${profileId}/capitalization`))
      .send({ capitalReference: 'd13-capital-1' })
      .expect(201);
    expect(['CONTRIBUTION', 'PRESERVATION', 'GROWTH', 'DECAY', 'ALLOCATION']).toContain(
      capRes.body.signal.kind,
    );

    // --- Founder alignment check (Part E) ---
    const alignRes = await auth(request(server).post(`/ifc/profiles/${profileId}/alignment`))
      .send({})
      .expect(201);
    expect(alignRes.body.alignment.founderAuthorityValid).toBe(true);

    // --- Governance policy + validation (Part F) ---
    await auth(request(server).post('/ifc/policies'))
      .send({ name: 'Flourishing floor', minIndex: 0.3, minConfidence: 0.2 })
      .expect(201);
    const validateRes = await auth(
      request(server).get(`/ifc/profiles/${profileId}/validate`),
    ).expect(200);
    expect(validateRes.body.validation).toHaveProperty('valid');

    // --- Immutable flourishing history (Part F) ---
    const historyRes = await auth(request(server).get(`/ifc/profiles/${profileId}/history`)).expect(
      200,
    );
    expect(historyRes.body.some((e: any) => e.eventType === 'SCORE_CALCULATED')).toBe(true);
    expect(historyRes.body.some((e: any) => e.eventType === 'CAPITALIZATION_SIGNAL')).toBe(true);

    // --- Founder override (Part F) — immutable, locks the profile ---
    const overrideRes = await auth(request(server).post(`/ifc/profiles/${profileId}/override`))
      .send({ directive: 'Freeze flourishing profile under founder review' })
      .expect(201);
    expect(overrideRes.body.overridden).toBe(true);
    expect(overrideRes.body.status).toBe('OVERRIDDEN');
    // Re-scoring is refused under an override
    await auth(request(server).post(`/ifc/profiles/${profileId}/score`))
      .send({})
      .expect(400);

    // --- Dashboard + reused runtimes (compatibility) ---
    const dashRes = await auth(request(server).get('/ifc/dashboard')).expect(200);
    expect(dashRes.body.profiles.overridden).toBeGreaterThanOrEqual(1);
    expect(dashRes.body.dimensions.supportedKinds.length).toBe(8);
    expect(dashRes.body.reusedRuntimes).toContain('D13');
    expect(dashRes.body.reusedRuntimes).toContain('USFIP');

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw15-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/ifc/profiles/${profileId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // --- Audit trail ---
    const ifcAudit = await listAudit('IFC_');
    expect(ifcAudit.some((item) => item.action === 'IFC_CREATE_PROFILE')).toBe(true);
    expect(ifcAudit.some((item) => item.action === 'IFC_CALCULATE_SCORE')).toBe(true);
    expect(ifcAudit.some((item) => item.action === 'IFC_OVERRIDE')).toBe(true);
    ifcAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/ifc/profiles']).toBeDefined();
    expect(openApi.body.paths['/ifc/dashboard']).toBeDefined();
    expect(openApi.body.paths['/ifc/profiles/{profileId}/score']).toBeDefined();
    expect(openApi.body.paths['/ifc/profiles/{profileId}/indicators']).toBeDefined();
    expect(openApi.body.paths['/ifc/profiles/{profileId}/capitalization']).toBeDefined();
    expect(openApi.body.paths['/ifc/profiles/{profileId}/alignment']).toBeDefined();
    expect(openApi.body.paths['/ifc/profiles/{profileId}/override']).toBeDefined();

    await request(server).get('/ifc/dashboard').expect(401);
  });

  it('IW-16: FIAR frontier intelligence asset registry — registration, classification, ownership, relationships, lineage, lifecycle, governance, override, history, isolation, audit, OpenAPI', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/fiar/dashboard').expect(401);
      return;
    }

    const server = app.getHttpServer();
    const auth = (req: request.Test) => req.set('Authorization', `Bearer ${authToken}`);

    // --- Register a strategic intelligence asset (Part A/C) ---
    const assetRes = await auth(request(server).post('/fiar/assets'))
      .send({
        name: 'Institutional flourishing profile',
        assetClass: 'KNOWLEDGE',
        referenceId: 'ifc-profile-1',
        referenceType: 'IFCProfile',
      })
      .expect(201);
    const assetId = assetRes.body.id;
    expect(assetId).toBeDefined();
    expect(assetRes.body.status).toBe('DRAFT');
    expect(assetRes.body.sourceRuntime).toBe('D16');

    // --- Asset detail exposes active classification + ownership (Part C) ---
    const detailRes = await auth(request(server).get(`/fiar/assets/${assetId}`)).expect(200);
    expect(detailRes.body.classification.assetClass).toBe('KNOWLEDGE');
    expect(detailRes.body.ownership).toBeDefined();

    // --- Reclassify the asset (Part B/C) ---
    const classifyRes = await auth(request(server).post(`/fiar/assets/${assetId}/classify`))
      .send({ assetClass: 'CAPITAL', rationale: 'Recognized as capital asset' })
      .expect(201);
    expect(classifyRes.body.assetClass).toBe('CAPITAL');

    // --- Assign ownership (Part C) ---
    await auth(request(server).post(`/fiar/assets/${assetId}/ownership`))
      .send({ ownerId: 'founder-1', ownershipKind: 'INSTITUTIONAL' })
      .expect(201);

    // --- Register a second asset and relate them (Part C dependency graph) ---
    const asset2Res = await auth(request(server).post('/fiar/assets'))
      .send({ name: 'Measurement profile', assetClass: 'MEASUREMENT' })
      .expect(201);
    const asset2Id = asset2Res.body.id;
    await auth(request(server).post(`/fiar/assets/${assetId}/relationships`))
      .send({ targetAssetId: asset2Id, kind: 'DEPENDS_ON' })
      .expect(201);

    // --- Dependency graph + lineage (Part C) ---
    const graphRes = await auth(
      request(server).get(`/fiar/assets/${assetId}/relationships`),
    ).expect(200);
    expect(graphRes.body.nodes).toContain(asset2Id);

    const lineageRes = await auth(request(server).get(`/fiar/assets/${assetId}/lineage`)).expect(
      200,
    );
    expect(lineageRes.body).toHaveProperty('ancestors');

    // --- Lifecycle: activate then deprecate (Part D) ---
    const activateRes = await auth(request(server).post(`/fiar/assets/${assetId}/lifecycle`))
      .send({ transition: 'ACTIVATE' })
      .expect(201);
    expect(activateRes.body.status).toBe('ACTIVE');
    await auth(request(server).post(`/fiar/assets/${assetId}/lifecycle`))
      .send({ transition: 'DEPRECATE' })
      .expect(201);

    // --- Category + governance policy + validation (Part B/F) ---
    await auth(request(server).post('/fiar/categories'))
      .send({ name: 'Capital assets', code: `cap-${Date.now()}` })
      .expect(201);
    await auth(request(server).post('/fiar/policies'))
      .send({ name: 'Asset floor', requireOwnership: true, requireReference: false })
      .expect(201);
    const validateRes = await auth(request(server).get(`/fiar/assets/${assetId}/validate`)).expect(
      200,
    );
    expect(validateRes.body.validation).toHaveProperty('valid');

    // --- Immutable history (Part F) ---
    const historyRes = await auth(request(server).get(`/fiar/assets/${assetId}/history`)).expect(
      200,
    );
    expect(historyRes.body.some((e: any) => e.eventType === 'ASSET_REGISTERED')).toBe(true);
    expect(historyRes.body.some((e: any) => e.eventType === 'ASSET_RECLASSIFIED')).toBe(true);

    // --- Founder override (Part F) — immutable, locks the asset ---
    const overrideRes = await auth(request(server).post(`/fiar/assets/${assetId}/override`))
      .send({ directive: 'Freeze asset pending constitutional review' })
      .expect(201);
    expect(overrideRes.body.overridden).toBe(true);
    expect(overrideRes.body.status).toBe('OVERRIDDEN');
    // Lifecycle transitions are refused under an override
    await auth(request(server).post(`/fiar/assets/${assetId}/lifecycle`))
      .send({ transition: 'ARCHIVE' })
      .expect(400);

    // --- Dashboard + reused runtimes (compatibility) ---
    const dashRes = await auth(request(server).get('/fiar/dashboard')).expect(200);
    expect(dashRes.body.assets.overridden).toBeGreaterThanOrEqual(1);
    expect(dashRes.body.supportedClasses.length).toBe(17);
    expect(dashRes.body.reusedRuntimes).toContain('D16');
    expect(dashRes.body.reusedRuntimes).toContain('IFC');

    // --- Workspace isolation ---
    const peerToken = await registerAndLogin(`e2e-iw16-peer-${Date.now()}@onx.test`);
    await request(server)
      .get(`/fiar/assets/${assetId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(404);

    // --- Audit trail ---
    const fiarAudit = await listAudit('FIAR_');
    expect(fiarAudit.some((item) => item.action === 'FIAR_REGISTER_ASSET')).toBe(true);
    expect(fiarAudit.some((item) => item.action === 'FIAR_CLASSIFY_ASSET')).toBe(true);
    expect(fiarAudit.some((item) => item.action === 'FIAR_OVERRIDE')).toBe(true);
    fiarAudit.slice(0, 3).forEach(expectUnifiedAuditShape);

    // --- OpenAPI exposure ---
    const openApi = await request(server).get('/api/docs-json').expect(200);
    expect(openApi.body.paths['/fiar/assets']).toBeDefined();
    expect(openApi.body.paths['/fiar/dashboard']).toBeDefined();
    expect(openApi.body.paths['/fiar/assets/{assetId}/classify']).toBeDefined();
    expect(openApi.body.paths['/fiar/assets/{assetId}/relationships']).toBeDefined();
    expect(openApi.body.paths['/fiar/assets/{assetId}/lineage']).toBeDefined();
    expect(openApi.body.paths['/fiar/assets/{assetId}/lifecycle']).toBeDefined();
    expect(openApi.body.paths['/fiar/assets/{assetId}/override']).toBeDefined();

    await request(server).get('/fiar/dashboard').expect(401);
  });

  it('reporting depth supports summaries, details, filtering, sorting, date range, and audit compatibility', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/reports').expect(401);
      return;
    }

    const reportsSummary = await request(app.getHttpServer())
      .get('/reports?includeDetails=false&module=all')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(reportsSummary.body).toEqual(
      expect.objectContaining({
        snapshot: expect.any(Object),
        statistics: expect.any(Object),
        counts: expect.any(Object),
        healthSummary: expect.any(Object),
        auditSummary: expect.any(Object),
        memorySummary: expect.any(Object),
        crudActivitySummary: expect.any(Object),
        providerSummary: expect.any(Object),
        workspaceSummary: expect.any(Object),
        errorSummary: expect.any(Object),
        validationSummary: expect.any(Object),
      }),
    );

    const reportsDetails = await request(app.getHttpServer())
      .get(
        '/reports?includeDetails=true&module=memory&page=1&pageSize=5&sortBy=createdAt&sortOrder=desc',
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(reportsDetails.body.details).toBeDefined();
    expect(reportsDetails.body.details.memory).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        page: 1,
        pageSize: 5,
        items: expect.any(Array),
      }),
    );

    const today = new Date().toISOString().slice(0, 10);
    await request(app.getHttpServer())
      .get(
        `/reports?from=${today}&to=${today}&includeDetails=true&module=evidence&page=1&pageSize=5`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/reports?from=2026-12-31&to=2026-01-01')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    const governanceReport = await request(app.getHttpServer())
      .get('/reports/governance?page=1&pageSize=5&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(governanceReport.body)).toBe(true);

    const capitalReport = await request(app.getHttpServer())
      .get('/reports/capital?page=1&pageSize=5&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(capitalReport.body)).toBe(true);

    const monitoring = await request(app.getHttpServer())
      .get('/monitoring?status=SUCCESS&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(monitoring.body).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        metrics: expect.any(Object),
        healthSummary: expect.any(Object),
        recentAudit: expect.any(Array),
      }),
    );

    const monitoringAudit = await request(app.getHttpServer())
      .get('/monitoring/audit?page=1&pageSize=10&search=MEMORY_&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(monitoringAudit.body)).toBe(true);

    if (monitoringAudit.body.length > 0) {
      const auditItem = monitoringAudit.body[0];
      await request(app.getHttpServer())
        .get(`/monitoring/audit/${auditItem.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    }

    await request(app.getHttpServer()).get('/reports').expect(401);
    await request(app.getHttpServer()).get('/monitoring').expect(401);
  });

  it('workspace domain completeness covers CRUD, restore, ownership, pagination/filter/sort, validation, and compatibility', async () => {
    if (!hasDatabase || !hasSchema) {
      await request(app.getHttpServer()).get('/projects').expect(401);
      return;
    }

    await request(app.getHttpServer())
      .get('/projects?sortOrder=sideways')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/agents?page=0')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    const projectName = `Workspace Project ${Date.now()}`;
    const projectCreate = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: projectName, description: 'workspace completeness project' })
      .expect(201);
    createdProjectId = projectCreate.body.id;

    await request(app.getHttpServer())
      .get(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `/projects?search=${encodeURIComponent('Workspace Project')}&page=1&pageSize=5&sortBy=createdAt&sortOrder=desc`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ description: 'updated completeness project' })
      .expect(200);

    const peerToken = await registerAndLogin(`e2e-workspace-peer-${Date.now()}@onx.test`);
    await request(app.getHttpServer())
      .put(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .send({ description: 'unauthorized update' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/projects/${createdProjectId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const agentCreate = await request(app.getHttpServer())
      .post('/agents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `Workspace Agent ${Date.now()}`,
        description: 'workspace completeness agent',
      })
      .expect(201);
    createdAgentId = agentCreate.body.id;

    await request(app.getHttpServer())
      .delete(`/agents/${createdAgentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/agents/${createdAgentId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    const sourceCreate = await request(app.getHttpServer())
      .post('/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        action: 'WORKSPACE_COMPLETENESS',
        resource: 'PROJECT',
      })
      .expect(201);
    createdSourceId = sourceCreate.body.id;

    await request(app.getHttpServer())
      .get(`/sources/${createdSourceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/sources/${createdSourceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ action: 'WORKSPACE_COMPLETENESS_UPDATED' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/sources/${createdSourceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/sources/${createdSourceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/sources/${createdSourceId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/sources/${createdSourceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const workspaceMemory = await request(app.getHttpServer())
      .post('/memory')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: `Workspace Memory ${Date.now()}`,
        content: 'workspace memory integration record',
        classification: 'INSTITUTIONAL',
        accessScope: 'WORKSPACE',
      })
      .expect(201);
    createdMemoryId = workspaceMemory.body.id;

    await request(app.getHttpServer())
      .get(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${peerToken}`)
      .send({ title: 'peer mutation should fail' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/memory/${createdMemoryId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/memory/${createdMemoryId}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/monitoring')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const reportsRes = await request(app.getHttpServer())
      .get(
        '/reports?includeDetails=true&module=workspace&page=1&pageSize=5&sortBy=createdAt&sortOrder=desc',
      )
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(reportsRes.body.workspaceSummary).toBeDefined();
    expect(reportsRes.body.details.workspace).toBeDefined();

    const workspaceAudit = await request(app.getHttpServer())
      .get('/monitoring/audit?search=RESTORED&sortBy=createdAt&sortOrder=desc&page=1&pageSize=20')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(Array.isArray(workspaceAudit.body)).toBe(true);
    expect(
      workspaceAudit.body.some((item: any) =>
        ['PROJECT_RESTORED', 'AGENT_RESTORED', 'SOURCE_RESTORED', 'MEMORY_RESTORED'].includes(
          item.action,
        ),
      ),
    ).toBe(true);

    await request(app.getHttpServer()).get('/projects').expect(401);
  });
});

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

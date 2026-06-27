import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
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

  it('/health returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
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
    const sovereigntyAudit = await listAudit('SOVEREIGNTY_EVALUATED');
    const revokeAudit = await listAudit('AUTH_REVOKED');

    expect(providerAudit.length).toBeGreaterThan(0);
    expect(toolAudit.length).toBeGreaterThan(0);
    expect(projectAudit.length).toBeGreaterThan(0);
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

  it('/w/ route is available (no server error)', async () => {
    const res = await request(app.getHttpServer()).get('/w/');
    expect(res.status).toBeLessThan(500);
  });
});

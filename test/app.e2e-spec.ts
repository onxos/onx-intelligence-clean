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
  let createdAgentId: string;
  let createdSourceId: string;
  let createdMemoryId: string;
  let createdCapitalAllocationId: string;
  let rejectedCapitalAllocationId: string;
  let createdCapitalPolicyId: string;
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

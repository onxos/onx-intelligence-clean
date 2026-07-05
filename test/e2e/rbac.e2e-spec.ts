import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let viewerToken: string;
  let workspaceId: string;
  const hasDatabase = Boolean(process.env.DATABASE_URL);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }));
    await app.init();

    if (!hasDatabase) return;

    // Admin: registers and becomes FOUNDER of a brand-new workspace
    const adminEmail = `rbac-admin-e2e-${Date.now()}@onx.test`;
    const adminPassword = 'StrongPass123!';
    const adminRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: adminEmail, password: adminPassword, name: 'RBAC Admin E2E' });
    adminToken = adminRegisterRes.body?.accessToken;

    const payload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString());
    workspaceId = payload.workspaceId;

    // Viewer: registers into the SAME workspace explicitly — defaults to VIEWER role
    const viewerEmail = `rbac-viewer-e2e-${Date.now()}@onx.test`;
    const viewerPassword = 'StrongPass123!';
    const viewerRegisterRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: viewerEmail, password: viewerPassword, name: 'RBAC Viewer E2E', workspaceId });
    viewerToken = viewerRegisterRes.body?.accessToken;
  });

  afterAll(async () => { if (app) await app.close(); });

  it('admin (FOUNDER) should create patient', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'AdminPatient', species: 'Dog', ownerName: 'Owner', workspaceId })
      .expect(201);
  });

  it('viewer should NOT create patient (403)', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'ViewerPatient', species: 'Dog', ownerName: 'Owner', workspaceId })
      .expect(403);
  });

  it('viewer should read patients (200)', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .get(`/patients?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
  });

  it('unauthenticated should not access (401)', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .get(`/patients?workspaceId=${workspaceId}`)
      .expect(401);
  });
});

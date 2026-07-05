import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('PatientController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let workspaceId: string;
  const hasDatabase = Boolean(process.env.DATABASE_URL);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    await app.init();

    if (!hasDatabase) return;

    // Register a fresh unique user (becomes FOUNDER of a new workspace) and log in
    const email = `patient-e2e-${Date.now()}@onx.test`;
    const password = 'StrongPass123!';
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'Patient E2E User' });

    if (registerRes.status === 201 && registerRes.body?.accessToken) {
      authToken = registerRes.body.accessToken;
    } else {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      authToken = loginRes.body?.accessToken;
    }

    // Decode workspaceId from the JWT payload (no verification needed for a test-only read)
    if (authToken) {
      const payload = JSON.parse(Buffer.from(authToken.split('.')[1], 'base64').toString());
      workspaceId = payload.workspaceId;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /patients — should create patient', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Buddy', species: 'Dog', breed: 'Labrador', age: 3, gender: 'MALE', ownerName: 'John Doe', workspaceId })
      .expect(201)
      .expect((res) => { expect(res.body).toHaveProperty('id'); expect(res.body.name).toBe('Buddy'); });
  });

  it('GET /patients — should return patients for workspace', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .get(`/patients?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect((res) => { expect(Array.isArray(res.body)).toBe(true); });
  });

  it('GET /patients/search — should search patients', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .get(`/patients/search?workspaceId=${workspaceId}&q=Buddy`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  it('GET /patients/:id — should return patient', async () => {
    if (!hasDatabase) return;
    const createRes = await request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test', species: 'Cat', ownerName: 'Jane', workspaceId });
    return request(app.getHttpServer())
      .get(`/patients/${createRes.body.id}?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect((res) => { expect(res.body.name).toBe('Test'); });
  });

  it('PUT /patients/:id — should update patient', async () => {
    if (!hasDatabase) return;
    const createRes = await request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'UpdateMe', species: 'Dog', ownerName: 'Owner', workspaceId });
    return request(app.getHttpServer())
      .put(`/patients/${createRes.body.id}?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Updated', age: 5 })
      .expect(200)
      .expect((res) => { expect(res.body.name).toBe('Updated'); });
  });

  it('DELETE /patients/:id — should delete patient', async () => {
    if (!hasDatabase) return;
    const createRes = await request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'DeleteMe', species: 'Dog', ownerName: 'Owner', workspaceId });
    return request(app.getHttpServer())
      .delete(`/patients/${createRes.body.id}?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });
});

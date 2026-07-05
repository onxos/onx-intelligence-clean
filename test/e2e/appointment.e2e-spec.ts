import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('AppointmentController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let workspaceId: string;
  let patientId: string;
  const hasDatabase = Boolean(process.env.DATABASE_URL);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }));
    await app.init();

    if (!hasDatabase) return;

    const email = `appointment-e2e-${Date.now()}@onx.test`;
    const password = 'StrongPass123!';
    const registerRes = await request(app.getHttpServer()).post('/auth/register').send({ email, password, name: 'Appointment E2E User' });
    authToken = registerRes.body?.accessToken;
    if (!authToken) {
      const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
      authToken = loginRes.body?.accessToken;
    }
    if (authToken) {
      const payload = JSON.parse(Buffer.from(authToken.split('.')[1], 'base64').toString());
      workspaceId = payload.workspaceId;
    }

    const patientRes = await request(app.getHttpServer())
      .post(`/patients?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'ApptPatient', species: 'Dog', ownerName: 'Owner', workspaceId });
    patientId = patientRes.body?.id;
  });

  afterAll(async () => { if (app) await app.close(); });

  it('POST /appointments — should create appointment', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .post(`/appointments?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`)
      .send({ patientId, title: 'Checkup', date: new Date('2026-08-01T10:00:00Z'), duration: 30, type: 'CHECKUP', workspaceId })
      .expect(201).expect((res) => { expect(res.body).toHaveProperty('id'); });
  });

  it('GET /appointments — should list appointments', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer()).get(`/appointments?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`).expect(200).expect((res) => { expect(Array.isArray(res.body)).toBe(true); });
  });

  it('GET /appointments/status/:status — should filter by status', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer()).get(`/appointments/status/SCHEDULED?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`).expect(200);
  });

  it('GET /appointments/range — should filter by date range', async () => {
    if (!hasDatabase) return;
    return request(app.getHttpServer())
      .get(`/appointments/range?workspaceId=${workspaceId}&start=2026-07-01&end=2026-12-31`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  it('PUT /appointments/:id — should update appointment', async () => {
    if (!hasDatabase) return;
    const createRes = await request(app.getHttpServer()).post(`/appointments?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`).send({ patientId, title: 'UpdateMe', date: new Date('2026-08-02T11:00:00Z'), duration: 30, type: 'CHECKUP', workspaceId });
    return request(app.getHttpServer()).put(`/appointments/${createRes.body.id}?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`).send({ title: 'Updated', duration: 45 }).expect(200).expect((res) => { expect(res.body.duration).toBe(45); });
  });

  it('DELETE /appointments/:id — should delete appointment', async () => {
    if (!hasDatabase) return;
    const createRes = await request(app.getHttpServer()).post(`/appointments?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`).send({ patientId, title: 'DeleteMe', date: new Date('2026-08-03T12:00:00Z'), duration: 30, type: 'CHECKUP', workspaceId });
    return request(app.getHttpServer()).delete(`/appointments/${createRes.body.id}?workspaceId=${workspaceId}`).set('Authorization', `Bearer ${authToken}`).expect(200);
  });
});

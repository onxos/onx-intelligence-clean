import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { PatientLifecycleService } from './patient-lifecycle.service';

describe('PatientLifecycleService', () => {
  const patient = {
    id: 'cp-1',
    patientId: 'patient-1',
    name: 'Max',
    species: 'dog',
    breed: 'labrador',
    ageYears: 5,
    weightKg: 32,
    status: 'stable',
    presentingSigns: ['cough'],
    workspaceId: 'ws-1',
    ownerId: 'user-1',
    deletedAt: null,
  } as const;

  let service: PatientLifecycleService;
  let prisma: jest.Mocked<PrismaService>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(() => {
    const tx = {
      clinicalPatient: {
        create: jest.fn().mockResolvedValue(patient),
        findFirst: jest.fn().mockResolvedValue(patient),
        update: jest.fn().mockResolvedValue({ ...patient, status: 'monitoring' }),
        findMany: jest.fn().mockResolvedValue([patient]),
        count: jest.fn().mockResolvedValue(1),
      },
      clinicalLifecycleEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      clinicalPatient: tx.clinicalPatient as never,
      clinicalLifecycleEvent: tx.clinicalLifecycleEvent as never,
    } as unknown as jest.Mocked<PrismaService>;

    audit = {
      log: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<AuditService>;

    service = new PatientLifecycleService(prisma, audit);
  });

  it('creates a patient and records the registration event', async () => {
    const result = await service.createPatient(
      'ws-1',
      'user-1',
      {
        name: 'Max',
        species: 'dog',
        breed: 'labrador',
        ageYears: 5,
        weightKg: 32,
        presentingSigns: ['cough'],
      },
    );

    expect(result.patientId).toBe('patient-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_PATIENT_CREATED',
        resourceId: 'patient-1',
      }),
    );
  });

  it('updates patient status and appends a lifecycle event', async () => {
    const result = await service.updateStatus('ws-1', 'user-1', 'patient-1', {
      status: 'monitoring',
      note: 'Needs follow-up',
    });

    expect(result.status).toBe('monitoring');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICAL_PATIENT_STATUS_CHANGED',
        resourceId: 'patient-1',
      }),
    );
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { MedicalRecordService } from './medical-record.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('MedicalRecordService', () => {
  let service: MedicalRecordService;
  let prisma: any;

  const mockRecord = {
    id: 'mr_1',
    patientId: 'pat_1',
    appointmentId: 'apt_1',
    visitType: 'ROUTINE',
    chiefComplaint: 'Limping on left hind leg',
    symptoms: ['lameness', 'swelling'],
    diagnosis: 'Sprained hock',
    differentialDx: 'Fracture, arthritis',
    treatmentPlan: 'Rest, anti-inflammatories for 5 days',
    notes: 'Recheck in 1 week',
    veterinarianId: 'vet_1',
    followUpDate: new Date('2026-07-11'),
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'pat_1', name: 'Buddy', species: 'Dog' },
  };

  beforeEach(async () => {
    prisma = {
      medicalRecord: {
        create: jest.fn().mockResolvedValue(mockRecord),
        findMany: jest.fn().mockResolvedValue([mockRecord]),
        findFirst: jest.fn().mockResolvedValue(mockRecord),
        update: jest.fn().mockResolvedValue(mockRecord),
        delete: jest.fn().mockResolvedValue(mockRecord),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalRecordService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MedicalRecordService>(MedicalRecordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a medical record', async () => {
      const result = await service.create({
        chiefComplaint: 'Limping',
        patient: { connect: { id: 'pat_1' } },
        veterinarianId: 'vet_1',
        workspaceId: 'ws_1',
      } as any);
      expect(result).toEqual(mockRecord);
    });
  });

  describe('findAll', () => {
    it('should return all records for workspace', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockRecord]);
    });
  });

  describe('findOne', () => {
    it('should return a record', async () => {
      const result = await service.findOne('mr_1', 'ws_1');
      expect(result).toEqual(mockRecord);
    });

    it('should throw NotFoundException', async () => {
      prisma.medicalRecord.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('mr_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPatient', () => {
    it('should return records for patient', async () => {
      const result = await service.findByPatient('pat_1', 'ws_1');
      expect(result).toEqual([mockRecord]);
    });
  });

  describe('findByVeterinarian', () => {
    it('should return records for veterinarian', async () => {
      const result = await service.findByVeterinarian('vet_1', 'ws_1');
      expect(result).toEqual([mockRecord]);
    });
  });

  describe('findByDateRange', () => {
    it('should filter by date range', async () => {
      const start = new Date('2026-07-01');
      const end = new Date('2026-07-31');
      const result = await service.findByDateRange('ws_1', start, end);
      expect(result).toEqual([mockRecord]);
    });
  });

  describe('update', () => {
    it('should update a record', async () => {
      const result = await service.update('mr_1', 'ws_1', { diagnosis: 'Updated' });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('remove', () => {
    it('should delete a record', async () => {
      const result = await service.remove('mr_1', 'ws_1');
      expect(result).toEqual(mockRecord);
    });
  });
});

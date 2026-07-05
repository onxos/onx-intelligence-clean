import { Test, TestingModule } from '@nestjs/testing';
import { VaccinationService } from './vaccination.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('VaccinationService', () => {
  let service: VaccinationService;
  let prisma: any;

  const mockVax = {
    id: 'vax_1',
    patientId: 'pat_1',
    vaccineName: 'Rabies',
    manufacturer: 'Zoetis',
    batchNumber: 'BATCH-001',
    administeredAt: new Date('2026-01-15'),
    nextDueDate: new Date('2027-01-15'),
    administeredBy: 'Dr. Smith',
    notes: 'Annual rabies vaccine',
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'pat_1', name: 'Buddy', species: 'Dog' },
  };

  beforeEach(async () => {
    prisma = {
      vaccinationRecord: {
        create: jest.fn().mockResolvedValue(mockVax),
        findMany: jest.fn().mockResolvedValue([mockVax]),
        findFirst: jest.fn().mockResolvedValue(mockVax),
        update: jest.fn().mockResolvedValue(mockVax),
        delete: jest.fn().mockResolvedValue(mockVax),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccinationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<VaccinationService>(VaccinationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a vaccination record', async () => {
      const result = await service.create({
        vaccineName: 'Rabies',
        administeredAt: new Date(),
        nextDueDate: new Date(),
        administeredBy: 'Dr. Smith',
        patient: { connect: { id: 'pat_1' } },
        workspaceId: 'ws_1',
      } as any);
      expect(result).toEqual(mockVax);
    });
  });

  describe('findAll', () => {
    it('should return all records', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockVax]);
    });
  });

  describe('findOne', () => {
    it('should return a record', async () => {
      const result = await service.findOne('vax_1', 'ws_1');
      expect(result).toEqual(mockVax);
    });

    it('should throw NotFoundException', async () => {
      prisma.vaccinationRecord.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('vax_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPatient', () => {
    it('should return records for patient', async () => {
      const result = await service.findByPatient('pat_1', 'ws_1');
      expect(result).toEqual([mockVax]);
    });
  });

  describe('findOverdue', () => {
    it('should return overdue vaccinations', async () => {
      const result = await service.findOverdue('ws_1', new Date());
      expect(result).toEqual([mockVax]);
    });
  });

  describe('findUpcoming', () => {
    it('should return upcoming vaccinations', async () => {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 30);
      const result = await service.findUpcoming('ws_1', start, end);
      expect(result).toEqual([mockVax]);
    });
  });

  describe('update', () => {
    it('should update a record', async () => {
      const result = await service.update('vax_1', 'ws_1', { notes: 'Updated' });
      expect(result).toEqual(mockVax);
    });
  });

  describe('remove', () => {
    it('should delete a record', async () => {
      const result = await service.remove('vax_1', 'ws_1');
      expect(result).toEqual(mockVax);
    });
  });
});

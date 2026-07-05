import { Test, TestingModule } from '@nestjs/testing';
import { PatientService } from './patient.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('PatientService', () => {
  let service: PatientService;
  let prisma: any;

  const mockPatient = {
    id: 'pat_1',
    name: 'Buddy',
    species: 'Dog',
    breed: 'Labrador',
    age: 3,
    weight: 25.5,
    gender: 'MALE',
    ownerName: 'John Doe',
    ownerPhone: '555-0101',
    ownerEmail: 'john@test.com',
    medicalNotes: 'Healthy',
    allergies: [],
    status: 'ACTIVE',
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      patient: {
        create: jest.fn().mockResolvedValue(mockPatient),
        findMany: jest.fn().mockResolvedValue([mockPatient]),
        findFirst: jest.fn().mockResolvedValue(mockPatient),
        update: jest.fn().mockResolvedValue(mockPatient),
        delete: jest.fn().mockResolvedValue(mockPatient),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PatientService>(PatientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a patient', async () => {
      const result = await service.create({ name: 'Buddy', species: 'Dog', ownerName: 'John', workspaceId: 'ws_1' } as any);
      expect(result).toEqual(mockPatient);
      expect(prisma.patient.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all patients for workspace', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockPatient]);
      expect(prisma.patient.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws_1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a patient', async () => {
      const result = await service.findOne('pat_1', 'ws_1');
      expect(result).toEqual(mockPatient);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.patient.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('pat_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a patient', async () => {
      const result = await service.update('pat_1', 'ws_1', { name: 'Buddy2' });
      expect(result).toEqual(mockPatient);
      expect(prisma.patient.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a patient', async () => {
      const result = await service.remove('pat_1', 'ws_1');
      expect(result).toEqual(mockPatient);
      expect(prisma.patient.delete).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should search patients', async () => {
      const result = await service.search('ws_1', 'Buddy');
      expect(result).toEqual([mockPatient]);
      expect(prisma.patient.findMany).toHaveBeenCalled();
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { LabResultService } from './lab-result.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('LabResultService', () => {
  let service: LabResultService;
  let prisma: any;

  const mockLabResult = {
    id: 'lab_1',
    patientId: 'pat_1',
    testName: 'CBC',
    testCategory: 'BLOOD',
    value: '12.5',
    unit: 'g/dL',
    referenceRangeLow: '10',
    referenceRangeHigh: '15',
    status: 'NORMAL',
    notes: 'Normal range',
    testedBy: 'Dr. Smith',
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'pat_1', name: 'Buddy' },
  };

  beforeEach(async () => {
    prisma = {
      labResult: {
        create: jest.fn().mockResolvedValue(mockLabResult),
        findMany: jest.fn().mockResolvedValue([mockLabResult]),
        findFirst: jest.fn().mockResolvedValue(mockLabResult),
        update: jest.fn().mockResolvedValue(mockLabResult),
        delete: jest.fn().mockResolvedValue(mockLabResult),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabResultService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<LabResultService>(LabResultService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a lab result', async () => {
      const result = await service.create({ testName: 'CBC', value: '12.5', unit: 'g/dL', testedBy: 'Dr. Smith', patient: { connect: { id: 'pat_1' } }, workspaceId: 'ws_1' } as any);
      expect(result).toEqual(mockLabResult);
    });
  });

  describe('findAll', () => {
    it('should return all lab results', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockLabResult]);
    });
  });

  describe('findOne', () => {
    it('should return a lab result', async () => {
      const result = await service.findOne('lab_1', 'ws_1');
      expect(result).toEqual(mockLabResult);
    });

    it('should throw NotFoundException', async () => {
      prisma.labResult.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('lab_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPatient', () => {
    it('should return results for patient', async () => {
      const result = await service.findByPatient('pat_1', 'ws_1');
      expect(result).toEqual([mockLabResult]);
    });
  });

  describe('findByCategory', () => {
    it('should filter by category', async () => {
      const result = await service.findByCategory('ws_1', 'BLOOD');
      expect(result).toEqual([mockLabResult]);
    });
  });

  describe('findByStatus', () => {
    it('should filter by status', async () => {
      const result = await service.findByStatus('ws_1', 'NORMAL');
      expect(result).toEqual([mockLabResult]);
    });
  });

  describe('update', () => {
    it('should update a lab result', async () => {
      const result = await service.update('lab_1', 'ws_1', { value: '13.0' });
      expect(result).toEqual(mockLabResult);
    });
  });

  describe('remove', () => {
    it('should delete a lab result', async () => {
      const result = await service.remove('lab_1', 'ws_1');
      expect(result).toEqual(mockLabResult);
    });
  });
});

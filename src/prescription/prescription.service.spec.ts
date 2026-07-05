import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionService } from './prescription.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('PrescriptionService', () => {
  let service: PrescriptionService;
  let prisma: any;

  const mockPrescription = {
    id: 'rx_1',
    patientId: 'pat_1',
    medication: 'Amoxicillin',
    dosage: '250mg',
    frequency: 'Twice daily',
    duration: '7 days',
    instructions: 'Give with food',
    prescribedBy: 'Dr. Smith',
    status: 'ACTIVE',
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'pat_1', name: 'Buddy' },
  };

  beforeEach(async () => {
    prisma = {
      prescription: {
        create: jest.fn().mockResolvedValue(mockPrescription),
        findMany: jest.fn().mockResolvedValue([mockPrescription]),
        findFirst: jest.fn().mockResolvedValue(mockPrescription),
        update: jest.fn().mockResolvedValue(mockPrescription),
        delete: jest.fn().mockResolvedValue(mockPrescription),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PrescriptionService>(PrescriptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a prescription', async () => {
      const result = await service.create({ medication: 'Amox', dosage: '250mg', patient: { connect: { id: 'pat_1' } }, workspaceId: 'ws_1' } as any);
      expect(result).toEqual(mockPrescription);
    });
  });

  describe('findAll', () => {
    it('should return all prescriptions', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockPrescription]);
    });
  });

  describe('findOne', () => {
    it('should return a prescription', async () => {
      const result = await service.findOne('rx_1', 'ws_1');
      expect(result).toEqual(mockPrescription);
    });

    it('should throw NotFoundException', async () => {
      prisma.prescription.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('rx_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPatient', () => {
    it('should return prescriptions for patient', async () => {
      const result = await service.findByPatient('pat_1', 'ws_1');
      expect(result).toEqual([mockPrescription]);
    });
  });

  describe('update', () => {
    it('should update a prescription', async () => {
      const result = await service.update('rx_1', 'ws_1', { dosage: '500mg' });
      expect(result).toEqual(mockPrescription);
    });
  });

  describe('discontinue', () => {
    it('should set status to DISCONTINUED', async () => {
      const result = await service.discontinue('rx_1', 'ws_1');
      expect(result).toEqual(mockPrescription);
      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx_1' },
        data: { status: 'DISCONTINUED' },
        include: { patient: true },
      });
    });
  });

  describe('remove', () => {
    it('should delete a prescription', async () => {
      const result = await service.remove('rx_1', 'ws_1');
      expect(result).toEqual(mockPrescription);
    });
  });
});

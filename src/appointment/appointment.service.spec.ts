import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from './appointment.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AppointmentService', () => {
  let service: AppointmentService;
  let prisma: any;

  const mockAppointment = {
    id: 'apt_1',
    patientId: 'pat_1',
    title: 'Checkup',
    date: new Date(),
    duration: 30,
    status: 'SCHEDULED',
    type: 'CHECKUP',
    notes: 'Regular checkup',
    veterinarianId: 'vet_1',
    workspaceId: 'ws_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: { id: 'pat_1', name: 'Buddy' },
  };

  beforeEach(async () => {
    prisma = {
      appointment: {
        create: jest.fn().mockResolvedValue(mockAppointment),
        findMany: jest.fn().mockResolvedValue([mockAppointment]),
        findFirst: jest.fn().mockResolvedValue(mockAppointment),
        update: jest.fn().mockResolvedValue(mockAppointment),
        delete: jest.fn().mockResolvedValue(mockAppointment),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an appointment', async () => {
      const result = await service.create({ title: 'Checkup', date: new Date(), patient: { connect: { id: 'pat_1' } }, workspaceId: 'ws_1' } as any);
      expect(result).toEqual(mockAppointment);
    });
  });

  describe('findAll', () => {
    it('should return all appointments', async () => {
      const result = await service.findAll('ws_1');
      expect(result).toEqual([mockAppointment]);
    });
  });

  describe('findOne', () => {
    it('should return an appointment', async () => {
      const result = await service.findOne('apt_1', 'ws_1');
      expect(result).toEqual(mockAppointment);
    });

    it('should throw NotFoundException', async () => {
      prisma.appointment.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.findOne('apt_x', 'ws_1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByStatus', () => {
    it('should filter by status', async () => {
      const result = await service.findByStatus('ws_1', 'SCHEDULED');
      expect(result).toEqual([mockAppointment]);
    });
  });

  describe('findByDateRange', () => {
    it('should filter by date range', async () => {
      const start = new Date('2026-01-01');
      const end = new Date('2026-12-31');
      const result = await service.findByDateRange('ws_1', start, end);
      expect(result).toEqual([mockAppointment]);
    });
  });

  describe('update', () => {
    it('should update an appointment', async () => {
      const result = await service.update('apt_1', 'ws_1', { title: 'Updated' });
      expect(result).toEqual(mockAppointment);
    });
  });

  describe('remove', () => {
    it('should delete an appointment', async () => {
      const result = await service.remove('apt_1', 'ws_1');
      expect(result).toEqual(mockAppointment);
    });
  });
});

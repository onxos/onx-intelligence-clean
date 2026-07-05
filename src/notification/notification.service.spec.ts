import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: any;
  const mock = { id: 'notif_1', userId: 'u1', type: 'APPOINTMENT_REMINDER', title: 'Upcoming', message: 'Test', workspaceId: 'ws_1', createdAt: new Date() };

  beforeEach(async () => {
    prisma = {
      notification: { create: jest.fn().mockResolvedValue(mock), findMany: jest.fn().mockResolvedValue([mock]), findFirst: jest.fn().mockResolvedValue(mock), count: jest.fn().mockResolvedValue(5), update: jest.fn().mockResolvedValue(mock), updateMany: jest.fn().mockResolvedValue({ count: 3 }), delete: jest.fn().mockResolvedValue(mock) },
    };
    const module: TestingModule = await Test.createTestingModule({ providers: [NotificationService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => expect(service).toBeDefined());
  it('should create', async () => { const r = await service.create({ title: 'T', message: 'M', userId: 'u1', workspaceId: 'ws_1' } as any); expect(r).toEqual(mock); });
  it('should findAll', async () => { const r = await service.findAll('ws_1'); expect(r).toEqual([mock]); });
  it('should findByUser', async () => { const r = await service.findByUser('u1', 'ws_1'); expect(r).toEqual([mock]); });
  it('should findUnread', async () => { const r = await service.findUnread('u1', 'ws_1'); expect(r).toEqual([mock]); });
  it('should findUnreadCount', async () => { const r = await service.findUnreadCount('u1', 'ws_1'); expect(r).toBe(5); });
  it('should findByType', async () => { const r = await service.findByType('ws_1', 'APPOINTMENT_REMINDER'); expect(r).toEqual([mock]); });
  it('should markAsRead', async () => { const r = await service.markAsRead('notif_1', 'ws_1'); expect(r).toEqual(mock); });
  it('should markAllAsRead', async () => { const r = await service.markAllAsRead('u1', 'ws_1'); expect(r).toEqual({ count: 3 }); });
  it('should remove', async () => { const r = await service.remove('notif_1', 'ws_1'); expect(r).toEqual(mock); });
  it('should throw NotFoundException', async () => { prisma.notification.findFirst = jest.fn().mockResolvedValue(null); await expect(service.remove('x', 'ws_1')).rejects.toThrow(NotFoundException); });
  it('should createAppointmentReminder', async () => { const r = await service.createAppointmentReminder('apt_1', 'Buddy', new Date(), 'u1', 'ws_1'); expect(r).toEqual(mock); });
  it('should createVaccinationDue', async () => { const r = await service.createVaccinationDue('Buddy', 'Rabies', new Date(), 'u1', 'ws_1'); expect(r).toEqual(mock); });
  it('should createLowStockAlert', async () => { const r = await service.createLowStockAlert('Amox', 5, 10, 'u1', 'ws_1'); expect(r).toEqual(mock); });
  it('should createLabResultReady', async () => { const r = await service.createLabResultReady('Buddy', 'CBC', 'u1', 'ws_1'); expect(r).toEqual(mock); });
});

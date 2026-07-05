import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Notification, Prisma } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.NotificationCreateInput): Promise<Notification> {
    return this.prisma.notification.create({ data });
  }

  async findAll(workspaceId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUser(userId: string, workspaceId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUnread(userId: string, workspaceId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId, workspaceId, readAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUnreadCount(userId: string, workspaceId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, workspaceId, readAt: null },
    });
  }

  async findByType(workspaceId: string, type: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { workspaceId, type: type as any },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string, workspaceId: string): Promise<Notification> {
    const n = await this.prisma.notification.findFirst({ where: { id, workspaceId } });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string, workspaceId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, workspaceId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }

  async remove(id: string, workspaceId: string): Promise<Notification> {
    const n = await this.prisma.notification.findFirst({ where: { id, workspaceId } });
    if (!n) throw new NotFoundException('Notification not found');
    return this.prisma.notification.delete({ where: { id } });
  }

  async createAppointmentReminder(appointmentId: string, patientName: string, date: Date, userId: string, workspaceId: string) {
    return this.create({
      userId, workspaceId, type: 'APPOINTMENT_REMINDER',
      title: 'Upcoming Appointment',
      message: `Appointment for ${patientName} on ${date.toLocaleDateString()}`,
      data: { appointmentId },
    } as any);
  }

  async createVaccinationDue(patientName: string, vaccineName: string, dueDate: Date, userId: string, workspaceId: string) {
    return this.create({
      userId, workspaceId, type: 'VACCINATION_DUE',
      title: 'Vaccination Due',
      message: `${vaccineName} for ${patientName} is due on ${dueDate.toLocaleDateString()}`,
    } as any);
  }

  async createLowStockAlert(productName: string, currentQty: number, reorderLevel: number, userId: string, workspaceId: string) {
    return this.create({
      userId, workspaceId, type: 'LOW_STOCK',
      title: 'Low Stock Alert',
      message: `${productName} is low (${currentQty} remaining, reorder at ${reorderLevel})`,
    } as any);
  }

  async createLabResultReady(patientName: string, testName: string, userId: string, workspaceId: string) {
    return this.create({
      userId, workspaceId, type: 'LAB_RESULT_READY',
      title: 'Lab Result Ready',
      message: `${testName} results for ${patientName} are ready`,
    } as any);
  }
}

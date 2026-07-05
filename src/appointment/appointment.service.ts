import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Appointment, Prisma } from '@prisma/client';

@Injectable()
export class AppointmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AppointmentCreateInput): Promise<Appointment> {
    return this.prisma.appointment.create({ data });
  }

  async findAll(workspaceId: string): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: { workspaceId },
      include: { patient: true },
      orderBy: { date: 'asc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, workspaceId },
      include: { patient: true },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async findByStatus(workspaceId: string, status: string): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: { workspaceId, status: status as any },
      include: { patient: true },
      orderBy: { date: 'asc' },
    });
  }

  async findByDateRange(workspaceId: string, start: Date, end: Date): Promise<Appointment[]> {
    return this.prisma.appointment.findMany({
      where: {
        workspaceId,
        date: { gte: start, lte: end },
      },
      include: { patient: true },
      orderBy: { date: 'asc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.AppointmentUpdateInput): Promise<Appointment> {
    await this.findOne(id, workspaceId);
    return this.prisma.appointment.update({
      where: { id },
      data,
      include: { patient: true },
    });
  }

  async remove(id: string, workspaceId: string): Promise<Appointment> {
    await this.findOne(id, workspaceId);
    return this.prisma.appointment.delete({ where: { id } });
  }
}

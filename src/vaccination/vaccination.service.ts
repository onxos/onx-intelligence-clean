import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { VaccinationRecord, Prisma } from '@prisma/client';

@Injectable()
export class VaccinationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.VaccinationRecordCreateInput): Promise<VaccinationRecord> {
    return this.prisma.vaccinationRecord.create({ data });
  }

  async findAll(workspaceId: string): Promise<VaccinationRecord[]> {
    return this.prisma.vaccinationRecord.findMany({
      where: { workspaceId },
      include: { patient: { select: { id: true, name: true, species: true } } },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<VaccinationRecord> {
    const record = await this.prisma.vaccinationRecord.findFirst({
      where: { id, workspaceId },
      include: { patient: { select: { id: true, name: true, species: true } } },
    });
    if (!record) throw new NotFoundException('Vaccination record not found');
    return record;
  }

  async findByPatient(patientId: string, workspaceId: string): Promise<VaccinationRecord[]> {
    return this.prisma.vaccinationRecord.findMany({
      where: { patientId, workspaceId },
      include: { patient: { select: { id: true, name: true, species: true } } },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async findOverdue(workspaceId: string, asOf: Date): Promise<VaccinationRecord[]> {
    return this.prisma.vaccinationRecord.findMany({
      where: {
        workspaceId,
        nextDueDate: { lt: asOf },
      },
      include: { patient: { select: { id: true, name: true, species: true, ownerName: true, ownerPhone: true } } },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async findUpcoming(workspaceId: string, windowStart: Date, windowEnd: Date): Promise<VaccinationRecord[]> {
    return this.prisma.vaccinationRecord.findMany({
      where: {
        workspaceId,
        nextDueDate: { gte: windowStart, lte: windowEnd },
      },
      include: { patient: { select: { id: true, name: true, species: true, ownerName: true, ownerPhone: true } } },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.VaccinationRecordUpdateInput): Promise<VaccinationRecord> {
    await this.findOne(id, workspaceId);
    return this.prisma.vaccinationRecord.update({
      where: { id },
      data,
      include: { patient: { select: { id: true, name: true, species: true } } },
    });
  }

  async remove(id: string, workspaceId: string): Promise<VaccinationRecord> {
    await this.findOne(id, workspaceId);
    return this.prisma.vaccinationRecord.delete({ where: { id } });
  }
}

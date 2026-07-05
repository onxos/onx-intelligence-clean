import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { MedicalRecord, Prisma } from '@prisma/client';

@Injectable()
export class MedicalRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.MedicalRecordCreateInput): Promise<MedicalRecord> {
    return this.prisma.medicalRecord.create({ data });
  }

  async findAll(workspaceId: string): Promise<MedicalRecord[]> {
    return this.prisma.medicalRecord.findMany({
      where: { workspaceId },
      include: { patient: { select: { id: true, name: true, species: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<MedicalRecord> {
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id, workspaceId },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        documents: true,
      },
    });
    if (!record) throw new NotFoundException('Medical record not found');
    return record;
  }

  async findByPatient(patientId: string, workspaceId: string): Promise<MedicalRecord[]> {
    return this.prisma.medicalRecord.findMany({
      where: { patientId, workspaceId },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        documents: { select: { id: true, title: true, documentType: true, fileUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByVeterinarian(veterinarianId: string, workspaceId: string): Promise<MedicalRecord[]> {
    return this.prisma.medicalRecord.findMany({
      where: { veterinarianId, workspaceId },
      include: { patient: { select: { id: true, name: true, species: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByDateRange(workspaceId: string, start: Date, end: Date): Promise<MedicalRecord[]> {
    return this.prisma.medicalRecord.findMany({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end },
      },
      include: { patient: { select: { id: true, name: true, species: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.MedicalRecordUpdateInput): Promise<MedicalRecord> {
    await this.findOne(id, workspaceId);
    return this.prisma.medicalRecord.update({
      where: { id },
      data,
      include: { patient: { select: { id: true, name: true, species: true } } },
    });
  }

  async remove(id: string, workspaceId: string): Promise<MedicalRecord> {
    await this.findOne(id, workspaceId);
    return this.prisma.medicalRecord.delete({ where: { id } });
  }
}

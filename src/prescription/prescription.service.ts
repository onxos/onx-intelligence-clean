import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prescription, Prisma } from '@prisma/client';

@Injectable()
export class PrescriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PrescriptionCreateInput): Promise<Prescription> {
    return this.prisma.prescription.create({ data });
  }

  async findAll(workspaceId: string): Promise<Prescription[]> {
    return this.prisma.prescription.findMany({
      where: { workspaceId },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<Prescription> {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, workspaceId },
      include: { patient: true },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');
    return prescription;
  }

  async findByPatient(patientId: string, workspaceId: string): Promise<Prescription[]> {
    return this.prisma.prescription.findMany({
      where: { patientId, workspaceId },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.PrescriptionUpdateInput): Promise<Prescription> {
    await this.findOne(id, workspaceId);
    return this.prisma.prescription.update({
      where: { id },
      data,
      include: { patient: true },
    });
  }

  async discontinue(id: string, workspaceId: string): Promise<Prescription> {
    await this.findOne(id, workspaceId);
    return this.prisma.prescription.update({
      where: { id },
      data: { status: 'DISCONTINUED' },
      include: { patient: true },
    });
  }

  async remove(id: string, workspaceId: string): Promise<Prescription> {
    await this.findOne(id, workspaceId);
    return this.prisma.prescription.delete({ where: { id } });
  }
}

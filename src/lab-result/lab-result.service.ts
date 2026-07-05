import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LabResult, Prisma } from '@prisma/client';

@Injectable()
export class LabResultService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.LabResultCreateInput): Promise<LabResult> {
    return this.prisma.labResult.create({ data });
  }

  async findAll(workspaceId: string): Promise<LabResult[]> {
    return this.prisma.labResult.findMany({
      where: { workspaceId },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<LabResult> {
    const labResult = await this.prisma.labResult.findFirst({
      where: { id, workspaceId },
      include: { patient: true },
    });
    if (!labResult) throw new NotFoundException('Lab result not found');
    return labResult;
  }

  async findByPatient(patientId: string, workspaceId: string): Promise<LabResult[]> {
    return this.prisma.labResult.findMany({
      where: { patientId, workspaceId },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCategory(workspaceId: string, category: string): Promise<LabResult[]> {
    return this.prisma.labResult.findMany({
      where: { workspaceId, testCategory: category as any },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByStatus(workspaceId: string, status: string): Promise<LabResult[]> {
    return this.prisma.labResult.findMany({
      where: { workspaceId, status: status as any },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.LabResultUpdateInput): Promise<LabResult> {
    await this.findOne(id, workspaceId);
    return this.prisma.labResult.update({
      where: { id },
      data,
      include: { patient: true },
    });
  }

  async remove(id: string, workspaceId: string): Promise<LabResult> {
    await this.findOne(id, workspaceId);
    return this.prisma.labResult.delete({ where: { id } });
  }
}

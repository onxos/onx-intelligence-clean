import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Patient, Prisma } from '@prisma/client';

@Injectable()
export class PatientService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.PatientCreateInput): Promise<Patient> {
    return this.prisma.patient.create({ data });
  }

  async findAll(workspaceId: string): Promise<Patient[]> {
    return this.prisma.patient.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({
      where: { id, workspaceId },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async update(id: string, workspaceId: string, data: Prisma.PatientUpdateInput): Promise<Patient> {
    await this.findOne(id, workspaceId);
    return this.prisma.patient.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, workspaceId: string): Promise<Patient> {
    await this.findOne(id, workspaceId);
    return this.prisma.patient.delete({ where: { id } });
  }

  async search(workspaceId: string, query: string): Promise<Patient[]> {
    return this.prisma.patient.findMany({
      where: {
        workspaceId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { ownerName: { contains: query, mode: 'insensitive' } },
          { species: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }
}

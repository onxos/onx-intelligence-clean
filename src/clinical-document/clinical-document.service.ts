import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ClinicalDocument, Prisma } from '@prisma/client';

@Injectable()
export class ClinicalDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ClinicalDocumentCreateInput): Promise<ClinicalDocument> {
    return this.prisma.clinicalDocument.create({ data });
  }

  async findAll(workspaceId: string): Promise<ClinicalDocument[]> {
    return this.prisma.clinicalDocument.findMany({
      where: { workspaceId },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        medicalRecord: { select: { id: true, chiefComplaint: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string): Promise<ClinicalDocument> {
    const doc = await this.prisma.clinicalDocument.findFirst({
      where: { id, workspaceId },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        medicalRecord: { select: { id: true, chiefComplaint: true } },
      },
    });
    if (!doc) throw new NotFoundException('Clinical document not found');
    return doc;
  }

  async findByPatient(patientId: string, workspaceId: string): Promise<ClinicalDocument[]> {
    return this.prisma.clinicalDocument.findMany({
      where: { patientId, workspaceId },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        medicalRecord: { select: { id: true, chiefComplaint: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByMedicalRecord(medicalRecordId: string, workspaceId: string): Promise<ClinicalDocument[]> {
    return this.prisma.clinicalDocument.findMany({
      where: { medicalRecordId, workspaceId },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        medicalRecord: { select: { id: true, chiefComplaint: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByType(workspaceId: string, documentType: string): Promise<ClinicalDocument[]> {
    return this.prisma.clinicalDocument.findMany({
      where: { workspaceId, documentType: documentType as any },
      include: {
        patient: { select: { id: true, name: true, species: true } },
        medicalRecord: { select: { id: true, chiefComplaint: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, workspaceId: string, data: Prisma.ClinicalDocumentUpdateInput): Promise<ClinicalDocument> {
    await this.findOne(id, workspaceId);
    return this.prisma.clinicalDocument.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, name: true, species: true } },
        medicalRecord: { select: { id: true, chiefComplaint: true } },
      },
    });
  }

  async remove(id: string, workspaceId: string): Promise<ClinicalDocument> {
    await this.findOne(id, workspaceId);
    return this.prisma.clinicalDocument.delete({ where: { id } });
  }
}

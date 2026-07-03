import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import {
  AddClinicalLifecycleEventDto,
  ClinicalPatientListQueryDto,
  CreateClinicalPatientDto,
  UpdateClinicalPatientStatusDto,
} from './patient-lifecycle.dto';

type AuditContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class PatientLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createPatient(userId: string, dto: CreateClinicalPatientDto, ctx?: AuditContext) {
    const status = dto.status ?? 'stable';
    const created = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.clinicalPatient.create({
        data: {
          name: dto.name.trim(),
          species: dto.species.trim(),
          breed: dto.breed.trim(),
          ageYears: dto.ageYears,
          weightKg: dto.weightKg,
          status,
          presentingSigns: dto.presentingSigns ?? [],
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          workspaceId: dto.workspaceId,
          ownerId: userId,
        },
      });

      await tx.clinicalLifecycleEvent.create({
        data: {
          eventId: randomUUID(),
          patientId: patient.id,
          workspaceId: dto.workspaceId,
          actorId: userId,
          eventType: 'REGISTERED',
          previousStatus: null,
          nextStatus: status,
          note: 'Patient registered',
          metadata: { presentingSigns: dto.presentingSigns ?? [] } as Prisma.InputJsonValue,
        },
      });

      return patient;
    });

    await this.audit.log({
      actorId: userId,
      action: 'CLINICAL_PATIENT_CREATED',
      resourceType: 'clinical_patient',
      resourceId: created.patientId,
      workspaceId: dto.workspaceId,
      metadata: { status },
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return created;
  }

  async listPatients(workspaceId: string, query?: ClinicalPatientListQueryDto) {
    return this.prisma.clinicalPatient.findMany({
      where: {
        workspaceId,
        ...(query?.status ? { status: query.status } : {}),
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getPatient(workspaceId: string, patientId: string) {
    const patient = await this.prisma.clinicalPatient.findFirst({
      where: { workspaceId, patientId, deletedAt: null },
    });

    if (!patient) {
      throw new NotFoundException(`Clinical patient not found: ${patientId}`);
    }

    return patient;
  }

  async updateStatus(
    workspaceId: string,
    userId: string,
    patientId: string,
    dto: UpdateClinicalPatientStatusDto,
    ctx?: AuditContext,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.clinicalPatient.findFirst({
        where: { workspaceId, patientId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundException(`Clinical patient not found: ${patientId}`);
      }

      const patient = await tx.clinicalPatient.update({
        where: { id: existing.id },
        data: { status: dto.status },
      });

      await tx.clinicalLifecycleEvent.create({
        data: {
          eventId: randomUUID(),
          patientId: patient.id,
          workspaceId,
          actorId: userId,
          eventType: 'STATUS_CHANGED',
          previousStatus: existing.status,
          nextStatus: dto.status,
          note: dto.note ?? 'Clinical patient status updated',
          metadata: {} as Prisma.InputJsonValue,
        },
      });

      return patient;
    });

    await this.audit.log({
      actorId: userId,
      action: 'CLINICAL_PATIENT_STATUS_CHANGED',
      resourceType: 'clinical_patient',
      resourceId: updated.patientId,
      workspaceId,
      metadata: { status: dto.status },
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return updated;
  }

  async addEvent(
    workspaceId: string,
    userId: string,
    patientId: string,
    dto: AddClinicalLifecycleEventDto,
    ctx?: AuditContext,
  ) {
    const event = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.clinicalPatient.findFirst({
        where: { workspaceId, patientId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundException(`Clinical patient not found: ${patientId}`);
      }

      if (dto.nextStatus && dto.nextStatus !== existing.status) {
        await tx.clinicalPatient.update({
          where: { id: existing.id },
          data: { status: dto.nextStatus },
        });
      }

      return tx.clinicalLifecycleEvent.create({
        data: {
          eventId: randomUUID(),
          patientId: existing.id,
          workspaceId,
          actorId: userId,
          eventType: dto.eventType.trim(),
          previousStatus: existing.status,
          nextStatus: dto.nextStatus ?? existing.status,
          note: dto.note,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    });

    await this.audit.log({
      actorId: userId,
      action: 'CLINICAL_PATIENT_EVENT_RECORDED',
      resourceType: 'clinical_patient',
      resourceId: patientId,
      workspaceId,
      metadata: { eventType: dto.eventType },
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return event;
  }

  async listEvents(workspaceId: string, patientId: string) {
    const patient = await this.getPatient(workspaceId, patientId);
    return this.prisma.clinicalLifecycleEvent.findMany({
      where: { workspaceId, patientId: patient.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async summary(workspaceId: string) {
    const [patients, stable, monitoring, critical] = await Promise.all([
      this.prisma.clinicalPatient.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.clinicalPatient.count({ where: { workspaceId, deletedAt: null, status: 'stable' } }),
      this.prisma.clinicalPatient.count({
        where: { workspaceId, deletedAt: null, status: 'monitoring' },
      }),
      this.prisma.clinicalPatient.count({ where: { workspaceId, deletedAt: null, status: 'critical' } }),
    ]);

    return {
      patients,
      stable,
      monitoring,
      critical,
      alerts: critical,
    };
  }
}
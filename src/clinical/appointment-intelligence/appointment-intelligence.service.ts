import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WebhookEmitter } from '../../common/webhook.emitter';
import { QueueService } from '../../queue/queue.service';
import { PatientLifecycleService } from '../patient-lifecycle/patient-lifecycle.service';
import { AddToWaitlistDto, BuildScheduleDto } from './appointment-intelligence.dto';

type WaitlistEntry = {
  id: string;
  workspaceId: string;
  patientId: string;
  reason?: string;
  priority: number;
  createdAt: string;
};

@Injectable()
export class AppointmentIntelligenceService {
  private readonly waitlists = new Map<string, WaitlistEntry[]>();

  constructor(
    private readonly patients: PatientLifecycleService,
    @Optional() private readonly webhooks?: WebhookEmitter,
    @Optional() private readonly queue?: QueueService,
  ) {}

  async addToWaitlist(workspaceId: string, dto: AddToWaitlistDto) {
    const bucket = this.waitlists.get(workspaceId) ?? [];
    const entry: WaitlistEntry = {
      id: randomUUID(),
      workspaceId,
      patientId: dto.patientId,
      reason: dto.reason,
      priority: dto.priority ?? 1,
      createdAt: new Date().toISOString(),
    };
    bucket.push(entry);
    bucket.sort((left, right) => right.priority - left.priority || left.createdAt.localeCompare(right.createdAt));
    this.waitlists.set(workspaceId, bucket);
    return { ...entry, position: bucket.findIndex((item) => item.id === entry.id) + 1 };
  }

  async listWaitlist(workspaceId: string) {
    return this.waitlists.get(workspaceId) ?? [];
  }

  async buildSchedule(workspaceId: string, dto: BuildScheduleDto) {
    const patients = await this.patients.listPatients(workspaceId);
    const waitlist = await this.listWaitlist(workspaceId);
    const limit = dto.maxPatients ?? 10;

    const scored = patients
      .map((patient) => ({
        patient,
        priority: (patient.status === 'critical' ? 3 : patient.status === 'monitoring' ? 2 : 1) +
          Math.min(2, patient.presentingSigns.length),
      }))
      .sort((left, right) => right.priority - left.priority || left.patient.createdAt.getTime() - right.patient.createdAt.getTime())
      .slice(0, limit)
      .map((item, index) => ({
        patientId: item.patient.patientId,
        name: item.patient.name,
        status: item.patient.status,
        recommendedWindow: `${String(9 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
        priority: item.priority,
        reason: item.patient.presentingSigns.join(', ') || 'routine follow-up',
      }));

    const payload = {
      workspaceId,
      scheduledCount: scored.length,
      topAppointments: scored.slice(0, 3),
    };
    this.webhooks?.emitCapabilityEvent('appointment', 'appointment.scheduled', payload);
    void this.queue?.addReminder('appointment.schedule', payload);
    void this.queue?.addNotify('whatsapp.reminder', payload);

    return { schedule: scored, waitlist };
  }
}
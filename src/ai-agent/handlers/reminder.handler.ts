/**
 * ONX AI Agent — Reminder Command Handler
 * "Send reminders for tomorrow's appointments" → sends WhatsApp/SMS
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class ReminderCommandHandler {
  private readonly logger = new Logger(ReminderCommandHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    parsed: ParsedCommand,
    userId: string,
    workspaceId: string,
  ): Promise<AgentResult> {
    const { entities } = parsed;
    const reminderType = entities.reminderType ?? 'appointment';

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startOfDay = new Date(tomorrow.setHours(0, 0, 0, 0));
      const endOfDay = new Date(tomorrow.setHours(23, 59, 59, 999));

      let recipients: any[] = [];

      if (reminderType === 'appointment') {
        recipients = await this.prisma.appointment.findMany({
          where: {
            workspaceId,
            date: { gte: startOfDay, lte: endOfDay },
            status: 'SCHEDULED',
          },
          include: {
            patient: { select: { id: true, name: true, phone: true, ownerName: true } },
          },
        });
      } else if (reminderType === 'vaccination') {
        recipients = await this.prisma.vaccinationRecord.findMany({
          where: {
            workspaceId,
            nextDueDate: { gte: startOfDay, lte: endOfDay },
          },
          include: {
            patient: { select: { id: true, name: true, phone: true, ownerName: true } },
          },
        });
      }

      if (recipients.length === 0) {
        return {
          success: true,
          action: 'REMINDER_SEND',
          message: `No ${reminderType} reminders to send for tomorrow.`,
          data: { sent: 0, type: reminderType },
        };
      }

      // Create reminder records (actual sending via WhatsApp connector)
      const reminders = await Promise.all(
        recipients.map(r =>
          this.prisma.reminder.create({
            data: {
              type: reminderType.toUpperCase(),
              patientId: r.patientId,
              workspaceId,
              scheduledDate: startOfDay,
              status: 'PENDING',
              channel: 'WHATSAPP',
              content: this.buildReminderMessage(r, reminderType),
              createdBy: userId,
            },
          }),
        ),
      );

      return {
        success: true,
        action: 'REMINDER_SEND',
        message: `${reminders.length} ${reminderType} reminders queued for tomorrow.`,
        data: { sent: reminders.length, type: reminderType, date: startOfDay.toISOString() },
        evidence: reminders.map(r => `reminder:${r.id}`),
      };
    } catch (error) {
      this.logger.error(`Reminder sending failed: ${error.message}`);
      return {
        success: false,
        action: 'REMINDER_SEND',
        message: 'Failed to send reminders.',
        error: error.message,
      };
    }
  }

  private buildReminderMessage(record: any, type: string): string {
    const patientName = record.patient?.name ?? 'your pet';
    const ownerName = record.patient?.ownerName ?? 'valued client';

    if (type === 'appointment') {
      return `Hello ${ownerName}, this is a reminder that ${patientName} has an appointment tomorrow at ${record.time}. Please arrive 10 minutes early. Reply CONFIRM to confirm or RESCHEDULE to change.`;
    }
    if (type === 'vaccination') {
      return `Hello ${ownerName}, ${patientName} is due for a vaccination tomorrow. Please visit the clinic during working hours. Reply CONFIRM to confirm.`;
    }
    return `Hello ${ownerName}, this is a reminder from the clinic regarding ${patientName}.`;
  }
}

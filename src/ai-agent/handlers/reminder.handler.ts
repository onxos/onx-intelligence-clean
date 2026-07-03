/**
 * ONX AI Agent — Reminder Command Handler (Simplified for R1)
 * Uses Reminder model (existing)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
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

      // Count existing reminders for the day
      const existingCount = await this.prisma.reminder.count({
        where: {
          workspaceId,
          scheduledDate: { gte: startOfDay },
          type: reminderType.toUpperCase(),
        },
      });

      // Create a sample reminder record
      const reminder = await this.prisma.reminder.create({
        data: {
          type: reminderType.toUpperCase(),
          patientId: 'system',
          workspaceId,
          scheduledDate: startOfDay,
          status: 'PENDING',
          channel: 'WHATSAPP',
          content: `Reminder: ${reminderType} notification scheduled for ${startOfDay.toDateString()}`,
          createdBy: userId,
        },
      });

      return {
        success: true,
        action: 'REMINDER_SEND',
        message: `Reminder #${reminder.id} queued. ${existingCount} existing ${reminderType} reminders for tomorrow.`,
        data: { reminderId: reminder.id, type: reminderType, date: startOfDay.toISOString() },
      };
    } catch (error) {
      this.logger.error(`Reminder operation failed: ${error.message}`);
      return {
        success: false,
        action: 'REMINDER_SEND',
        message: 'Failed to process reminder.',
        error: error.message,
      };
    }
  }
}

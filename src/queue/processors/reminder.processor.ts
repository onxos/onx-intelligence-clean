/**
 * ONX BullMQ Processor — Reminder Send
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '../redis.config';

@Processor(QueueNames.REMINDER_SEND, { concurrency: 2 })
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  async process(job: Job): Promise<any> {
    this.logger.log(`Reminder Job ${job.id}: ${job.name}`);
    // Implementation: Send reminders via WhatsApp/SMS
    return { status: 'sent', jobId: job.id };
  }
}

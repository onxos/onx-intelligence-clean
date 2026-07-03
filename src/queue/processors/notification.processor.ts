/**
 * ONX BullMQ Processor — Notification
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '../redis.config';

@Processor(QueueNames.NOTIFICATION, { concurrency: 3 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job): Promise<any> {
    this.logger.log(`Notification Job ${job.id}: ${job.name}`);
    // Implementation: Send notifications via configured channels
    return { status: 'sent', jobId: job.id };
  }
}

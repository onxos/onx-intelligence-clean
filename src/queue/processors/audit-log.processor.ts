/**
 * ONX BullMQ Processor — Audit Log
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '../redis.config';

@Processor(QueueNames.AUDIT_LOG, { concurrency: 1 })
export class AuditLogProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogProcessor.name);

  async process(job: Job): Promise<any> {
    this.logger.log(`Audit Log Job ${job.id}`);
    // Implementation: Write to audit store
    return { status: 'logged', jobId: job.id };
  }
}

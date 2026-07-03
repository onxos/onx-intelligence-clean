/**
 * ONX BullMQ Processor — Connector Sync
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '../redis.config';

@Processor(QueueNames.CONNECTOR_SYNC, { concurrency: 3 })
export class ConnectorSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ConnectorSyncProcessor.name);

  async process(job: Job): Promise<any> {
    this.logger.log(`Connector Sync Job ${job.id}: ${job.name}`);
    // Implementation: Sync with external connectors (WhatsApp, EMR, etc.)
    return { status: 'completed', jobId: job.id, connector: job.name };
  }
}

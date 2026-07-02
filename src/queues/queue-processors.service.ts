import { Injectable, OnModuleInit } from '@nestjs/common';
import { StructuredLogger } from '../common/structured-logger.service';
import { QueueService } from './queue.service';
import { QUEUES } from './queues.constants';

/**
 * Phase 4 — registers a processor for every queue. Processors are intentionally
 * thin here (structured-log + metric via QueueService); in production they
 * would delegate to the SECH/IURG/connector/AI services for genuinely async
 * work. Keeping them decoupled avoids module cycles.
 */
@Injectable()
export class QueueProcessorsService implements OnModuleInit {
  constructor(private readonly queues: QueueService) {}

  onModuleInit(): void {
    this.queues.register(QUEUES.ficEnforcement, (data) =>
      StructuredLogger.info('queue.fic-enforcement processed', {
        queue: QUEUES.ficEnforcement,
        data,
      }),
    );
    this.queues.register(QUEUES.iurgBinding, (data) =>
      StructuredLogger.info('queue.iurg-binding processed', { queue: QUEUES.iurgBinding, data }),
    );
    this.queues.register(QUEUES.connectorSync, (data) =>
      StructuredLogger.info('queue.connector-sync processed', {
        queue: QUEUES.connectorSync,
        data,
      }),
    );
    this.queues.register(QUEUES.aiConsensus, (data) =>
      StructuredLogger.info('queue.ai-consensus processed', { queue: QUEUES.aiConsensus, data }),
    );
    this.queues.register(QUEUES.auditLog, (data) =>
      StructuredLogger.info('queue.audit-log processed', { queue: QUEUES.auditLog, data }),
    );
  }
}

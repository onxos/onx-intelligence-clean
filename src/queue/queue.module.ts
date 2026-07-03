/**
 * ONX Queue Module — BullMQ Integration
 * Replaces in-memory queues with Redis-backed BullMQ
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisConfig, QueueNames } from './redis.config';
import { FicEnforcementProcessor } from './processors/fic-enforcement.processor';
import { ConnectorSyncProcessor } from './processors/connector-sync.processor';
import { AiConsensusProcessor } from './processors/ai-consensus.processor';
import { AuditLogProcessor } from './processors/audit-log.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { ReportProcessor } from './processors/report.processor';
import { ReminderProcessor } from './processors/reminder.processor';
import { QueueService } from './queue.service';

@Module({
  imports: [
    RedisConfig,
    BullModule.registerQueue(
      { name: QueueNames.FIC_ENFORCEMENT },
      { name: QueueNames.CONNECTOR_SYNC },
      { name: QueueNames.AI_CONSENSUS },
      { name: QueueNames.AUDIT_LOG },
      { name: QueueNames.NOTIFICATION },
      { name: QueueNames.REPORT_GENERATION },
      { name: QueueNames.REMINDER_SEND },
    ),
  ],
  providers: [
    QueueService,
    FicEnforcementProcessor,
    ConnectorSyncProcessor,
    AiConsensusProcessor,
    AuditLogProcessor,
    NotificationProcessor,
    ReportProcessor,
    ReminderProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}

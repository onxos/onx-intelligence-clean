/**
 * ONX Redis/BullMQ Configuration
 * Production-ready queue configuration
 */

import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const RedisConfig = BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    connection: {
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
      password: config.get('REDIS_PASSWORD', undefined),
      db: config.get('REDIS_DB', 0),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  }),
  inject: [ConfigService],
});

export const QueueNames = {
  FIC_ENFORCEMENT: 'fic-enforcement',
  IURG_BINDING: 'iurg-binding',
  CONNECTOR_SYNC: 'connector-sync',
  AI_CONSENSUS: 'ai-consensus',
  AUDIT_LOG: 'audit-log',
  NOTIFICATION: 'notification',
  REPORT_GENERATION: 'report-generation',
  REMINDER_SEND: 'reminder-send',
} as const;

export const QueueConfig = {
  [QueueNames.FIC_ENFORCEMENT]: {
    priority: 1,
    workers: 2,
  },
  [QueueNames.IURG_BINDING]: {
    priority: 1,
    workers: 2,
  },
  [QueueNames.CONNECTOR_SYNC]: {
    priority: 2,
    workers: 3,
  },
  [QueueNames.AI_CONSENSUS]: {
    priority: 2,
    workers: 2,
  },
  [QueueNames.AUDIT_LOG]: {
    priority: 3,
    workers: 1,
  },
  [QueueNames.NOTIFICATION]: {
    priority: 3,
    workers: 3,
  },
  [QueueNames.REPORT_GENERATION]: {
    priority: 4,
    workers: 2,
  },
  [QueueNames.REMINDER_SEND]: {
    priority: 3,
    workers: 2,
  },
};

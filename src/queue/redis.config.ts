import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const RedisConfig = BullModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (c: ConfigService) => ({
    connection: {
      host: c.get<string>('REDIS_HOST', 'localhost'),
      port: Number(c.get<string | number>('REDIS_PORT', 6379)),
      password: c.get<string>('REDIS_PASSWORD') || undefined,
    },
  }),
});

export const QueueNames = {
  FIC_ENFORCEMENT: 'fic',
  CONNECTOR_SYNC: 'connector',
  AI_CONSENSUS: 'ai',
  AUDIT_LOG: 'audit',
  NOTIFICATION: 'notify',
  REPORT: 'report',
  REMINDER: 'reminder',
} as const;

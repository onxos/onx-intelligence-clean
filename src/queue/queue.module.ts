import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisConfig, QueueNames } from './redis.config';
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
      { name: QueueNames.REPORT },
      { name: QueueNames.REMINDER },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

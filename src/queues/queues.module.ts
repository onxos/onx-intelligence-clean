import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueProcessorsService } from './queue-processors.service';

@Module({
  providers: [QueueService, QueueProcessorsService],
  exports: [QueueService],
})
export class QueuesModule {}

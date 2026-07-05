import { Module } from '@nestjs/common';
import { ToolController } from './tool.controller';
import { ToolService } from './tool.service';
import { NotificationModule } from '../notification/notification.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [NotificationModule, QueueModule],
  controllers: [ToolController],
  providers: [ToolService],
  exports: [ToolService],
})
export class ToolModule {}

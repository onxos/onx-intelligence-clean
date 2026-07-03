import { Module } from '@nestjs/common';
import { AlertingModule } from '../../alerting/alerting.module';
import { QueueModule } from '../../queue/queue.module';
import { VitalsTrendingController } from './vitals-trending.controller';
import { VitalsTrendingService } from './vitals-trending.service';

@Module({
  imports: [AlertingModule, QueueModule],
  controllers: [VitalsTrendingController],
  providers: [VitalsTrendingService],
  exports: [VitalsTrendingService],
})
export class VitalsTrendingModule {}
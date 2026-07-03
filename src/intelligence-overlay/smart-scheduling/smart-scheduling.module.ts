import { Module } from '@nestjs/common';
import { SmartSchedulingController } from './smart-scheduling.controller';
import { SmartSchedulingService } from './smart-scheduling.service';

@Module({
  controllers: [SmartSchedulingController],
  providers: [SmartSchedulingService],
  exports: [SmartSchedulingService],
})
export class SmartSchedulingModule {}

import { Module } from '@nestjs/common';
import { VitalsTrendingController } from './vitals-trending.controller';
import { VitalsTrendingService } from './vitals-trending.service';

@Module({
  controllers: [VitalsTrendingController],
  providers: [VitalsTrendingService],
  exports: [VitalsTrendingService],
})
export class VitalsTrendingModule {}
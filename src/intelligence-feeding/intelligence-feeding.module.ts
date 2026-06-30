import { Module } from '@nestjs/common';
import { IntelligenceFeedingController } from './intelligence-feeding.controller';
import { IntelligenceFeedingService } from './intelligence-feeding.service';

@Module({
  controllers: [IntelligenceFeedingController],
  providers: [IntelligenceFeedingService],
  exports: [IntelligenceFeedingService],
})
export class IntelligenceFeedingModule {}

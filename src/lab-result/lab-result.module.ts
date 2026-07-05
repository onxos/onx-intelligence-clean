import { Module } from '@nestjs/common';
import { LabResultController } from './lab-result.controller';
import { LabResultService } from './lab-result.service';

@Module({
  controllers: [LabResultController],
  providers: [LabResultService],
  exports: [LabResultService],
})
export class LabResultModule {}

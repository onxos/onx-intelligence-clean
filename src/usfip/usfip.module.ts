import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { UsfipController } from './usfip.controller';
import { UsfipService } from './usfip.service';

@Module({
  imports: [EvidenceModule],
  controllers: [UsfipController],
  providers: [UsfipService],
  exports: [UsfipService],
})
export class UsfipModule {}

import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { ReasoningController } from './reasoning.controller';
import { ReasoningService } from './reasoning.service';

@Module({
  imports: [EvidenceModule],
  controllers: [ReasoningController],
  providers: [ReasoningService],
  exports: [ReasoningService],
})
export class ReasoningModule {}

import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { DecisionController } from './decision.controller';
import { DecisionService } from './decision.service';

@Module({
  imports: [EvidenceModule],
  controllers: [DecisionController],
  providers: [DecisionService],
  exports: [DecisionService],
})
export class DecisionModule {}

import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { SechModule } from '../sech/sech.module';
import { DecisionController } from './decision.controller';
import { DecisionService } from './decision.service';
import { DecisionLadderController } from './decision-ladder.controller';
import { DecisionLadderService } from './decision-ladder.service';

@Module({
  imports: [EvidenceModule, SechModule],
  controllers: [DecisionController, DecisionLadderController],
  providers: [DecisionService, DecisionLadderService],
  exports: [DecisionService, DecisionLadderService],
})
export class DecisionModule {}

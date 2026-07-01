import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { ProofController, StressController } from './proof.controller';
import { ProofService } from './proof.service';

@Module({
  imports: [EvidenceModule],
  controllers: [ProofController, StressController],
  providers: [ProofService],
  exports: [ProofService],
})
export class ProofModule {}

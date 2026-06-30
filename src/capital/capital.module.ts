import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { CapitalController } from './capital.controller';
import { CapitalService } from './capital.service';
import { IntelligenceCapitalController } from './intelligence-capital.controller';
import { IntelligenceCapitalService } from './intelligence-capital.service';

@Module({
  imports: [EvidenceModule],
  controllers: [CapitalController, IntelligenceCapitalController],
  providers: [CapitalService, IntelligenceCapitalService],
  exports: [CapitalService, IntelligenceCapitalService],
})
export class CapitalModule {}

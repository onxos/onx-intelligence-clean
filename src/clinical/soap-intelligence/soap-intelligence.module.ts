import { Module } from '@nestjs/common';
import { SoapIntelligenceController } from './soap-intelligence.controller';
import { SoapIntelligenceService } from './soap-intelligence.service';

@Module({
  controllers: [SoapIntelligenceController],
  providers: [SoapIntelligenceService],
  exports: [SoapIntelligenceService],
})
export class SoapIntelligenceModule {}
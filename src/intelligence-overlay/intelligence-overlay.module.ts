import { Module } from '@nestjs/common';
import { IntelligenceOverlayController } from './intelligence-overlay.controller';
import { DiagnosticService } from './diagnostic.service';
import { TreatmentService } from './treatment.service';
import { VoiceSoapService } from './voice-soap.service';
import { SmartSchedulingService } from './smart-scheduling.service';
import { AiCoreModule } from '../ai-core/ai-core.module';

@Module({
  imports: [AiCoreModule],
  controllers: [IntelligenceOverlayController],
  providers: [DiagnosticService, TreatmentService, VoiceSoapService, SmartSchedulingService],
  exports: [DiagnosticService, TreatmentService, VoiceSoapService, SmartSchedulingService],
})
export class IntelligenceOverlayModule {}

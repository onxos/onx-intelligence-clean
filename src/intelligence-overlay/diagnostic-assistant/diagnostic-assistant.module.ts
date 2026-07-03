import { Module } from '@nestjs/common';
import { AiCoreModule } from '../../ai-core/ai-core.module';
import { DiagnosticAssistantController } from './diagnostic-assistant.controller';
import { DiagnosticAssistantService } from './diagnostic-assistant.service';

@Module({
  imports: [AiCoreModule],
  controllers: [DiagnosticAssistantController],
  providers: [DiagnosticAssistantService],
  exports: [DiagnosticAssistantService],
})
export class DiagnosticAssistantModule {}

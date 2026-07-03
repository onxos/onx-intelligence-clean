import { Module } from '@nestjs/common';
import { AiCoreModule } from '../../ai-core/ai-core.module';
import { VoiceToSoapController } from './voice-to-soap.controller';
import { VoiceToSoapService } from './voice-to-soap.service';

@Module({
  imports: [AiCoreModule],
  controllers: [VoiceToSoapController],
  providers: [VoiceToSoapService],
  exports: [VoiceToSoapService],
})
export class VoiceToSoapModule {}

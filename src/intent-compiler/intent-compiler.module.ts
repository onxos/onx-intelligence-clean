import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { IntentCompilerController } from './intent-compiler.controller';
import { IntentCompilerService } from './intent-compiler.service';

@Module({
  imports: [EvidenceModule],
  controllers: [IntentCompilerController],
  providers: [IntentCompilerService],
  exports: [IntentCompilerService],
})
export class IntentCompilerModule {}

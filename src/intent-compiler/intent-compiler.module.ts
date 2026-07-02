import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { IurgModule } from '../iurg/iurg.module';
import { FicEnforcementService } from './fic-enforcement.service';
import { IntentCompilerController } from './intent-compiler.controller';
import { IntentCompilerService } from './intent-compiler.service';
import { SechFicController } from './sech-fic.controller';

@Module({
  imports: [EvidenceModule, IurgModule],
  controllers: [IntentCompilerController, SechFicController],
  providers: [IntentCompilerService, FicEnforcementService],
  exports: [IntentCompilerService, FicEnforcementService],
})
export class IntentCompilerModule {}

import { Module } from '@nestjs/common';
import { CapitalModule } from '../capital/capital.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { FounderIntentController } from './founder-intent.controller';
import { FounderIntentService } from './founder-intent.service';

@Module({
  imports: [WorkspaceModule, CapitalModule],
  controllers: [FounderIntentController],
  providers: [FounderIntentService],
  exports: [FounderIntentService],
})
export class FounderIntentModule {}

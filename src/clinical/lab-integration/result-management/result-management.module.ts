import { Module } from '@nestjs/common';
import { AiCoreModule } from '../../../ai-core/ai-core.module';
import { ResultManagementController } from './result-management.controller';
import { ResultManagementService } from './result-management.service';

@Module({
  imports: [AiCoreModule],
  controllers: [ResultManagementController],
  providers: [ResultManagementService],
  exports: [ResultManagementService],
})
export class ResultManagementModule {}

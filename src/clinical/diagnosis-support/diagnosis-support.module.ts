import { Module } from '@nestjs/common';
import { AiCoreModule } from '../../ai-core/ai-core.module';
import { DiagnosisSupportController } from './diagnosis-support.controller';
import { DiagnosisSupportService } from './diagnosis-support.service';

@Module({
  imports: [AiCoreModule],
  controllers: [DiagnosisSupportController],
  providers: [DiagnosisSupportService],
  exports: [DiagnosisSupportService],
})
export class DiagnosisSupportModule {}
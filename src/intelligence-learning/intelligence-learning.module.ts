import { Module } from '@nestjs/common';
import { IntelligenceLearningController } from './intelligence-learning.controller';
import { IntelligenceLearningService } from './intelligence-learning.service';

@Module({
  controllers: [IntelligenceLearningController],
  providers: [IntelligenceLearningService],
  exports: [IntelligenceLearningService],
})
export class IntelligenceLearningModule {}

import { Module } from '@nestjs/common';
import { IurgModule } from '../iurg/iurg.module';
import { SechModule } from '../sech/sech.module';
import { ContextMatchingService } from './context-matching.service';
import { MeaningExtractionService } from './meaning-extraction.service';
import { PatternDetectionService } from './pattern-detection.service';
import { UnderstandingController } from './understanding.controller';
import { UnderstandingService } from './understanding.service';

@Module({
  imports: [SechModule, IurgModule],
  controllers: [UnderstandingController],
  providers: [
    UnderstandingService,
    PatternDetectionService,
    ContextMatchingService,
    MeaningExtractionService,
  ],
  exports: [UnderstandingService],
})
export class UnderstandingModule {}

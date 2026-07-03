import { Module } from '@nestjs/common';
import { AiCoreModule } from '../../ai-core/ai-core.module';
import { TreatmentRecommenderController } from './treatment-recommender.controller';
import { TreatmentRecommenderService } from './treatment-recommender.service';

@Module({
  imports: [AiCoreModule],
  controllers: [TreatmentRecommenderController],
  providers: [TreatmentRecommenderService],
  exports: [TreatmentRecommenderService],
})
export class TreatmentRecommenderModule {}

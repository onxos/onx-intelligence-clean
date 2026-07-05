import { Module } from '@nestjs/common';
import { EvolutionTrackerController } from './evolution-tracker.controller';
import { EvolutionTrackerService } from './evolution-tracker.service';

@Module({
  controllers: [EvolutionTrackerController],
  providers: [EvolutionTrackerService],
  exports: [EvolutionTrackerService],
})
export class EvolutionTrackerModule {}

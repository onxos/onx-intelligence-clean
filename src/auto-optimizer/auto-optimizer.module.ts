import { Module } from '@nestjs/common';
import { AutoOptimizerController } from './auto-optimizer.controller';
import { AutoOptimizerService } from './auto-optimizer.service';

@Module({
  controllers: [AutoOptimizerController],
  providers: [AutoOptimizerService],
  exports: [AutoOptimizerService],
})
export class AutoOptimizerModule {}

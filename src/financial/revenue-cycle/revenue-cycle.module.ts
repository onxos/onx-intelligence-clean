import { Module } from '@nestjs/common';
import { RevenueCycleController } from './revenue-cycle.controller';
import { RevenueCycleService } from './revenue-cycle.service';

@Module({
  controllers: [RevenueCycleController],
  providers: [RevenueCycleService],
  exports: [RevenueCycleService],
})
export class RevenueCycleModule {}

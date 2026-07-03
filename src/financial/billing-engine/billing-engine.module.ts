import { Module } from '@nestjs/common';
import { BillingEngineController } from './billing-engine.controller';
import { BillingEngineService } from './billing-engine.service';

@Module({
  controllers: [BillingEngineController],
  providers: [BillingEngineService],
  exports: [BillingEngineService],
})
export class BillingEngineModule {}

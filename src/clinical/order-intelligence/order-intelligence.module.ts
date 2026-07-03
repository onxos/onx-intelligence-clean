import { Module } from '@nestjs/common';
import { OrderIntelligenceController } from './order-intelligence.controller';
import { OrderIntelligenceService } from './order-intelligence.service';

@Module({
  controllers: [OrderIntelligenceController],
  providers: [OrderIntelligenceService],
  exports: [OrderIntelligenceService],
})
export class OrderIntelligenceModule {}
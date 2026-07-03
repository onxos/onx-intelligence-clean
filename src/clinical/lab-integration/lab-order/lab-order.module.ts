import { Module } from '@nestjs/common';
import { LabOrderController } from './lab-order.controller';
import { LabOrderService } from './lab-order.service';

@Module({
  controllers: [LabOrderController],
  providers: [LabOrderService],
  exports: [LabOrderService],
})
export class LabOrderModule {}

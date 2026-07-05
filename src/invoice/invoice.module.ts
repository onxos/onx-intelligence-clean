import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { PaymentController } from './payment.controller';
import { InvoiceService } from './invoice.service';

@Module({
  controllers: [InvoiceController, PaymentController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}

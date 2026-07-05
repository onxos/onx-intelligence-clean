import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { TransactionController } from './transaction.controller';
import { AlertController } from './alert.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [ProductController, TransactionController, AlertController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

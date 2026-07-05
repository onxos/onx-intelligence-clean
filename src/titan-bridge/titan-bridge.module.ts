import { Module } from '@nestjs/common';
import { TitanBridgeController } from './titan-bridge.controller';
import { TitanBridgeService } from './titan-bridge.service';

@Module({
  controllers: [TitanBridgeController],
  providers: [TitanBridgeService],
  exports: [TitanBridgeService],
})
export class TitanBridgeModule {}

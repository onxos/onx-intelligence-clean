import { Module } from '@nestjs/common';
import { ClaimsManagerController } from './claims-manager.controller';
import { ClaimsManagerService } from './claims-manager.service';

@Module({
  controllers: [ClaimsManagerController],
  providers: [ClaimsManagerService],
  exports: [ClaimsManagerService],
})
export class ClaimsManagerModule {}

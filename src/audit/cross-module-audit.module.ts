import { Module } from '@nestjs/common';
import { CrossModuleAuditController } from './cross-module-audit.controller';
import { CrossModuleAuditService } from './cross-module-audit.service';

@Module({
  controllers: [CrossModuleAuditController],
  providers: [CrossModuleAuditService],
  exports: [CrossModuleAuditService],
})
export class CrossModuleAuditModule {}

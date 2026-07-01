import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { IfcController } from './ifc.controller';
import { IfcService } from './ifc.service';

@Module({
  imports: [EvidenceModule],
  controllers: [IfcController],
  providers: [IfcService],
  exports: [IfcService],
})
export class IfcModule {}

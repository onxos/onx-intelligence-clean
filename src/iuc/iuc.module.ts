import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { IUCController } from './iuc.controller';
import { IUCService } from './iuc.service';

@Module({
  imports: [EvidenceModule],
  controllers: [IUCController],
  providers: [IUCService],
  exports: [IUCService],
})
export class IUCModule {}

import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [EvidenceModule],
  controllers: [MetaController],
  providers: [MetaService],
  exports: [MetaService],
})
export class MetaModule {}

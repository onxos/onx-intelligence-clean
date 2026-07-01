import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { FiarController } from './fiar.controller';
import { FiarService } from './fiar.service';

@Module({
  imports: [EvidenceModule],
  controllers: [FiarController],
  providers: [FiarService],
  exports: [FiarService],
})
export class FiarModule {}

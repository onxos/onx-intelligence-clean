import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { D20Controller } from './d20.controller';
import { D20Service } from './d20.service';

@Module({
  imports: [EvidenceModule],
  controllers: [D20Controller],
  providers: [D20Service],
  exports: [D20Service],
})
export class D20Module {}

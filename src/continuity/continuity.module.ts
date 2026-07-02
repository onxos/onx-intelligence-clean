import { Module } from '@nestjs/common';
import { IurgModule } from '../iurg/iurg.module';
import { ContinuityController } from './continuity.controller';
import { ContinuityGuardService } from './continuity-guard.service';
import { ContinuityService } from './continuity.service';

@Module({
  imports: [IurgModule],
  controllers: [ContinuityController],
  providers: [ContinuityGuardService, ContinuityService],
  exports: [ContinuityGuardService, ContinuityService],
})
export class ContinuityModule {}

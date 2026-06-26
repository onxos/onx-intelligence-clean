import { Module } from '@nestjs/common';
import { SovereigntyController } from './sovereignty.controller';
import { SovereigntyService } from './sovereignty.service';

@Module({
  controllers: [SovereigntyController],
  providers: [SovereigntyService],
  exports: [SovereigntyService],
})
export class SovereigntyModule {}

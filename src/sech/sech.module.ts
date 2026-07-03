import { Module } from '@nestjs/common';
import { SechRouterService } from './sech-router.service';

@Module({
  providers: [SechRouterService],
  exports: [SechRouterService],
})
export class SechModule {}

import { Module } from '@nestjs/common';
import { IurgService } from './iurg.service';

@Module({
  providers: [IurgService],
  exports: [IurgService],
})
export class IurgModule {}

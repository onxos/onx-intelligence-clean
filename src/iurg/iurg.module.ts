import { Module } from '@nestjs/common';
import { IurgController } from './iurg.controller';
import { IurgService } from './iurg.service';

@Module({
  controllers: [IurgController],
  providers: [IurgService],
  exports: [IurgService],
})
export class IurgModule {}

import { Module } from '@nestjs/common';
import { IurgModule } from '../iurg/iurg.module';
import { SfisController } from './sfis.controller';
import { SfisService } from './sfis.service';

@Module({
  imports: [IurgModule],
  controllers: [SfisController],
  providers: [SfisService],
  exports: [SfisService],
})
export class SfisModule {}

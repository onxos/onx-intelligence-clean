import { Module } from '@nestjs/common';
import { IurgModule } from '../iurg/iurg.module';
import { SechModule } from '../sech/sech.module';
import { PerceptionController } from './perception.controller';
import { PerceptionService } from './perception.service';

@Module({
  imports: [SechModule, IurgModule],
  controllers: [PerceptionController],
  providers: [PerceptionService],
  exports: [PerceptionService],
})
export class PerceptionModule {}

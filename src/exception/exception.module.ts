import { Module } from '@nestjs/common';
import { IurgModule } from '../iurg/iurg.module';
import { ExceptionController } from './exception.controller';
import { ExceptionService } from './exception.service';

@Module({
  imports: [IurgModule],
  controllers: [ExceptionController],
  providers: [ExceptionService],
  exports: [ExceptionService],
})
export class ExceptionModule {}

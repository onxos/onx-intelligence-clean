import { Module } from '@nestjs/common';
import { IurgModule } from '../iurg/iurg.module';
import { SechModule } from '../sech/sech.module';
import { JudgmentController } from './judgment.controller';
import { JudgmentService } from './judgment.service';

@Module({
  imports: [SechModule, IurgModule],
  controllers: [JudgmentController],
  providers: [JudgmentService],
  exports: [JudgmentService],
})
export class JudgmentModule {}

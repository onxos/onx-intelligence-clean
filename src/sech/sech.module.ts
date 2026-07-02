import { Module } from '@nestjs/common';
import { IntentCompilerModule } from '../intent-compiler/intent-compiler.module';
import { SechRouterController } from './sech-router.controller';
import { SechRouterService } from './sech-router.service';

@Module({
  imports: [IntentCompilerModule],
  controllers: [SechRouterController],
  providers: [SechRouterService],
  exports: [SechRouterService],
})
export class SechModule {}

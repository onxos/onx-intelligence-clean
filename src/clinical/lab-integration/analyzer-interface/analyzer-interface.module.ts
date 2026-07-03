import { Module } from '@nestjs/common';
import { AnalyzerInterfaceController } from './analyzer-interface.controller';
import { AnalyzerInterfaceService } from './analyzer-interface.service';

@Module({
  controllers: [AnalyzerInterfaceController],
  providers: [AnalyzerInterfaceService],
  exports: [AnalyzerInterfaceService],
})
export class AnalyzerInterfaceModule {}

import { Module } from '@nestjs/common';
import { IntelligenceObjectController } from './intelligence-object.controller';
import { IntelligenceObjectService } from './intelligence-object.service';

@Module({
  controllers: [IntelligenceObjectController],
  providers: [IntelligenceObjectService],
  exports: [IntelligenceObjectService],
})
export class IntelligenceObjectModule {}

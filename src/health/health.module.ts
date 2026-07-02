import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { SystemHealthController } from './system-health.controller';
import { SystemHealthService } from './system-health.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, SystemHealthController],
  providers: [SystemHealthService],
  exports: [SystemHealthService],
})
export class HealthModule {}

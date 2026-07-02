import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AiCoreModule } from '../ai-core/ai-core.module';
import { QueuesModule } from '../queues/queues.module';
import { AlertingModule } from '../alerting/alerting.module';
import { HealthChecksService } from './health-checks.service';
import { BackupService } from './backup.service';
import { MetricsController } from './metrics.controller';
import { MonitoringController } from './monitoring.controller';
import { MetricsInterceptor } from './metrics.interceptor';

@Module({
  imports: [AiCoreModule, QueuesModule, AlertingModule],
  controllers: [MetricsController, MonitoringController],
  providers: [
    HealthChecksService,
    BackupService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [HealthChecksService],
})
export class MonitoringModule {}

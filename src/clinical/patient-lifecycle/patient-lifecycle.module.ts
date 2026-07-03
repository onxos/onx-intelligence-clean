import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { PatientLifecycleController } from './patient-lifecycle.controller';
import { PatientLifecycleService } from './patient-lifecycle.service';

@Module({
  imports: [QueueModule],
  controllers: [PatientLifecycleController],
  providers: [PatientLifecycleService],
  exports: [PatientLifecycleService],
})
export class PatientLifecycleModule {}
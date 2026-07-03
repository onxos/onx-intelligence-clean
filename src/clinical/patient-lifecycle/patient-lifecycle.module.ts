import { Module } from '@nestjs/common';
import { PatientLifecycleController } from './patient-lifecycle.controller';
import { PatientLifecycleService } from './patient-lifecycle.service';

@Module({
  controllers: [PatientLifecycleController],
  providers: [PatientLifecycleService],
  exports: [PatientLifecycleService],
})
export class PatientLifecycleModule {}
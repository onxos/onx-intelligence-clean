import { Module } from '@nestjs/common';
import { PatientLifecycleModule } from '../patient-lifecycle/patient-lifecycle.module';
import { AppointmentIntelligenceController } from './appointment-intelligence.controller';
import { AppointmentIntelligenceService } from './appointment-intelligence.service';

@Module({
  imports: [PatientLifecycleModule],
  controllers: [AppointmentIntelligenceController],
  providers: [AppointmentIntelligenceService],
  exports: [AppointmentIntelligenceService],
})
export class AppointmentIntelligenceModule {}
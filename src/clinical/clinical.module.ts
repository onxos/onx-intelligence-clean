import { Module } from '@nestjs/common';
import { AppointmentIntelligenceModule } from './appointment-intelligence/appointment-intelligence.module';
import { DiagnosisSupportModule } from './diagnosis-support/diagnosis-support.module';
import { OrderIntelligenceModule } from './order-intelligence/order-intelligence.module';
import { PatientLifecycleModule } from './patient-lifecycle/patient-lifecycle.module';
import { SoapIntelligenceModule } from './soap-intelligence/soap-intelligence.module';
import { VitalsTrendingModule } from './vitals-trending/vitals-trending.module';

@Module({
  imports: [
    PatientLifecycleModule,
    AppointmentIntelligenceModule,
    SoapIntelligenceModule,
    DiagnosisSupportModule,
    OrderIntelligenceModule,
    VitalsTrendingModule,
  ],
  exports: [
    PatientLifecycleModule,
    AppointmentIntelligenceModule,
    SoapIntelligenceModule,
    DiagnosisSupportModule,
    OrderIntelligenceModule,
    VitalsTrendingModule,
  ],
})
export class ClinicalModule {}
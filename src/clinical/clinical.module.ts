import { Module } from '@nestjs/common';
import { AppointmentIntelligenceModule } from './appointment-intelligence/appointment-intelligence.module';
import { AnalyzerInterfaceModule } from './lab-integration/analyzer-interface/analyzer-interface.module';
import { LabOrderModule } from './lab-integration/lab-order/lab-order.module';
import { QualityControlModule } from './lab-integration/quality-control/quality-control.module';
import { ResultManagementModule } from './lab-integration/result-management/result-management.module';
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
    LabOrderModule,
    ResultManagementModule,
    AnalyzerInterfaceModule,
    QualityControlModule,
  ],
  exports: [
    PatientLifecycleModule,
    AppointmentIntelligenceModule,
    SoapIntelligenceModule,
    DiagnosisSupportModule,
    OrderIntelligenceModule,
    VitalsTrendingModule,
    LabOrderModule,
    ResultManagementModule,
    AnalyzerInterfaceModule,
    QualityControlModule,
  ],
})
export class ClinicalModule {}
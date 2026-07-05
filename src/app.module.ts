import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { ProviderModule } from './provider/provider.module';
import { ToolModule } from './tool/tool.module';
import { SovereigntyModule } from './sovereignty/sovereignty.module';
import { EvidenceModule } from './evidence/evidence.module';
import { RbacModule } from './rbac/rbac.module';
import { AiCoreModule } from './ai-core/ai-core.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { PluginSystemModule } from './plugin-system/plugin-system.module';
import { QueueModule } from './queue/queue.module';
import { SechModule } from './sech/sech.module';
import { IurgModule } from './iurg/iurg.module';
import { PatientModule } from './patient/patient.module';
import { AppointmentModule } from './appointment/appointment.module';
import { PrescriptionModule } from './prescription/prescription.module';
import { LabResultModule } from './lab-result/lab-result.module';
import { MedicalRecordModule } from './medical-record/medical-record.module';
import { VaccinationModule } from './vaccination/vaccination.module';
import { ClinicalDocumentModule } from './clinical-document/clinical-document.module';
import { InvoiceModule } from './invoice/invoice.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationModule } from './notification/notification.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConnectorModule } from './connector/connector.module';
import { IntelligenceOverlayModule } from './intelligence-overlay/intelligence-overlay.module';
import { TitanBridgeModule } from './titan-bridge/titan-bridge.module';
import { CorpusIngestionModule } from './corpus-ingestion/corpus-ingestion.module';
import { CrossDomainQueriesModule } from './cross-domain-queries/cross-domain-queries.module';
import { AutoOptimizerModule } from './auto-optimizer/auto-optimizer.module';
import { EvolutionTrackerModule } from './evolution-tracker/evolution-tracker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    CommonModule,
    AuthModule,
    HealthModule,
    IntelligenceModule,
    ProviderModule,
    ToolModule,
    SovereigntyModule,
    EvidenceModule,
    SechModule,
    IurgModule,
    // Phase R1: Integrated modules
    RbacModule,
    AiCoreModule,
    AiAgentModule,
    PluginSystemModule,
    QueueModule,
    // Phase R2: Clinical Core
    PatientModule,
    AppointmentModule,
    PrescriptionModule,
    LabResultModule,
    // Phase R3: Medical Records & Clinical Documentation
    MedicalRecordModule,
    VaccinationModule,
    ClinicalDocumentModule,
    // Phase R4: Invoice & Billing
    InvoiceModule,
    // Phase R5: Inventory & Pharmacy
    InventoryModule,
    // Phase R6: Notifications & Reminders
    NotificationModule,
    // Phase R7: Dashboard & Analytics
    DashboardModule,
    // Phase R8: External Connectors
    ConnectorModule,
    // Phase R9: Intelligence Overlay
    IntelligenceOverlayModule,
    // Atlas V7: Continuous Evolution
    TitanBridgeModule,
    CorpusIngestionModule,
    CrossDomainQueriesModule,
    AutoOptimizerModule,
    EvolutionTrackerModule,
  ],
})
export class AppModule {}

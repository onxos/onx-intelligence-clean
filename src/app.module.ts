import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { IntelligenceObjectModule } from './intelligence-object/intelligence-object.module';
import { IntelligenceFeedingModule } from './intelligence-feeding/intelligence-feeding.module';
import { IntelligenceLearningModule } from './intelligence-learning/intelligence-learning.module';
import { ProviderModule } from './provider/provider.module';
import { ToolModule } from './tool/tool.module';
import { SovereigntyModule } from './sovereignty/sovereignty.module';
import { EvidenceModule } from './evidence/evidence.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { CommitModule } from './commit/commit.module';
import { CapitalModule } from './capital/capital.module';
import { FounderIntentModule } from './founder-intent/founder-intent.module';
import { IntentCompilerModule } from './intent-compiler/intent-compiler.module';
import { IurgModule } from './iurg/iurg.module';
import { SechModule } from './sech/sech.module';
import { PerceptionModule } from './perception/perception.module';
import { SfisModule } from './sfis/sfis.module';
import { UnderstandingModule } from './understanding/understanding.module';
import { JudgmentModule } from './judgment/judgment.module';
import { ContinuityModule } from './continuity/continuity.module';
import { IUCModule } from './iuc/iuc.module';
import { MeasurementModule } from './measurement/measurement.module';
import { RuntimeModule } from './runtime/runtime.module';
import { ExchangeModule } from './exchange/exchange.module';
import { ProofModule } from './proof/proof.module';
import { MetaModule } from './meta/meta.module';
import { UsfipModule } from './usfip/usfip.module';
import { IfcModule } from './ifc/ifc.module';
import { FiarModule } from './fiar/fiar.module';
import { ReasoningModule } from './reasoning/reasoning.module';
import { PlanningModule } from './planning/planning.module';
import { DecisionModule } from './decision/decision.module';
import { D20Module } from './d20/d20.module';
import { ClinicalModule } from './clinical/clinical.module';
import { AssessmentModule } from './assessment/assessment.module';
import { CrossModuleAuditModule } from './audit/cross-module-audit.module';
import { ExceptionModule } from './exception/exception.module';
import { AiCoreModule } from './ai-core/ai-core.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RbacModule } from './rbac/rbac.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { PluginSystemModule } from './plugin-system/plugin-system.module';
import { QueueModule } from './queue/queue.module';
import { BillingEngineModule } from './financial/billing-engine/billing-engine.module';
import { ClaimsManagerModule } from './financial/claims-manager/claims-manager.module';
import { PaymentProcessorModule } from './financial/payment-processor/payment-processor.module';
import { RevenueCycleModule } from './financial/revenue-cycle/revenue-cycle.module';
import { DiagnosticAssistantModule } from './intelligence-overlay/diagnostic-assistant/diagnostic-assistant.module';
import { TreatmentRecommenderModule } from './intelligence-overlay/treatment-recommender/treatment-recommender.module';
import { VoiceToSoapModule } from './intelligence-overlay/voice-to-soap/voice-to-soap.module';
import { SmartSchedulingModule } from './intelligence-overlay/smart-scheduling/smart-scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'workspace-ui', 'out'),
      serveRoot: '/w',
      renderPath: '/w*',
    }),
    CommonModule,
    AuthModule,
    HealthModule,
    IntelligenceModule,
    IntelligenceObjectModule,
    IntelligenceFeedingModule,
    IntelligenceLearningModule,
    ProviderModule,
    ToolModule,
    SovereigntyModule,
    EvidenceModule,
    WorkspaceModule,
    CapitalModule,
    FounderIntentModule,
    IntentCompilerModule,
    IurgModule,
    SechModule,
    PerceptionModule,
    SfisModule,
    UnderstandingModule,
    JudgmentModule,
    ContinuityModule,
    IUCModule,
    MeasurementModule,
    RuntimeModule,
    ExchangeModule,
    ProofModule,
    MetaModule,
    UsfipModule,
    IfcModule,
    FiarModule,
    ReasoningModule,
    PlanningModule,
    DecisionModule,
    D20Module,
    ClinicalModule,
    AssessmentModule,
    CrossModuleAuditModule,
    ExceptionModule,
    AiCoreModule,
    ConnectorsModule,
    MonitoringModule,
    RbacModule,
    AiAgentModule,
    PluginSystemModule,
    QueueModule,
    BillingEngineModule,
    ClaimsManagerModule,
    PaymentProcessorModule,
    RevenueCycleModule,
    DiagnosticAssistantModule,
    TreatmentRecommenderModule,
    VoiceToSoapModule,
    SmartSchedulingModule,
    CommitModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

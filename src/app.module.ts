import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
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
import { IUCModule } from './iuc/iuc.module';
import { MeasurementModule } from './measurement/measurement.module';
import { RuntimeModule } from './runtime/runtime.module';
import { ExchangeModule } from './exchange/exchange.module';
import { ProofModule } from './proof/proof.module';
import { MetaModule } from './meta/meta.module';
import { UsfipModule } from './usfip/usfip.module';
import { IfcModule } from './ifc/ifc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    IUCModule,
    MeasurementModule,
    RuntimeModule,
    ExchangeModule,
    ProofModule,
    MetaModule,
    UsfipModule,
    IfcModule,
    CommitModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}

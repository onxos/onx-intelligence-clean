import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { ProviderModule } from './provider/provider.module';
import { ToolModule } from './tool/tool.module';
import { SovereigntyModule } from './sovereignty/sovereignty.module';
import { EvidenceModule } from './evidence/evidence.module';
import { WorkspaceModule } from './workspace/workspace.module';

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
    ProviderModule,
    ToolModule,
    SovereigntyModule,
    EvidenceModule,
    WorkspaceModule,
  ],
})
export class AppModule {}

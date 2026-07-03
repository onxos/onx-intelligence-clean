/**
 * ONX AI Core Module — Placeholder
 * Full AI provider integration in Phase R3
 */

import { Module } from '@nestjs/common';
import { AiRouterService } from './ai-router.service';

@Module({
  providers: [AiRouterService],
  exports: [AiRouterService],
})
export class AiCoreModule {}

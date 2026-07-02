import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AiRouterService } from '../ai-core/ai-router.service';
import {
  CONSTRAINT_COUNT,
  FOUNDER_INTENT_CORPUS,
} from '../intent-compiler/fic-enforcement.constants';

export interface HealthCheckResult {
  name: string;
  status: 'up' | 'down' | 'degraded' | 'skipped';
  detail?: string;
}

const MIN_AI_PROVIDERS = 2;
const MIN_INTENT_CORPUS = 38;
const MIN_CONSTRAINTS = 69;

/**
 * Phase 4 — deep liveness/readiness checks beyond the D20 system monitor:
 * database connectivity, AI provider capacity, and constitutional corpus
 * integrity. Redis is reported as `skipped` (in-memory queue fallback).
 */
@Injectable()
export class HealthChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async database(): Promise<HealthCheckResult> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { name: 'database', status: 'up' };
    } catch (err) {
      return { name: 'database', status: 'down', detail: (err as Error)?.message };
    }
  }

  async aiProviders(): Promise<HealthCheckResult> {
    try {
      const available = await this.aiRouter.availableProviders();
      if (available.length < MIN_AI_PROVIDERS) {
        return {
          name: 'ai_providers',
          status: 'degraded',
          detail: `only ${available.length} available (need ${MIN_AI_PROVIDERS})`,
        };
      }
      return { name: 'ai_providers', status: 'up', detail: `${available.length} available` };
    } catch (err) {
      return { name: 'ai_providers', status: 'down', detail: (err as Error)?.message };
    }
  }

  constitution(): HealthCheckResult {
    const intents = FOUNDER_INTENT_CORPUS.length;
    const constraints = CONSTRAINT_COUNT;
    if (intents < MIN_INTENT_CORPUS || constraints < MIN_CONSTRAINTS) {
      return {
        name: 'constitution',
        status: 'down',
        detail: `corpus incomplete (${intents} intents / ${constraints} constraints)`,
      };
    }
    return {
      name: 'constitution',
      status: 'up',
      detail: `${intents} intents / ${constraints} constraints`,
    };
  }

  redis(): HealthCheckResult {
    // In-memory queue fallback — Redis is optional in this deployment.
    return { name: 'redis', status: 'skipped', detail: 'in-memory queue fallback' };
  }

  async runAll(): Promise<{
    status: 'ok' | 'degraded' | 'down';
    checks: HealthCheckResult[];
    timestamp: string;
  }> {
    const checks = [
      await this.database(),
      await this.aiProviders(),
      this.constitution(),
      this.redis(),
    ];
    const hasDown = checks.some((c) => c.status === 'down');
    const hasDegraded = checks.some((c) => c.status === 'degraded');
    const status = hasDown ? 'down' : hasDegraded ? 'degraded' : 'ok';
    return { status, checks, timestamp: new Date().toISOString() };
  }
}

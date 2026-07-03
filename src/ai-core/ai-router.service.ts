/**
 * ONX AI Router Service
 * Routes AI requests to appropriate providers with full API surface
 * used by ai-core.service.ts
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AICompletionContext {
  domain: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RouteResult {
  content: string;
  model: string;
  provider: string;
  tokensUsed: number;
  latencyMs: number;
  evidenceTier: string;
  mock: boolean;
}

export interface ConsensusResult {
  agreed: boolean;
  agreementCount: number;
  totalConsulted: number;
  consensusContent: string | null;
  responses: Array<{
    provider: string;
    model: string;
    content: string;
    tokensUsed: number;
    latencyMs: number;
  }>;
  evidenceTier: string;
}

export interface ProviderInfo {
  name: string;
  displayName: string;
  status: 'active' | 'inactive' | 'experimental';
  models: string[];
  costPer1kTokens: number;
}

@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);

  // Built-in provider catalog
  private readonly providers: ProviderInfo[] = [
    {
      name: 'openai',
      displayName: 'OpenAI',
      status: 'active',
      models: ['gpt-4o', 'gpt-4o-mini'],
      costPer1kTokens: 0.005,
    },
    {
      name: 'anthropic',
      displayName: 'Anthropic',
      status: 'active',
      models: ['claude-3-5-sonnet', 'claude-3-haiku'],
      costPer1kTokens: 0.003,
    },
    {
      name: 'google',
      displayName: 'Google AI',
      status: 'active',
      models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
      costPer1kTokens: 0.001,
    },
    {
      name: 'deepseek',
      displayName: 'DeepSeek',
      status: 'experimental',
      models: ['deepseek-chat', 'deepseek-coder'],
      costPer1kTokens: 0.0005,
    },
    {
      name: 'qwen',
      displayName: 'Qwen (Alibaba)',
      status: 'experimental',
      models: ['qwen-max', 'qwen-plus'],
      costPer1kTokens: 0.002,
    },
    {
      name: 'mistral',
      displayName: 'Mistral AI',
      status: 'active',
      models: ['mistral-large', 'mistral-medium'],
      costPer1kTokens: 0.002,
    },
  ];

  constructor(private readonly configService?: ConfigService) {}

  /**
   * Route a query to the best AI provider
   * Signature: route(query, context, providerId?)
   */
  async route(
    query: string,
    context: AICompletionContext,
    providerId?: string,
  ): Promise<RouteResult> {
    this.logger.log(`Routing query to ${providerId ?? 'best provider'} [domain: ${context.domain}]`);

    const startTime = Date.now();

    // Phase R1: Placeholder — returns mock response
    // Phase R3: Will route based on ISES score, domain fitness, cost efficiency
    const selectedProvider = providerId
      ? this.providers.find((p) => p.name === providerId)
      : this.selectBestProvider(context.domain);

    const provider = selectedProvider ?? this.providers[0];

    return {
      content: `[AI Placeholder — ${provider.displayName}]\nQuery: "${query.slice(0, 200)}"\nDomain: ${context.domain}\nFull AI integration in Phase R3.`,
      model: provider.models[0] ?? 'placeholder',
      provider: provider.name,
      tokensUsed: Math.ceil(query.length / 4),
      latencyMs: Date.now() - startTime,
      evidenceTier: 'simulated',
      mock: true,
    };
  }

  /**
   * Multi-provider consensus for high-confidence decisions
   */
  async consensus(
    query: string,
    context: AICompletionContext,
  ): Promise<ConsensusResult> {
    this.logger.log(`Running consensus for: "${query.slice(0, 100)}"`);

    const startTime = Date.now();

    // Phase R1: Simulate 3-provider consensus
    const consulted = this.providers
      .filter((p) => p.status === 'active')
      .slice(0, 3);

    const responses = consulted.map((p) => ({
      provider: p.name,
      model: p.models[0],
      content: `[Placeholder] ${p.displayName} response to: "${query.slice(0, 100)}"`,
      tokensUsed: Math.ceil(query.length / 4),
      latencyMs: Math.floor(Date.now() - startTime),
    }));

    return {
      agreed: true,
      agreementCount: responses.length,
      totalConsulted: responses.length,
      consensusContent: `Consensus reached across ${responses.length} providers. [Phase R3 placeholder]`,
      responses,
      evidenceTier: 'consensus_simulated',
    };
  }

  /**
   * Chat-style interaction (multi-turn)
   */
  async chat(
    messages: AIMessage[],
    context: AICompletionContext,
  ): Promise<RouteResult> {
    const lastMessage = messages[messages.length - 1];
    const query = lastMessage?.content ?? '';
    return this.route(query, context);
  }

  /**
   * List all available providers
   */
  listProviderInfo(): ProviderInfo[] {
    return this.providers.map((p) => ({
      ...p,
    }));
  }

  /**
   * Get status of a specific provider
   */
  async providerStatus(name: string): Promise<ProviderInfo | null> {
    const provider = this.providers.find((p) => p.name === name);
    return provider ?? null;
  }

  /**
   * Check if AI routing is available
   */
  isAvailable(): boolean {
    return true;
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private selectBestProvider(domain: string): ProviderInfo {
    // Phase R3: Will use ISES scores, domain fitness, cost efficiency
    const domainPreferred: Record<string, string> = {
      clinical: 'openai',
      legal: 'anthropic',
      coding: 'deepseek',
      general: 'openai',
    };
    const preferred = domainPreferred[domain] ?? 'openai';
    return this.providers.find((p) => p.name === preferred) ?? this.providers[0];
  }
}

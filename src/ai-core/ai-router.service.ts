/**
 * ONX AI Router Service
 * Routes AI requests to appropriate providers with full API surface
 * used by ai-core.service.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { callOllama, checkOllamaHealth } from './ollama.client';

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
  confidence: number;
  routingReason: string;
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
    confidence: number;
  }>;
  evidenceTier: string;
}

export interface ProviderInfo {
  name: string;
  displayName: string;
  status: 'active' | 'inactive' | 'experimental';
  models: string[];
  costPer1kTokens: number;
  local?: boolean;
}

/**
 * Domain-fitness table used by computeConfidence(). Values reflect the
 * provider's documented strengths (not randomized) — the same input always
 * yields the same confidence score.
 */
const DOMAIN_AFFINITY: Record<string, Record<string, number>> = {
  clinical: {
    openai: 0.75,
    anthropic: 0.85,
    google: 0.7,
    deepseek: 0.5,
    qwen: 0.5,
    mistral: 0.6,
    ollama_local: 0.8,
  },
  legal: {
    openai: 0.7,
    anthropic: 0.9,
    google: 0.65,
    deepseek: 0.45,
    qwen: 0.45,
    mistral: 0.55,
    ollama_local: 0.6,
  },
  coding: {
    openai: 0.8,
    anthropic: 0.75,
    google: 0.65,
    deepseek: 0.9,
    qwen: 0.7,
    mistral: 0.65,
    ollama_local: 0.6,
  },
  general: {
    openai: 0.8,
    anthropic: 0.8,
    google: 0.75,
    deepseek: 0.6,
    qwen: 0.6,
    mistral: 0.65,
    ollama_local: 0.55,
  },
};

const SENSITIVE_KEYWORDS = [
  'patient',
  'diagnosis',
  'medical record',
  'ssn',
  'social security',
  'credit card',
  'password',
  'phi',
  'hipaa',
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  clinical: ['diagnosis', 'treatment', 'patient', 'veterinary', 'medical', 'symptom'],
  legal: ['contract', 'compliance', 'regulatory', 'liability', 'statute'],
  coding: ['implement', 'function', 'bug', 'deploy', 'refactor', 'api'],
  general: ['help', 'explain', 'summarize', 'analyze'],
};

export function isSensitiveQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
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
    {
      name: 'ollama_local',
      displayName: 'Local LLM (Ollama)',
      status: 'experimental',
      models: ['llama3.1', 'mistral'],
      costPer1kTokens: 0,
      local: true,
    },
  ];

  private readonly localEndpoint: string;

  constructor(private readonly configService?: ConfigService) {
    this.localEndpoint =
      (typeof this.configService?.get === 'function'
        ? this.configService.get<string>('LOCAL_LLM_ENDPOINT')
        : undefined) ??
      process.env.LOCAL_LLM_ENDPOINT ??
      'http://localhost:11434';
  }

  /**
   * Route a query to the best AI provider
   * Signature: route(query, context, providerId?)
   */
  async route(
    query: string,
    context: AICompletionContext,
    providerId?: string,
  ): Promise<RouteResult> {
    const startTime = Date.now();
    const sensitive = isSensitiveQuery(query) || isSensitiveQuery(context.domain ?? '');

    let provider: ProviderInfo;
    let routingReason: string;

    if (providerId) {
      provider = this.providers.find((p) => p.name === providerId) ?? this.providers[0];
      routingReason = 'EXPLICIT_PROVIDER_ID';
    } else if (sensitive) {
      const local = this.providers.find((p) => p.local && p.status !== 'inactive');
      provider = local ?? this.selectBestProvider(context.domain, query);
      routingReason = local ? 'PRIVACY_FORCED_LOCAL' : 'PRIVACY_NO_LOCAL_FALLBACK';
    } else {
      provider = this.selectBestProvider(context.domain, query);
      routingReason = 'CONFIDENCE_ROUTED';
    }

    this.logger.log(
      `Routing query to ${provider.name} [domain: ${context.domain}, reason: ${routingReason}]`,
    );

    const confidence = this.computeConfidence(provider, context.domain, query);

    if (provider.local) {
      const localResult = await this.tryLocalGeneration(provider, query, context, startTime);
      if (localResult) {
        return { ...localResult, confidence, routingReason };
      }
    }

    return {
      content: `[AI Placeholder — ${provider.displayName}]\nQuery: "${query.slice(0, 200)}"\nDomain: ${context.domain}\nFull AI integration in Phase R3.`,
      model: provider.models[0] ?? 'placeholder',
      provider: provider.name,
      tokensUsed: Math.ceil(query.length / 4),
      latencyMs: Date.now() - startTime,
      evidenceTier: 'simulated',
      mock: true,
      confidence,
      routingReason,
    };
  }

  /**
   * Multi-provider consensus for high-confidence decisions
   */
  async consensus(query: string, context: AICompletionContext): Promise<ConsensusResult> {
    this.logger.log(`Running consensus for: "${query.slice(0, 100)}"`);

    const startTime = Date.now();

    // Phase R1: Simulate 3-provider consensus
    const consulted = this.providers.filter((p) => p.status === 'active').slice(0, 3);

    const responses = consulted.map((p) => ({
      provider: p.name,
      model: p.models[0],
      content: `[Placeholder] ${p.displayName} response to: "${query.slice(0, 100)}"`,
      tokensUsed: Math.ceil(query.length / 4),
      latencyMs: Math.floor(Date.now() - startTime),
      confidence: this.computeConfidence(p, context.domain, query),
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
  async chat(messages: AIMessage[], context: AICompletionContext): Promise<RouteResult> {
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
   * Get status of a specific provider. For the local provider this performs
   * a real health probe against the configured Ollama endpoint.
   */
  async providerStatus(name: string): Promise<ProviderInfo | null> {
    const provider = this.providers.find((p) => p.name === name);
    if (!provider) return null;
    if (provider.local) {
      const health = await checkOllamaHealth(this.localEndpoint);
      return {
        ...provider,
        status: health.healthy ? 'active' : 'inactive',
        models: health.models.length > 0 ? health.models : provider.models,
      };
    }
    return provider;
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

  /**
   * Deterministic confidence score in [0, 1] \u2014 NEVER randomized. Same
   * provider + domain + query always yields the same number, derived from
   * the provider's documented status/cost/domain-fitness plus how strongly
   * the query text matches the target domain's keyword set.
   */
  computeConfidence(provider: ProviderInfo, domain: string, query: string): number {
    const statusWeight =
      provider.status === 'active' ? 0.9 : provider.status === 'experimental' ? 0.6 : 0.2;
    const domainFitness =
      DOMAIN_AFFINITY[domain]?.[provider.name] ?? DOMAIN_AFFINITY.general[provider.name] ?? 0.5;
    const costEfficiency =
      provider.costPer1kTokens === 0 ? 1 : Math.max(0, 1 - provider.costPer1kTokens / 0.01);
    const contentRelevance = this.domainKeywordMatch(query, domain);

    const confidence =
      statusWeight * 0.4 + domainFitness * 0.3 + costEfficiency * 0.15 + contentRelevance * 0.15;
    return Math.min(1, Math.max(0, Number(confidence.toFixed(4))));
  }

  private domainKeywordMatch(query: string, domain: string): number {
    const keywords = DOMAIN_KEYWORDS[domain] ?? DOMAIN_KEYWORDS.general;
    const lower = query.toLowerCase();
    const matches = keywords.filter((kw) => lower.includes(kw)).length;
    return keywords.length > 0 ? Math.min(1, matches / 2) : 0.5;
  }

  private selectBestProvider(domain: string, query = ''): ProviderInfo {
    const candidates = this.providers.filter((p) => p.status !== 'inactive' && !p.local);
    const scored = candidates.map((p) => ({
      provider: p,
      score: this.computeConfidence(p, domain, query),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.provider ?? this.providers[0];
  }

  /**
   * Attempts a real generation call against the local Ollama endpoint.
   * Returns null (caller falls back to the documented placeholder) if the
   * endpoint is unreachable \u2014 never fabricates a "successful" response.
   */
  private async tryLocalGeneration(
    provider: ProviderInfo,
    query: string,
    context: AICompletionContext,
    startTime: number,
  ): Promise<Omit<RouteResult, 'confidence' | 'routingReason'> | null> {
    try {
      const model = provider.models[0];
      const prompt = context.system ? `${context.system}\n\n${query}` : query;
      const result = await callOllama(this.localEndpoint, model, prompt, {
        temperature: context.temperature,
        numPredict: context.maxTokens,
      });
      return {
        content: result.response,
        model,
        provider: provider.name,
        tokensUsed: result.eval_count ?? Math.ceil(query.length / 4),
        latencyMs: Date.now() - startTime,
        evidenceTier: 'local_llm',
        mock: false,
      };
    } catch (error: any) {
      this.logger.warn(`Local LLM unreachable (${this.localEndpoint}): ${error?.message ?? error}`);
      return null;
    }
  }
}

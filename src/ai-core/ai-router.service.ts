import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  AICompletionContext,
  AIConsensusResult,
  AIMessage,
  AIProvider,
  AIResponse,
} from './ai-core.types';
import { AI_CONSENSUS_SIZE, AI_CONSENSUS_THRESHOLD, AI_EVIDENCE_TIER } from './ai-core.config';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { QwenProvider } from './providers/qwen.provider';
import { LlamaProvider } from './providers/llama.provider';

export interface ProviderInfo {
  name: string;
  model: string;
  priority: number;
  evidenceTier: string;
  configured: boolean;
  mode: 'live' | 'mock';
}

export interface ProviderStatus extends ProviderInfo {
  available: boolean;
}

/**
 * The AI router. Selects the best available provider by priority, supports a
 * multi-tier fallback chain, and can run a multi-model consensus. It is the
 * single point through which the AI core reaches any model.
 */
@Injectable()
export class AiRouterService {
  private readonly providers: AIProvider[];

  constructor(
    openai: OpenAIProvider,
    anthropic: AnthropicProvider,
    gemini: GeminiProvider,
    deepseek: DeepSeekProvider,
    qwen: QwenProvider,
    llama: LlamaProvider,
  ) {
    this.providers = [openai, anthropic, gemini, deepseek, qwen, llama].sort(
      (a, b) => a.priority - b.priority,
    );
  }

  /** All registered providers, highest priority first. */
  listProviders(): AIProvider[] {
    return [...this.providers];
  }

  /** Provider metadata for the /ai/providers endpoint. */
  listProviderInfo(): ProviderInfo[] {
    return this.providers.map((p) => this.toInfo(p));
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.find((p) => p.name === name.toLowerCase());
  }

  async providerStatus(name: string): Promise<ProviderStatus | undefined> {
    const provider = this.getProvider(name);
    if (!provider) {
      return undefined;
    }
    return { ...this.toInfo(provider), available: await provider.isAvailable() };
  }

  /** Ordered list of currently-available providers (highest priority first). */
  async availableProviders(): Promise<AIProvider[]> {
    const flags = await Promise.all(this.providers.map((p) => p.isAvailable()));
    return this.providers.filter((_, i) => flags[i]);
  }

  /**
   * Route a single prompt to the best available provider, falling back through
   * the remaining providers on failure. Optionally pin a specific provider.
   */
  async route(
    query: string,
    context?: AICompletionContext,
    preferredProvider?: string,
  ): Promise<AIResponse> {
    let ordered = await this.availableProviders();
    if (preferredProvider) {
      const pinned = this.getProvider(preferredProvider);
      if (pinned) {
        ordered = [pinned, ...ordered.filter((p) => p.name !== pinned.name)];
      }
    }
    if (ordered.length === 0) {
      throw new ServiceUnavailableException('No AI providers are available');
    }
    return this.fallbackChain(ordered, query, context);
  }

  /** Route a conversational message list through the best available provider. */
  async chat(messages: AIMessage[], context?: AICompletionContext): Promise<AIResponse> {
    const ordered = await this.availableProviders();
    if (ordered.length === 0) {
      throw new ServiceUnavailableException('No AI providers are available');
    }
    let lastError: unknown;
    for (const provider of ordered) {
      try {
        return await provider.chat(messages, context);
      } catch (err) {
        lastError = err;
      }
    }
    throw new ServiceUnavailableException(
      `All AI providers failed: ${(lastError as Error)?.message ?? 'unknown error'}`,
    );
  }

  /** Try each provider in order until one succeeds. */
  async fallbackChain(
    providers: AIProvider[],
    query: string,
    context?: AICompletionContext,
  ): Promise<AIResponse> {
    let lastError: unknown;
    for (const provider of providers) {
      try {
        return await provider.complete(query, context);
      } catch (err) {
        lastError = err;
      }
    }
    throw new ServiceUnavailableException(
      `All AI providers failed: ${(lastError as Error)?.message ?? 'unknown error'}`,
    );
  }

  /**
   * Consensus query: consult the top N available providers and agree when at
   * least the threshold number return an equivalent answer.
   */
  async consensus(query: string, context?: AICompletionContext): Promise<AIConsensusResult> {
    const ordered = (await this.availableProviders()).slice(0, AI_CONSENSUS_SIZE);
    if (ordered.length === 0) {
      throw new ServiceUnavailableException('No AI providers are available');
    }

    const responses: AIResponse[] = [];
    for (const provider of ordered) {
      try {
        responses.push(await provider.complete(query, context));
      } catch {
        // A provider that fails simply does not contribute a vote.
      }
    }

    const groups = new Map<string, AIResponse[]>();
    for (const res of responses) {
      const key = normalize(res.content);
      const group = groups.get(key) ?? [];
      group.push(res);
      groups.set(key, group);
    }

    let winner: AIResponse[] = [];
    for (const group of groups.values()) {
      if (group.length > winner.length) {
        winner = group;
      }
    }

    const agreementCount = winner.length;
    const agreed = agreementCount >= AI_CONSENSUS_THRESHOLD;
    return {
      agreed,
      agreementCount,
      totalConsulted: responses.length,
      consensusContent: agreed && winner[0] ? winner[0].content : null,
      evidenceTier: AI_EVIDENCE_TIER,
      responses,
    };
  }

  private toInfo(provider: AIProvider): ProviderInfo {
    const configured = provider.isConfigured();
    return {
      name: provider.name,
      model: provider.model,
      priority: provider.priority,
      evidenceTier: provider.evidenceTier,
      configured,
      mode: configured ? 'live' : 'mock',
    };
  }
}

function normalize(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

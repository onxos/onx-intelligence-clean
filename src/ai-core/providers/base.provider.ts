import { AICompletionContext, AIMessage, AIProvider, AIResponse } from '../ai-core.types';
import { AI_DEFAULT_MAX_TOKENS, AI_DEFAULT_TEMPERATURE, AIProviderConfig } from '../ai-core.config';

/**
 * Base implementation shared by every provider. When real credentials are
 * present it performs an OpenAI/Anthropic/Google-compatible HTTP call; when
 * absent it serves a deterministic MOCK response so the router always has
 * capacity and tests remain hermetic (no network).
 */
export abstract class BaseAIProvider implements AIProvider {
  protected constructor(protected readonly config: AIProviderConfig) {}

  get name(): string {
    return this.config.name;
  }
  get model(): string {
    return this.config.model;
  }
  get priority(): number {
    return this.config.priority;
  }
  get evidenceTier(): string {
    return this.config.evidenceTier;
  }

  isConfigured(): boolean {
    return Boolean(process.env[this.config.apiKeyEnv]);
  }

  /** Mock providers still count as available — the engine must never be brainless. */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async complete(prompt: string, context?: AICompletionContext): Promise<AIResponse> {
    const messages: AIMessage[] = [];
    if (context?.system) {
      messages.push({ role: 'system', content: context.system });
    }
    messages.push({ role: 'user', content: prompt });
    return this.chat(messages, context);
  }

  async chat(messages: AIMessage[], context?: AICompletionContext): Promise<AIResponse> {
    const start = Date.now();
    if (!this.isConfigured()) {
      return this.mockResponse(messages, start);
    }
    const { content, tokensUsed } = await this.callProvider(messages, context);
    return {
      content,
      model: this.config.model,
      provider: this.config.name,
      tokensUsed,
      latencyMs: Date.now() - start,
      evidenceTier: this.config.evidenceTier,
      mock: false,
      timestamp: new Date(),
    };
  }

  /**
   * Deterministic mock. The answer core depends only on the prompt (not the
   * provider) so a consensus over multiple mock providers converges.
   */
  protected mockResponse(messages: AIMessage[], start: number): AIResponse {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const prompt = (lastUser?.content ?? '').trim();
    const content = `MOCK: provider not configured. Structured response for: "${truncate(prompt, 240)}"`;
    return {
      content,
      model: this.config.model,
      provider: this.config.name,
      tokensUsed: estimateTokens(prompt) + estimateTokens(content),
      latencyMs: Date.now() - start,
      evidenceTier: this.config.evidenceTier,
      mock: true,
      timestamp: new Date(),
    };
  }

  /** Real HTTP call. Overridable per dialect; default is OpenAI-compatible. */
  protected async callProvider(
    messages: AIMessage[],
    context?: AICompletionContext,
  ): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = process.env[this.config.apiKeyEnv] ?? '';
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: context?.temperature ?? AI_DEFAULT_TEMPERATURE,
        max_tokens: context?.maxTokens ?? AI_DEFAULT_MAX_TOKENS,
      }),
    });
    if (!res.ok) {
      throw new Error(`${this.config.name} request failed: ${res.status}`);
    }
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    const tokensUsed = Number(data?.usage?.total_tokens ?? estimateTokens(content));
    return { content, tokensUsed };
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text?.length ?? 0) / 4));
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

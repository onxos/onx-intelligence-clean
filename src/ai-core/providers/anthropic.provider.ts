import { Injectable } from '@nestjs/common';
import { BaseAIProvider, estimateTokens } from './base.provider';
import {
  AI_DEFAULT_MAX_TOKENS,
  AI_DEFAULT_TEMPERATURE,
  getProviderConfig,
} from '../ai-core.config';
import { AICompletionContext, AIMessage } from '../ai-core.types';

/** Anthropic Claude 3.5 Sonnet provider (native messages API). */
@Injectable()
export class AnthropicProvider extends BaseAIProvider {
  constructor() {
    super(getProviderConfig('anthropic')!);
  }

  protected async callProvider(
    messages: AIMessage[],
    context?: AICompletionContext,
  ): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = process.env[this.config.apiKeyEnv] ?? '';
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const nonSystem = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${this.config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: system || undefined,
        messages: nonSystem,
        temperature: context?.temperature ?? AI_DEFAULT_TEMPERATURE,
        max_tokens: context?.maxTokens ?? AI_DEFAULT_MAX_TOKENS,
      }),
    });
    if (!res.ok) {
      throw new Error(`anthropic request failed: ${res.status}`);
    }
    const data: any = await res.json();
    const content = Array.isArray(data?.content)
      ? data.content.map((c: any) => c?.text ?? '').join('')
      : '';
    const usage = data?.usage ?? {};
    const tokensUsed =
      Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0) || estimateTokens(content);
    return { content, tokensUsed };
  }
}

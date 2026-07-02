import { Injectable } from '@nestjs/common';
import { BaseAIProvider, estimateTokens } from './base.provider';
import {
  AI_DEFAULT_MAX_TOKENS,
  AI_DEFAULT_TEMPERATURE,
  getProviderConfig,
} from '../ai-core.config';
import { AICompletionContext, AIMessage } from '../ai-core.types';

/** Google Gemini 1.5 Pro provider (generateContent API). */
@Injectable()
export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super(getProviderConfig('gemini')!);
  }

  protected async callProvider(
    messages: AIMessage[],
    context?: AICompletionContext,
  ): Promise<{ content: string; tokensUsed: number }> {
    const apiKey = process.env[this.config.apiKeyEnv] ?? '';
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const res = await fetch(
      `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          generationConfig: {
            temperature: context?.temperature ?? AI_DEFAULT_TEMPERATURE,
            maxOutputTokens: context?.maxTokens ?? AI_DEFAULT_MAX_TOKENS,
          },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`gemini request failed: ${res.status}`);
    }
    const data: any = await res.json();
    const content =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
    const tokensUsed = Number(data?.usageMetadata?.totalTokenCount ?? estimateTokens(content));
    return { content, tokensUsed };
  }
}

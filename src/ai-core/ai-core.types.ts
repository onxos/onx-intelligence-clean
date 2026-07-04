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

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'qwen' | 'mistral';

export interface AIResponse {
  content: string;
  model: string;
  provider: AIProvider;
  tokensUsed: number;
  latencyMs: number;
  evidenceTier: string;
  mock?: boolean;
  timestamp?: Date;
}

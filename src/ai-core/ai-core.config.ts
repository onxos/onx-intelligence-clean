export const AI_EVIDENCE_TIER = 'simulated';

export const AI_DEFAULT_MAX_TOKENS = 4096;
export const AI_DEFAULT_TEMPERATURE = 0.7;

export interface AIProviderConfig {
  apiKeyEnv: string;
  baseUrl: string;
  defaultModel?: string;
}

export const AI_PROVIDER_CONFIG: Record<string, AIProviderConfig> = {
  openai: { apiKeyEnv: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet' },
  google: { apiKeyEnv: 'GOOGLE_AI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-1.5-pro' },
  deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  qwen: { apiKeyEnv: 'QWEN_API_KEY', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', defaultModel: 'qwen-max' },
  mistral: { apiKeyEnv: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large' },
};

export function getProviderConfig(providerName: string): AIProviderConfig | undefined {
  return AI_PROVIDER_CONFIG[providerName];
}

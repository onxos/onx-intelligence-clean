export const AI_EVIDENCE_TIER = 'simulated';

export const AI_PROVIDER_CONFIG = {
  openai: { apiKeyEnv: 'OPENAI_API_KEY', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrl: 'https://api.anthropic.com/v1' },
  google: { apiKeyEnv: 'GOOGLE_AI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com' },
  deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrl: 'https://api.deepseek.com/v1' },
  qwen: { apiKeyEnv: 'QWEN_API_KEY', baseUrl: 'https://dashscope.aliyuncs.com/api/v1' },
  mistral: { apiKeyEnv: 'MISTRAL_API_KEY', baseUrl: 'https://api.mistral.ai/v1' },
};

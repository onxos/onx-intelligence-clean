/**
 * Phase 1 — AI Integration Core: provider configuration.
 *
 * Six frontier providers mirror the SFIS HC-06 frontier set (gpt / claude /
 * gemini / deepseek / qwen / llama). Each is OpenAI-compatible where possible.
 * All are classified AC-05 evidence tier 4 (GeneralAI, weight 0.5) — external
 * AI is never treated as first-party institutional evidence.
 */

export interface AIProviderConfig {
  /** Canonical provider key (matches SFIS frontier model naming). */
  readonly name: string;
  /** Default model served by this provider. */
  readonly model: string;
  /** Selection priority (1 = highest). */
  readonly priority: number;
  /** AC-05 evidence tier for responses from this provider. */
  readonly evidenceTier: string;
  /** Environment variable holding the API key (or base URL for local models). */
  readonly apiKeyEnv: string;
  /** OpenAI-compatible base URL. */
  readonly baseUrl: string;
  /** API dialect — governs request/response shaping. */
  readonly dialect: 'openai' | 'anthropic' | 'google';
}

/** AC-05 evidence-tier weights (shared with the perception bus). */
export const AI_EVIDENCE_TIER = '4';
export const AI_EVIDENCE_TIER_WEIGHT = 0.5;

/** Default generation parameters. */
export const AI_DEFAULT_TEMPERATURE = 0.2;
export const AI_DEFAULT_MAX_TOKENS = 1024;

/** Number of models consulted for a consensus query. */
export const AI_CONSENSUS_SIZE = 3;
/** Minimum agreeing models required for a consensus (2 of 3). */
export const AI_CONSENSUS_THRESHOLD = 2;

export const AI_PROVIDER_CONFIGS: readonly AIProviderConfig[] = [
  {
    name: 'openai',
    model: 'gpt-4o',
    priority: 1,
    evidenceTier: AI_EVIDENCE_TIER,
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    dialect: 'openai',
  },
  {
    name: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    priority: 2,
    evidenceTier: AI_EVIDENCE_TIER,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com/v1',
    dialect: 'anthropic',
  },
  {
    name: 'gemini',
    model: 'gemini-1.5-pro',
    priority: 3,
    evidenceTier: AI_EVIDENCE_TIER,
    apiKeyEnv: 'GOOGLE_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    dialect: 'google',
  },
  {
    name: 'deepseek',
    model: 'deepseek-chat',
    priority: 4,
    evidenceTier: AI_EVIDENCE_TIER,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    dialect: 'openai',
  },
  {
    name: 'qwen',
    model: 'qwen-max',
    priority: 5,
    evidenceTier: AI_EVIDENCE_TIER,
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    dialect: 'openai',
  },
  {
    name: 'llama',
    model: 'llama3.1',
    priority: 6,
    evidenceTier: AI_EVIDENCE_TIER,
    apiKeyEnv: 'OLLAMA_BASE_URL',
    baseUrl: 'http://localhost:11434/v1',
    dialect: 'openai',
  },
] as const;

export function getProviderConfig(name: string): AIProviderConfig | undefined {
  return AI_PROVIDER_CONFIGS.find((p) => p.name === name.toLowerCase());
}

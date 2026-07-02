/**
 * Phase 1 — AI Integration Core: shared types.
 *
 * The AI core is the constitutional reasoning engine. Every provider is
 * uniform: it can `complete` a single prompt or `chat` over a message list,
 * and every response is evidence-tiered per AC-05 (external AI is GeneralAI —
 * tier 4). Providers self-report availability; when unconfigured they operate
 * in deterministic MOCK mode so the router always has capacity.
 */

/** A single chat message in the OpenAI-compatible format. */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Optional per-call context forwarded to a provider. */
export interface AICompletionContext {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  domain?: string;
  metadata?: Record<string, unknown>;
}

/** A normalized response from any provider. */
export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed: number;
  latencyMs: number;
  evidenceTier: string;
  /** True when the response was produced in MOCK mode (provider not configured). */
  mock: boolean;
  timestamp: Date;
}

/** The uniform provider contract. */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  readonly priority: number;
  readonly evidenceTier: string;
  /** True when the provider can currently serve a request (mock counts as available). */
  isAvailable(): Promise<boolean>;
  /** True when real credentials are configured (i.e. not running in mock mode). */
  isConfigured(): boolean;
  complete(prompt: string, context?: AICompletionContext): Promise<AIResponse>;
  chat(messages: AIMessage[], context?: AICompletionContext): Promise<AIResponse>;
}

/** Result of a multi-model consensus query. */
export interface AIConsensusResult {
  agreed: boolean;
  agreementCount: number;
  totalConsulted: number;
  consensusContent: string | null;
  evidenceTier: string;
  responses: AIResponse[];
}

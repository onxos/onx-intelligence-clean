// ============================================================
// AI DECISION LOG (H-7)
// ============================================================
// Every AI decision must be explainable and accountable. This module
// records, for each model invocation, the model id, sampling temperature,
// token usage, the evidence tier backing the answer, and a short
// reasoning basis. Records are kept in a bounded in-memory ring (queryable
// via the router) AND emitted as a structured log line so they survive in
// the deployment's log pipeline.
// ============================================================
import { logger } from "./structured-logger";

/** Evidence tier backing a decision (mirrors USFIP ISES tiers). */
export type EvidenceTier = "T1" | "T2" | "T3" | "T4";

export interface AiDecisionRecord {
  id: string;
  ts: string;
  operation: string; // e.g. "aiBrain.ask"
  userId: string;
  model: string;
  temperature: number;
  tokensUsed: number;
  evidenceTier: EvidenceTier;
  /** Machine/human readable basis for the decision. */
  reasoning: string;
  /** Optional extra structured detail. */
  meta?: Record<string, unknown>;
}

const RING_MAX = 500;
const ring: AiDecisionRecord[] = [];

/**
 * Derive an evidence tier from how much grounded context supported the
 * answer. More retrieved/owned context => higher tier (T1 best).
 */
export function deriveEvidenceTier(opts: {
  contextItems: number;
  grounded: boolean;
}): EvidenceTier {
  if (!opts.grounded) return "T4";
  if (opts.contextItems >= 5) return "T1";
  if (opts.contextItems >= 2) return "T2";
  if (opts.contextItems >= 1) return "T3";
  return "T4";
}

export function recordAiDecision(
  input: Omit<AiDecisionRecord, "id" | "ts">,
): AiDecisionRecord {
  const record: AiDecisionRecord = {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    ...input,
  };
  ring.push(record);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  logger.info("ai.decision", {
    operation: record.operation,
    userId: record.userId,
    model: record.model,
    temperature: record.temperature,
    tokensUsed: record.tokensUsed,
    evidenceTier: record.evidenceTier,
    reasoning: record.reasoning,
  });
  return record;
}

export function listAiDecisions(limit = 50): AiDecisionRecord[] {
  return ring.slice(-limit).reverse();
}

export function aiDecisionStats(): {
  total: number;
  byTier: Record<EvidenceTier, number>;
  avgTokens: number;
} {
  const byTier: Record<EvidenceTier, number> = { T1: 0, T2: 0, T3: 0, T4: 0 };
  let tokens = 0;
  for (const r of ring) {
    byTier[r.evidenceTier]++;
    tokens += r.tokensUsed;
  }
  return {
    total: ring.length,
    byTier,
    avgTokens: ring.length ? Math.round(tokens / ring.length) : 0,
  };
}

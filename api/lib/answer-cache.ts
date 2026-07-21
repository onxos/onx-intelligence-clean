/**
 * Answer Cache — knowledge sovereignty in practice.
 *
 * A learned answer must never be purchased twice. Before any paid provider
 * call, the agentic loop asks this store first:
 *   HIT  → answer served from ONX's own memory: 0 tokens, ~0ms, 0 cost.
 *   MISS → paid provider call; the completed answer is then written back so
 *          the next identical question is free forever.
 *
 * v1 matching is exact-after-normalization (zero-cost, deterministic):
 * Arabic diacritics/tatweel stripped, alef forms unified, whitespace
 * collapsed, lowercased. Semantic (embedding) matching is the v2 upgrade —
 * it costs a tiny embedding call, still ~100x cheaper than a full LLM run.
 *
 * Cache hits are metered as zero-token usage so the AI ledger shows the
 * savings honestly instead of hiding them.
 */
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 2,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  if (!schemaReady) {
    schemaReady = true;
    void pool
      .query(
        `CREATE TABLE IF NOT EXISTS onx_answer_cache (
          goal_norm TEXT PRIMARY KEY,
          goal TEXT NOT NULL,
          answer TEXT NOT NULL,
          model TEXT NOT NULL,
          hits INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_hit_at TIMESTAMPTZ
        )`,
      )
      .catch(() => undefined);
  }
  return pool;
}

/** Deterministic zero-cost normalization (Arabic-aware). */
export function normalizeGoal(goal: string): string {
  return goal
    .replace(/[ً-ْٰـ]/g, "") // diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا") // alef forms
    .replace(/ى/g, "ي") // alef maqsura → ya
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface CacheHit {
  goal: string;
  answer: string;
  model: string;
  hits: number;
  createdAt: string;
}

/** Look up a learned answer. Returns null on miss or any error (fail-open to paid path). */
export async function recallAnswer(goal: string): Promise<CacheHit | null> {
  try {
    const norm = normalizeGoal(goal);
    if (norm.length < 3) return null;
    const r = await getPool().query(
      `UPDATE onx_answer_cache SET hits = hits + 1, last_hit_at = now()
        WHERE goal_norm = $1
        RETURNING goal, answer, model, hits, created_at`,
      [norm],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { goal: row.goal, answer: row.answer, model: row.model, hits: row.hits, createdAt: row.created_at };
  } catch {
    return null; // cache failure must never block the paid path
  }
}

/** Store a completed answer so the next identical question is free. Never throws. */
export async function learnAnswer(goal: string, answer: string, model: string): Promise<void> {
  try {
    const norm = normalizeGoal(goal);
    if (norm.length < 3 || !answer || answer.length < 10) return;
    await getPool().query(
      `INSERT INTO onx_answer_cache (goal_norm, goal, answer, model)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (goal_norm) DO UPDATE SET answer = $3, model = $4, goal = $2`,
      [norm, goal, answer, model],
    );
  } catch { /* learning must never break the answering path */ }
}

export async function cacheStats(): Promise<{ entries: number; totalHits: number; tokensSavedEstimate: number }> {
  try {
    const r = await getPool().query(
      `SELECT count(*)::int AS entries, COALESCE(sum(hits),0)::int AS total_hits FROM onx_answer_cache`,
    );
    const entries = r.rows[0]?.entries ?? 0;
    const totalHits = r.rows[0]?.total_hits ?? 0;
    // Honest estimate: average observed agentic run ≈ 600 tokens; shown as estimate, not fact.
    return { entries, totalHits, tokensSavedEstimate: totalHits * 600 };
  } catch {
    return { entries: 0, totalHits: 0, tokensSavedEstimate: 0 };
  }
}

export async function clearCache(): Promise<{ cleared: number }> {
  const r = await getPool().query(`DELETE FROM onx_answer_cache`);
  return { cleared: r.rowCount ?? 0 };
}

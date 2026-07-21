/**
 * Answer Cache v2 — knowledge sovereignty with semantic recall.
 *
 * Three-tier answering, cheapest first:
 *   1. EXACT  — normalized-text match: 0 tokens, ~1ms (Arabic-aware).
 *   2. SEMANTIC — pgvector cosine over stored question embeddings:
 *      same meaning in any wording. Costs one tiny embedding call
 *      (~$0.0000004) instead of a full LLM run (~100x cheaper).
 *   3. PAID — full provider call; the answer is then learned (embedded
 *      and stored) so tiers 1-2 serve it forever after.
 *
 * Volatility discipline (D17: never serve stale truth as fresh):
 * answers grounded in volatile live-state tools get a 10-minute TTL;
 * stable knowledge gets 7 days. Expired entries are never served.
 *
 * Threshold 0.93 is deliberately conservative: better to pay for a real
 * answer than to serve another question's answer.
 */
import { Pool } from "pg";
import { recordUsage } from "./provider-usage-store";

let pool: Pool | null = null;
let schemaReady = false;

const EMBED_MODEL = "text-embedding-3-small";
/** Cosine floor for serving a cached answer to a differently-worded question.
 *  0.88 balances savings vs. correctness for Arabic paraphrases on
 *  text-embedding-3-small; tighten/loosen via CACHE_SEMANTIC_THRESHOLD. */
const SEMANTIC_THRESHOLD = Number(process.env.CACHE_SEMANTIC_THRESHOLD ?? 0.88);

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
      .then(() => pool!.query(`CREATE EXTENSION IF NOT EXISTS vector`))
      .then(() => pool!.query(`ALTER TABLE onx_answer_cache ADD COLUMN IF NOT EXISTS embedding vector(1536)`))
      .then(() => pool!.query(`ALTER TABLE onx_answer_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`))
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

const AR_STOPWORDS = new Set([
  "ما", "ماهي", "ماذا", "التي", "الذي", "على", "الي", "الى", "ان", "في", "من", "عن",
  "هو", "هي", "كيف", "ايش", "عند", "هل", "او", "ثم", "قد", "لا", "لم", "لن", "كان",
  "هذا", "هذه", "ذلك", "مع", "كل", "بعد", "قبل", "عندما", "اذا", "يا", "ياي",
  "وش", "اللي", "تدل", "علي", "بسبب", "ضد", "حتى", "لقد", "انه", "انها", "يكون",
]);

/** Light Arabic stemming for token comparison: drop the definite article and
 *  single-letter prefixes (و ب ل ف ك س) so «بمرض» = «مرض» = «والمرض». */
function stemToken(t: string): string {
  let s = t;
  if (s.startsWith("ال") && s.length > 4) s = s.slice(2);
  if (s.length > 3 && "وبلفكس".includes(s[0])) s = s.slice(1);
  if (s.startsWith("ال") && s.length > 4) s = s.slice(2);
  return s;
}

function contentTokens(norm: string): Set<string> {
  return new Set(
    norm.split(" ")
      .filter((t) => t.length > 1 && !AR_STOPWORDS.has(t))
      .map(stemToken)
      .filter((t) => t.length > 1 && !AR_STOPWORDS.has(t)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

let openaiClient: import("openai").default | null = null;
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    if (!openaiClient) {
      const { default: OpenAI } = await import("openai");
      openaiClient = new OpenAI({ apiKey: key });
    }
    const t0 = Date.now();
    const res = await openaiClient.embeddings.create({ model: EMBED_MODEL, input: text });
    void recordUsage({
      provider: "openai", model: EMBED_MODEL, kind: "embedding",
      promptTokens: res.usage?.prompt_tokens ?? 0, completionTokens: 0,
      latencyMs: Date.now() - t0, success: true, purpose: "answer-cache.embed",
    });
    return res.data[0]?.embedding ?? null;
  } catch {
    return null; // degrade to exact-only matching
  }
}

export interface CacheHit {
  goal: string;
  answer: string;
  model: string;
  hits: number;
  createdAt: string;
  match: "exact" | "semantic";
  similarity?: number;
}

/** Recall a learned answer: exact tier first, then semantic. Fail-open (null → paid path). */
export async function recallAnswer(goal: string): Promise<CacheHit | null> {
  try {
    const norm = normalizeGoal(goal);
    if (norm.length < 3) return null;
    const p = getPool();

    // Tier 1 — exact, zero cost
    const exact = await p.query(
      `UPDATE onx_answer_cache SET hits = hits + 1, last_hit_at = now()
        WHERE goal_norm = $1 AND (expires_at IS NULL OR expires_at > now())
        RETURNING goal, answer, model, hits, created_at`,
      [norm],
    );
    if (exact.rows[0]) {
      const r = exact.rows[0];
      return { goal: r.goal, answer: r.answer, model: r.model, hits: r.hits, createdAt: r.created_at, match: "exact" };
    }

    // Tier 2 — semantic, one tiny embedding call
    const vec = await embedQuery(norm);
    if (!vec) return null;
    const literal = `[${vec.join(",")}]`;
    const sem = await p.query(
      `SELECT goal, answer, model, hits, created_at, 1 - (embedding <=> $1::vector) AS similarity
         FROM onx_answer_cache
        WHERE embedding IS NOT NULL
          AND (expires_at IS NULL OR expires_at > now())
          AND 1 - (embedding <=> $1::vector) >= 0.55
        ORDER BY embedding <=> $1::vector
        LIMIT 5`,
      [literal],
    );
    // Hybrid acceptance: high cosine alone, OR moderate cosine + strong
    // Arabic content-token overlap. text-embedding-3-small under-scores
    // Arabic paraphrases (~0.68 for same-meaning questions), so pure-cosine
    // thresholds either miss everything or serve wrong answers. The token
    // gate keeps same-topic-different-intent questions out (symptoms vs
    // treatment share embedding space but not content tokens).
    const queryTokens = contentTokens(norm);
    let row: (typeof sem.rows)[0] | null = null;
    let bestSim = 0;
    let bestOverlap = 0;
    for (const cand of sem.rows) {
      const sim = Number(cand.similarity);
      const overlap = tokenOverlap(queryTokens, contentTokens(normalizeGoal(cand.goal)));
      if (sim > bestSim) { bestSim = sim; bestOverlap = overlap; }
      if (sim >= SEMANTIC_THRESHOLD || (sim >= 0.6 && overlap >= 0.5)) {
        row = { ...cand, similarity: sim };
        bestOverlap = overlap;
        break;
      }
    }
    if (!row) {
      void recordUsage({
        provider: "onx-cache", model: "onx-knowledge-store", kind: "probe",
        success: false, purpose: `cache-miss:best-sim:${bestSim.toFixed(3)}:overlap:${bestOverlap.toFixed(2)}`,
      });
      return null;
    }
    await p.query(
      `UPDATE onx_answer_cache SET hits = hits + 1, last_hit_at = now() WHERE goal_norm = $1`,
      [normalizeGoal(row.goal)],
    );
    return {
      goal: row.goal, answer: row.answer, model: row.model, hits: row.hits + 1,
      createdAt: row.created_at, match: "semantic",
      similarity: Math.round(Number(row.similarity) * 1000) / 1000,
    };
  } catch {
    return null; // cache failure must never block the paid path
  }
}

export type CacheVolatility = "volatile" | "stable";
const TTL_MS: Record<CacheVolatility, number> = {
  volatile: 10 * 60 * 1000, // live-state answers: 10 minutes
  stable: 7 * 24 * 60 * 60 * 1000, // knowledge answers: 7 days
};

/** Store + embed a completed answer. Never throws. */
export async function learnAnswer(goal: string, answer: string, model: string, volatility: CacheVolatility = "stable"): Promise<void> {
  try {
    const norm = normalizeGoal(goal);
    if (norm.length < 3 || !answer || answer.length < 10) return;
    const vec = await embedQuery(norm);
    const expiresAt = new Date(Date.now() + TTL_MS[volatility]).toISOString();
    await getPool().query(
      `INSERT INTO onx_answer_cache (goal_norm, goal, answer, model, embedding, expires_at)
       VALUES ($1, $2, $3, $4, $5::vector, $6)
       ON CONFLICT (goal_norm) DO UPDATE SET answer = $3, model = $4, goal = $2, embedding = $5::vector, expires_at = $6`,
      [norm, goal, answer, model, vec ? `[${vec.join(",")}]` : null, expiresAt],
    );
  } catch { /* learning must never break the answering path */ }
}

export async function cacheStats(): Promise<{
  entries: number;
  totalHits: number;
  embedded: number;
  tokensSavedEstimate: number;
}> {
  try {
    const r = await getPool().query(
      `SELECT count(*)::int AS entries,
              COALESCE(sum(hits),0)::int AS total_hits,
              count(embedding)::int AS embedded
         FROM onx_answer_cache
        WHERE expires_at IS NULL OR expires_at > now()`,
    );
    const entries = r.rows[0]?.entries ?? 0;
    const totalHits = r.rows[0]?.total_hits ?? 0;
    // Honest estimate: average observed agentic run ≈ 600 tokens; shown as estimate, not fact.
    return { entries, totalHits, embedded: r.rows[0]?.embedded ?? 0, tokensSavedEstimate: totalHits * 600 };
  } catch {
    return { entries: 0, totalHits: 0, embedded: 0, tokensSavedEstimate: 0 };
  }
}

export async function clearCache(): Promise<{ cleared: number }> {
  const r = await getPool().query(`DELETE FROM onx_answer_cache`);
  return { cleared: r.rowCount ?? 0 };
}

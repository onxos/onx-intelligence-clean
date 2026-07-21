/**
 * Provider Usage Store — the evidence base for Provider Capital (EV-06 lineage).
 *
 * Every real call to any AI provider (Kimi, OpenAI, Gemini, ...) is recorded
 * here: tokens, latency, success, purpose. Capital dimensions are computed
 * FROM THIS EVIDENCE — never asserted. No rows → no score, honestly.
 *
 * Cost policy (fail-honest): costUsd is computed only for models whose price
 * is known (PRICE_TABLE below, public list prices, dated) or overridden via
 * PROVIDER_PRICE_OVERRIDES (JSON env). Unknown price → costUsd = null and the
 * commercial dimension reports "insufficient evidence" instead of a number.
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
        `CREATE TABLE IF NOT EXISTS onx_provider_usage (
          id BIGSERIAL PRIMARY KEY,
          ts TIMESTAMPTZ NOT NULL DEFAULT now(),
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          kind TEXT NOT NULL,
          prompt_tokens INT NOT NULL DEFAULT 0,
          completion_tokens INT NOT NULL DEFAULT 0,
          cost_usd DOUBLE PRECISION,
          latency_ms INT,
          success BOOLEAN NOT NULL,
          purpose TEXT NOT NULL DEFAULT '',
          error TEXT
        )`,
      )
      .then(() =>
        pool!.query(`CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_ts ON onx_provider_usage (provider, ts DESC)`),
      )
      .catch(() => undefined);
  }
  return pool;
}

/** Public list prices per 1M tokens [input, output], as of 2026-01 — ESTIMATE.
 *  Only models with verified public pricing appear here. Override/extend via
 *  PROVIDER_PRICE_OVERRIDES='{"model":[in,out]}'. */
const PRICE_TABLE: Record<string, { in: number; out: number; asOf: string }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6, asOf: "2026-01" },
  // Official Moonshot platform pricing (cache-miss input / output), verified 2026-07-21
  "kimi-k2.6": { in: 0.95, out: 4.0, asOf: "2026-07" },
  "kimi-k2.7-code": { in: 0.95, out: 4.0, asOf: "2026-07" },
};

function priceFor(model: string): { in: number; out: number } | null {
  try {
    const raw = process.env.PROVIDER_PRICE_OVERRIDES;
    if (raw) {
      const ov = JSON.parse(raw) as Record<string, [number, number]>;
      if (Array.isArray(ov[model])) return { in: ov[model][0], out: ov[model][1] };
    }
  } catch { /* ignore bad override json */ }
  const p = PRICE_TABLE[model];
  return p ? { in: p.in, out: p.out } : null;
}

export interface UsageInput {
  provider: string;
  model: string;
  kind: "chat" | "image" | "video" | "audio" | "embedding" | "probe";
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  success: boolean;
  purpose?: string;
  error?: string;
}

/** Record one provider call. Never throws — metering must not break the call it measures. */
export async function recordUsage(u: UsageInput): Promise<void> {
  try {
    const price = priceFor(u.model);
    const cost =
      price && (u.promptTokens || u.completionTokens)
        ? ((u.promptTokens ?? 0) / 1e6) * price.in + ((u.completionTokens ?? 0) / 1e6) * price.out
        : null;
    await getPool().query(
      `INSERT INTO onx_provider_usage (provider, model, kind, prompt_tokens, completion_tokens, cost_usd, latency_ms, success, purpose, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        u.provider, u.model, u.kind,
        u.promptTokens ?? 0, u.completionTokens ?? 0,
        cost, u.latencyMs ?? null, u.success, u.purpose ?? "", u.error ?? null,
      ],
    );
  } catch { /* metering must never break the measured path */ }
}

export interface ProviderAggregate {
  provider: string;
  calls: number;
  successes: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  totalTokens: number;
  totalCostUsd: number | null;
  pricedCalls: number;
  kinds: string[];
  purposes: string[];
  firstSeen: string;
  lastSeen: string;
}

export async function usageAggregates(sinceHours = 24 * 30): Promise<ProviderAggregate[]> {
  const p = getPool();
  const r = await p.query(
    `SELECT provider,
            count(*)::int AS calls,
            count(*) FILTER (WHERE success)::int AS successes,
            avg(latency_ms) AS avg_latency,
            sum(prompt_tokens + completion_tokens)::bigint AS total_tokens,
            sum(cost_usd) AS total_cost,
            count(cost_usd)::int AS priced_calls,
            array_agg(DISTINCT kind) AS kinds,
            array_agg(DISTINCT purpose) FILTER (WHERE purpose <> '') AS purposes,
            min(ts) AS first_seen, max(ts) AS last_seen
       FROM onx_provider_usage
      WHERE ts > now() - ($1 || ' hours')::interval
      GROUP BY provider ORDER BY calls DESC`,
    [sinceHours],
  );
  return r.rows.map((row) => ({
    provider: row.provider,
    calls: row.calls,
    successes: row.successes,
    successRate: row.calls > 0 ? row.successes / row.calls : null,
    avgLatencyMs: row.avg_latency != null ? Math.round(row.avg_latency) : null,
    totalTokens: Number(row.total_tokens ?? 0),
    totalCostUsd: row.total_cost != null ? Math.round(row.total_cost * 1e6) / 1e6 : null,
    pricedCalls: row.priced_calls,
    kinds: row.kinds ?? [],
    purposes: (row.purposes ?? []).slice(0, 12),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }));
}

export async function recentUsage(limit = 50): Promise<Array<Record<string, unknown>>> {
  const p = getPool();
  const r = await p.query(
    `SELECT id, ts, provider, model, kind, prompt_tokens, completion_tokens, cost_usd, latency_ms, success, purpose, error
       FROM onx_provider_usage ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

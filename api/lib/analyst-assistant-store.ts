import { Pool } from "pg";
import type { AnalystInsightDraft } from "./analyst-assistant-engine";

export type AnalystPersistence = "POSTGRES" | "UNPERSISTED";
export type AnalystOutcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const ANALYST_RETENTION_KEEP = 1000;

export interface AnalystInsightRecord extends AnalystInsightDraft {
  id: number;
  outcome: AnalystOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryInsights: AnalystInsightRecord[] = [];
let memoryIdCounter = 0;

export function __resetAnalystAssistantStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryInsights.length = 0;
  memoryIdCounter = 0;
}

export function isAnalystPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("ANALYST_ASSISTANT_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
    }
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 5,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS onx_analyst_assistant_insights (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    domain VARCHAR(16) NOT NULL,
    verdict VARCHAR(32) NOT NULL,
    rationale TEXT NOT NULL,
    evidence JSONB NOT NULL,
    authority_level VARCHAR(4) NOT NULL,
    authority_decision VARCHAR(16) NOT NULL,
    authority_reason TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    eval_score REAL NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    outcome VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    outcome_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  )`);
  schemaReady = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToRecord(r: any): AnalystInsightRecord {
  return {
    id: Number(r.id),
    question: r.question,
    domain: r.domain,
    verdict: r.verdict,
    rationale: r.rationale,
    evidence: typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence,
    authorityLevel: r.authority_level,
    authorityDecision: r.authority_decision,
    authorityReason: r.authority_reason,
    status: r.status,
    evalScore: Number(r.eval_score),
    fingerprint: r.fingerprint,
    outcome: r.outcome,
    outcomeNote: r.outcome_note ?? null,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    resolvedAt: r.resolved_at
      ? r.resolved_at instanceof Date
        ? r.resolved_at.toISOString()
        : String(r.resolved_at)
      : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RecordAnalystResult {
  id: number;
  persistence: AnalystPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordAnalystInsight(
  draft: AnalystInsightDraft,
): Promise<RecordAnalystResult> {
  if (isAnalystPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_analyst_assistant_insights
          (question, domain, verdict, rationale, evidence, authority_level, authority_decision,
           authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          draft.question,
          draft.domain,
          draft.verdict,
          draft.rationale,
          JSON.stringify(draft.evidence),
          draft.authorityLevel,
          draft.authorityDecision,
          draft.authorityReason,
          draft.status,
          draft.evalScore,
          draft.fingerprint,
        ],
      );
      const del = await client.query(
        `DELETE FROM onx_analyst_assistant_insights
         WHERE id <= COALESCE(
          (SELECT id FROM onx_analyst_assistant_insights ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [ANALYST_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: ANALYST_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: AnalystInsightRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryInsights.push(rec);
  let pruned = 0;
  while (memoryInsights.length > ANALYST_RETENTION_KEEP) {
    memoryInsights.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: ANALYST_RETENTION_KEEP,
  };
}

export interface AnalystHistoryQuery {
  domain?: "BUSINESS" | "FINANCE" | "OPERATIONS" | "RISK";
  limit?: number;
}

export interface AnalystHistoryResult {
  persistence: AnalystPersistence;
  count: number;
  insights: AnalystInsightRecord[];
  retentionKeep: number;
}

export async function getAnalystHistory(
  query: AnalystHistoryQuery = {},
): Promise<AnalystHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(ANALYST_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isAnalystPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.domain
      ? await p.query(
          `SELECT * FROM onx_analyst_assistant_insights WHERE domain = $1 ORDER BY id DESC LIMIT $2`,
          [query.domain, limit],
        )
      : await p.query(`SELECT * FROM onx_analyst_assistant_insights ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      insights: rows.rows.map(rowToRecord),
      retentionKeep: ANALYST_RETENTION_KEEP,
    };
  }
  const filtered = query.domain ? memoryInsights.filter((d) => d.domain === query.domain) : memoryInsights;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    insights: newestFirst,
    retentionKeep: ANALYST_RETENTION_KEEP,
  };
}

export interface AnalystOutcomeResult {
  found: boolean;
  persistence: AnalystPersistence;
  insight: AnalystInsightRecord | null;
}

export async function recordAnalystOutcome(
  id: number,
  outcome: Exclude<AnalystOutcome, "PENDING">,
  note?: string,
): Promise<AnalystOutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`ANALYST_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isAnalystPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_analyst_assistant_insights
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", insight: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_analyst_assistant_insights WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      insight: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryInsights.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", insight: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", insight: rec };
}

export interface AnalystAccuracy {
  persistence: AnalystPersistence;
  domain: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getAnalystAccuracy(
  domain?: "BUSINESS" | "FINANCE" | "OPERATIONS" | "RISK",
): Promise<AnalystAccuracy> {
  if (isAnalystPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = domain
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_analyst_assistant_insights
           WHERE domain = $1 GROUP BY outcome`,
          [domain],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_analyst_assistant_insights GROUP BY outcome`);
    let confirmed = 0;
    let rejected = 0;
    let deferred = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "CONFIRMED") confirmed = Number(r.n);
      else if (r.outcome === "REJECTED") rejected = Number(r.n);
      else if (r.outcome === "DEFERRED") deferred = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = confirmed + rejected + deferred;
    return {
      persistence: "POSTGRES",
      domain: domain ?? null,
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
    };
  }
  const domainRows = domain ? memoryInsights.filter((d) => d.domain === domain) : memoryInsights;
  const confirmed = domainRows.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = domainRows.filter((d) => d.outcome === "REJECTED").length;
  const deferred = domainRows.filter((d) => d.outcome === "DEFERRED").length;
  const pending = domainRows.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  return {
    persistence: "UNPERSISTED",
    domain: domain ?? null,
    total: domainRows.length,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
  };
}


import { Pool } from "pg";
import type { FounderAdviceDraft } from "./founder-companion-engine";

export type FounderPersistence = "POSTGRES" | "UNPERSISTED";
export type FounderOutcome = "PENDING" | "APPLIED" | "REJECTED" | "DEFERRED";
export const FOUNDER_RETENTION_KEEP = 1000;

export interface FounderAdviceRecord extends FounderAdviceDraft {
  id: number;
  outcome: FounderOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryAdvices: FounderAdviceRecord[] = [];
let memoryIdCounter = 0;

export function __resetFounderCompanionStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryAdvices.length = 0;
  memoryIdCounter = 0;
}

export function isFounderPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("FOUNDER_COMPANION_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_founder_companion_advice (
    id SERIAL PRIMARY KEY,
    prompt TEXT NOT NULL,
    impact VARCHAR(16) NOT NULL,
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
function rowToRecord(r: any): FounderAdviceRecord {
  return {
    id: Number(r.id),
    prompt: r.prompt,
    impact: r.impact,
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

export interface RecordFounderResult {
  id: number;
  persistence: FounderPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordFounderAdvice(
  draft: FounderAdviceDraft,
): Promise<RecordFounderResult> {
  if (isFounderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_founder_companion_advice
          (prompt, impact, verdict, rationale, evidence, authority_level, authority_decision,
           authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          draft.prompt,
          draft.impact,
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
        `DELETE FROM onx_founder_companion_advice
         WHERE id <= COALESCE(
          (SELECT id FROM onx_founder_companion_advice ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [FOUNDER_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: FOUNDER_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: FounderAdviceRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryAdvices.push(rec);
  let pruned = 0;
  while (memoryAdvices.length > FOUNDER_RETENTION_KEEP) {
    memoryAdvices.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: FOUNDER_RETENTION_KEEP,
  };
}

export interface FounderHistoryQuery {
  impact?: "OPERATIONAL" | "EXECUTIVE" | "STRATEGIC";
  limit?: number;
}

export interface FounderHistoryResult {
  persistence: FounderPersistence;
  count: number;
  advice: FounderAdviceRecord[];
  retentionKeep: number;
}

export async function getFounderAdviceHistory(
  query: FounderHistoryQuery = {},
): Promise<FounderHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(FOUNDER_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isFounderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.impact
      ? await p.query(
          `SELECT * FROM onx_founder_companion_advice WHERE impact = $1 ORDER BY id DESC LIMIT $2`,
          [query.impact, limit],
        )
      : await p.query(`SELECT * FROM onx_founder_companion_advice ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      advice: rows.rows.map(rowToRecord),
      retentionKeep: FOUNDER_RETENTION_KEEP,
    };
  }
  const filtered = query.impact ? memoryAdvices.filter((d) => d.impact === query.impact) : memoryAdvices;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    advice: newestFirst,
    retentionKeep: FOUNDER_RETENTION_KEEP,
  };
}

export interface FounderOutcomeResult {
  found: boolean;
  persistence: FounderPersistence;
  advice: FounderAdviceRecord | null;
}

export async function recordFounderOutcome(
  id: number,
  outcome: Exclude<FounderOutcome, "PENDING">,
  note?: string,
): Promise<FounderOutcomeResult> {
  if (outcome !== "APPLIED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`FOUNDER_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isFounderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_founder_companion_advice
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", advice: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_founder_companion_advice WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      advice: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryAdvices.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", advice: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", advice: rec };
}

export interface FounderAccuracy {
  persistence: FounderPersistence;
  impact: string | null;
  total: number;
  resolved: number;
  applied: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getFounderAccuracy(impact?: "OPERATIONAL" | "EXECUTIVE" | "STRATEGIC"): Promise<FounderAccuracy> {
  if (isFounderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = impact
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_founder_companion_advice
           WHERE impact = $1 GROUP BY outcome`,
          [impact],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_founder_companion_advice GROUP BY outcome`);
    let applied = 0;
    let rejected = 0;
    let deferred = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "APPLIED") applied = Number(r.n);
      else if (r.outcome === "REJECTED") rejected = Number(r.n);
      else if (r.outcome === "DEFERRED") deferred = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = applied + rejected + deferred;
    return {
      persistence: "POSTGRES",
      impact: impact ?? null,
      total: resolved + pending,
      resolved,
      applied,
      rejected,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((applied / resolved) * 10000) / 10000,
    };
  }
  const scope = impact ? memoryAdvices.filter((d) => d.impact === impact) : memoryAdvices;
  const applied = scope.filter((d) => d.outcome === "APPLIED").length;
  const rejected = scope.filter((d) => d.outcome === "REJECTED").length;
  const deferred = scope.filter((d) => d.outcome === "DEFERRED").length;
  const pending = scope.filter((d) => d.outcome === "PENDING").length;
  const resolved = applied + rejected + deferred;
  return {
    persistence: "UNPERSISTED",
    impact: impact ?? null,
    total: scope.length,
    resolved,
    applied,
    rejected,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((applied / resolved) * 10000) / 10000,
  };
}


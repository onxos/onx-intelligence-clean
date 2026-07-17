// ============================================================
// TITAN DECISION STORE (Phase P) — durable operational memory
//
// Persists every Titan Decision Engine outcome so the 5 Titans have
// real, restart-surviving state (not an in-memory Map). Follows
// api/lib/truth-ledger.ts LITERALLY: lazy Pool, CREATE TABLE IF NOT
// EXISTS, ssl for render.com hosts, bounded retention pruned at write
// time. Without a postgres DATABASE_URL it falls back to an in-memory
// ring HONESTLY declared UNPERSISTED (lost on restart).
//
// This is the durable + memory + outcome-feedback substrate; the
// deterministic decision logic lives in titan-engine.ts.
// ============================================================
import { Pool } from "pg";
import type { TitanDecisionDraft } from "./titan-engine";

export type TitanPersistence = "POSTGRES" | "UNPERSISTED";

// Bounded retention: decisions accumulate operationally. Keep the newest
// N, pruning older rows atomically at write time (same pattern/justification
// as truth-ledger.ts LEDGER_RETENTION_KEEP). 1000 is a generous operational
// window while keeping the table bounded. Disclosed on the read surface.
export const TITAN_DECISION_RETENTION_KEEP = 1000;

export type TitanOutcome = "PENDING" | "CONFIRMED" | "REJECTED";

export interface TitanDecisionRecord extends TitanDecisionDraft {
  id: number;
  outcome: TitanOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;

// In-memory fallback ring (newest last), bounded by the same window.
const memoryDecisions: TitanDecisionRecord[] = [];
let memoryIdCounter = 0;

export function __resetTitanDecisionStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryDecisions.length = 0;
  memoryIdCounter = 0;
}

export function isTitanPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("TITAN_DECISION_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_titan_decisions (
    id SERIAL PRIMARY KEY,
    titan_id VARCHAR(32) NOT NULL,
    titan_name VARCHAR(64) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    subject TEXT NOT NULL,
    query TEXT NOT NULL,
    verdict VARCHAR(32) NOT NULL,
    rationale TEXT NOT NULL,
    evidence JSONB NOT NULL,
    authority_level VARCHAR(4) NOT NULL,
    authority_decision VARCHAR(16) NOT NULL,
    authority_reason TEXT NOT NULL,
    status VARCHAR(24) NOT NULL,
    has_veto BOOLEAN NOT NULL,
    eval_score REAL NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    outcome VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    outcome_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
  )`);
  schemaReady = true;
}

export interface RecordDecisionResult {
  id: number;
  fingerprint: string;
  persistence: TitanPersistence;
  pruned: number;
  retentionKeep: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToRecord(r: any): TitanDecisionRecord {
  return {
    id: Number(r.id),
    titanId: r.titan_id,
    titanName: r.titan_name,
    domain: r.domain,
    subject: r.subject,
    query: r.query,
    verdict: r.verdict,
    rationale: r.rationale,
    evidence: typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence,
    authorityLevel: r.authority_level,
    authorityDecision: r.authority_decision,
    authorityReason: r.authority_reason,
    status: r.status,
    hasVeto: Boolean(r.has_veto),
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

/** Persist a decision draft. Returns id + measured persistence mode. */
export async function recordTitanDecision(
  draft: TitanDecisionDraft,
): Promise<RecordDecisionResult> {
  if (isTitanPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_titan_decisions
          (titan_id, titan_name, domain, subject, query, verdict, rationale, evidence,
           authority_level, authority_decision, authority_reason, status, has_veto,
           eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          draft.titanId,
          draft.titanName,
          draft.domain,
          draft.subject,
          draft.query,
          draft.verdict,
          draft.rationale,
          JSON.stringify(draft.evidence),
          draft.authorityLevel,
          draft.authorityDecision,
          draft.authorityReason,
          draft.status,
          draft.hasVeto,
          draft.evalScore,
          draft.fingerprint,
        ],
      );
      const del = await client.query(
        `DELETE FROM onx_titan_decisions
         WHERE id <= COALESCE(
           (SELECT id FROM onx_titan_decisions ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [TITAN_DECISION_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        fingerprint: draft.fingerprint,
        persistence: "POSTGRES",
        pruned: del.rowCount ?? 0,
        retentionKeep: TITAN_DECISION_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const record: TitanDecisionRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryDecisions.push(record);
  let pruned = 0;
  while (memoryDecisions.length > TITAN_DECISION_RETENTION_KEEP) {
    memoryDecisions.shift();
    pruned++;
  }
  return {
    id: record.id,
    fingerprint: record.fingerprint,
    persistence: "UNPERSISTED",
    pruned,
    retentionKeep: TITAN_DECISION_RETENTION_KEEP,
  };
}

export interface TitanDecisionsQuery {
  titanId?: string;
  limit?: number;
}

export interface TitanDecisionsResult {
  persistence: TitanPersistence;
  count: number;
  decisions: TitanDecisionRecord[]; // newest first
  retentionKeep: number;
}

/** Durable read-back of decisions, newest first, optionally per-titan. */
export async function getTitanDecisions(
  q: TitanDecisionsQuery = {},
): Promise<TitanDecisionsResult> {
  const limit =
    typeof q.limit === "number" && Number.isFinite(q.limit)
      ? Math.min(TITAN_DECISION_RETENTION_KEEP, Math.max(1, Math.floor(q.limit)))
      : 50;

  if (isTitanPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = q.titanId
      ? await p.query(
          `SELECT * FROM onx_titan_decisions WHERE titan_id = $1 ORDER BY id DESC LIMIT $2`,
          [q.titanId, limit],
        )
      : await p.query(
          `SELECT * FROM onx_titan_decisions ORDER BY id DESC LIMIT $1`,
          [limit],
        );
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      decisions: rows.rows.map(rowToRecord),
      retentionKeep: TITAN_DECISION_RETENTION_KEEP,
    };
  }

  const filtered = q.titanId
    ? memoryDecisions.filter((d) => d.titanId === q.titanId)
    : memoryDecisions;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    decisions: newestFirst,
    retentionKeep: TITAN_DECISION_RETENTION_KEEP,
  };
}

export async function getTitanDecisionById(
  id: number,
): Promise<TitanDecisionRecord | null> {
  if (isTitanPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = await p.query(`SELECT * FROM onx_titan_decisions WHERE id = $1`, [id]);
    return rows.rows[0] ? rowToRecord(rows.rows[0]) : null;
  }
  return memoryDecisions.find((d) => d.id === id) ?? null;
}

export interface RecordOutcomeResult {
  found: boolean;
  persistence: TitanPersistence;
  decision: TitanDecisionRecord | null;
}

/**
 * Outcome feedback: mark a decision CONFIRMED or REJECTED. Idempotent on
 * the note; only PENDING decisions are resolved (fail-closed on double
 * resolution — a resolved decision is not silently overwritten).
 */
export async function recordTitanOutcome(
  id: number,
  outcome: Exclude<TitanOutcome, "PENDING">,
  note?: string,
): Promise<RecordOutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED") {
    throw new Error(`TITAN_OUTCOME_INVALID: ${String(outcome)}`);
  }

  if (isTitanPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_titan_decisions
         SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", decision: rowToRecord(upd.rows[0]) };
    }
    // Distinguish not-found from already-resolved.
    const existing = await p.query(`SELECT * FROM onx_titan_decisions WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      decision: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }

  const rec = memoryDecisions.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", decision: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", decision: rec };
}

export interface TitanAccuracy {
  persistence: TitanPersistence;
  titanId: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  pending: number;
  /** confirmed / resolved, 0 when none resolved (never NaN). */
  accuracy: number;
}

/** Deterministic evaluation metric recomputed from durable outcomes. */
export async function getTitanAccuracy(titanId?: string): Promise<TitanAccuracy> {
  if (isTitanPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = titanId
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_titan_decisions
             WHERE titan_id = $1 GROUP BY outcome`,
          [titanId],
        )
      : await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_titan_decisions GROUP BY outcome`,
        );
    let confirmed = 0;
    let rejected = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "CONFIRMED") confirmed = Number(r.n);
      else if (r.outcome === "REJECTED") rejected = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = confirmed + rejected;
    return {
      persistence: "POSTGRES",
      titanId: titanId ?? null,
      total: confirmed + rejected + pending,
      resolved,
      confirmed,
      rejected,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
    };
  }

  const scope = titanId
    ? memoryDecisions.filter((d) => d.titanId === titanId)
    : memoryDecisions;
  const confirmed = scope.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = scope.filter((d) => d.outcome === "REJECTED").length;
  const pending = scope.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected;
  return {
    persistence: "UNPERSISTED",
    titanId: titanId ?? null,
    total: scope.length,
    resolved,
    confirmed,
    rejected,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
  };
}

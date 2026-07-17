import { Pool } from "pg";
import type { D12TransitionDraft } from "./d12-learning-engine";

export type D12Persistence = "POSTGRES" | "UNPERSISTED";
export type D12Outcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const D12_RETENTION_KEEP = 1000;

export interface D12TransitionRecord extends D12TransitionDraft {
  id: number;
  outcome: D12Outcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryTransitions: D12TransitionRecord[] = [];
let memoryIdCounter = 0;

export function __resetD12LearningStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryTransitions.length = 0;
  memoryIdCounter = 0;
}

export function isD12PersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("D12_LEARNING_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_d12_learning_transitions (
    id SERIAL PRIMARY KEY,
    object_id TEXT NOT NULL,
    from_state VARCHAR(16) NOT NULL,
    to_state VARCHAR(16) NOT NULL,
    trigger VARCHAR(32) NOT NULL,
    rationale TEXT NOT NULL,
    verdict VARCHAR(32) NOT NULL,
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
function rowToRecord(r: any): D12TransitionRecord {
  return {
    id: Number(r.id),
    objectId: r.object_id,
    fromState: r.from_state,
    toState: r.to_state,
    trigger: r.trigger,
    rationale: r.rationale,
    verdict: r.verdict,
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

export interface RecordD12Result {
  id: number;
  persistence: D12Persistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordD12Transition(
  draft: D12TransitionDraft,
): Promise<RecordD12Result> {
  if (isD12PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_d12_learning_transitions
          (object_id, from_state, to_state, trigger, rationale, verdict, evidence,
           authority_level, authority_decision, authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          draft.objectId,
          draft.fromState,
          draft.toState,
          draft.trigger,
          draft.rationale,
          draft.verdict,
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
        `DELETE FROM onx_d12_learning_transitions
         WHERE id <= COALESCE(
          (SELECT id FROM onx_d12_learning_transitions ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [D12_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: D12_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: D12TransitionRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryTransitions.push(rec);
  let pruned = 0;
  while (memoryTransitions.length > D12_RETENTION_KEEP) {
    memoryTransitions.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: D12_RETENTION_KEEP,
  };
}

export interface D12HistoryQuery {
  objectId?: string;
  toState?: string;
  limit?: number;
}

export interface D12HistoryResult {
  persistence: D12Persistence;
  count: number;
  transitions: D12TransitionRecord[];
  retentionKeep: number;
}

export async function getD12History(
  query: D12HistoryQuery = {},
): Promise<D12HistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(D12_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isD12PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    let rows;
    if (query.objectId && query.toState) {
      rows = await p.query(
        `SELECT * FROM onx_d12_learning_transitions
         WHERE object_id = $1 AND to_state = $2
         ORDER BY id DESC LIMIT $3`,
        [query.objectId, query.toState, limit],
      );
    } else if (query.objectId) {
      rows = await p.query(
        `SELECT * FROM onx_d12_learning_transitions
         WHERE object_id = $1
         ORDER BY id DESC LIMIT $2`,
        [query.objectId, limit],
      );
    } else if (query.toState) {
      rows = await p.query(
        `SELECT * FROM onx_d12_learning_transitions
         WHERE to_state = $1
         ORDER BY id DESC LIMIT $2`,
        [query.toState, limit],
      );
    } else {
      rows = await p.query(`SELECT * FROM onx_d12_learning_transitions ORDER BY id DESC LIMIT $1`, [limit]);
    }
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      transitions: rows.rows.map(rowToRecord),
      retentionKeep: D12_RETENTION_KEEP,
    };
  }

  let filtered = memoryTransitions;
  if (query.objectId) filtered = filtered.filter((d) => d.objectId === query.objectId);
  if (query.toState) filtered = filtered.filter((d) => d.toState === query.toState);
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    transitions: newestFirst,
    retentionKeep: D12_RETENTION_KEEP,
  };
}

export interface D12OutcomeResult {
  found: boolean;
  persistence: D12Persistence;
  transition: D12TransitionRecord | null;
}

export async function recordD12Outcome(
  id: number,
  outcome: Exclude<D12Outcome, "PENDING">,
  note?: string,
): Promise<D12OutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`D12_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isD12PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_d12_learning_transitions
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", transition: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_d12_learning_transitions WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      transition: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryTransitions.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", transition: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", transition: rec };
}

export interface D12Accuracy {
  persistence: D12Persistence;
  toState: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getD12Accuracy(toState?: string): Promise<D12Accuracy> {
  if (isD12PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = toState
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d12_learning_transitions
           WHERE to_state = $1 GROUP BY outcome`,
          [toState],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_d12_learning_transitions GROUP BY outcome`);
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
      toState: toState ?? null,
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
    };
  }

  const rows = toState ? memoryTransitions.filter((d) => d.toState === toState) : memoryTransitions;
  const confirmed = rows.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = rows.filter((d) => d.outcome === "REJECTED").length;
  const deferred = rows.filter((d) => d.outcome === "DEFERRED").length;
  const pending = rows.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  return {
    persistence: "UNPERSISTED",
    toState: toState ?? null,
    total: rows.length,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
  };
}


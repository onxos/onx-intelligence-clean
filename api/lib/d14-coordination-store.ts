import { Pool } from "pg";
import type { D14CoordinationDraft } from "./d14-coordination-engine";

export type D14Persistence = "POSTGRES" | "UNPERSISTED";
export type D14Outcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const D14_RETENTION_KEEP = 1000;

export interface D14CoordinationRecord extends D14CoordinationDraft {
  id: number;
  outcome: D14Outcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memory: D14CoordinationRecord[] = [];
let memoryId = 0;

export function __resetD14CoordinationStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memory.length = 0;
  memoryId = 0;
}

export function isD14PersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("D14_COORDINATION_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_d14_coordination_decisions (
    id SERIAL PRIMARY KEY,
    topic TEXT NOT NULL,
    context VARCHAR(32) NOT NULL,
    route VARCHAR(16) NOT NULL,
    conflict_level INTEGER NOT NULL,
    decision JSONB NOT NULL,
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
function rowToRecord(r: any): D14CoordinationRecord {
  return {
    id: Number(r.id),
    topic: r.topic,
    context: r.context,
    route: r.route,
    conflictLevel: Number(r.conflict_level),
    decision: typeof r.decision === "string" ? JSON.parse(r.decision) : r.decision,
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

export interface RecordD14Result {
  id: number;
  persistence: D14Persistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordD14Coordination(
  draft: D14CoordinationDraft,
): Promise<RecordD14Result> {
  if (isD14PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_d14_coordination_decisions
          (topic, context, route, conflict_level, decision, verdict, rationale, evidence, authority_level,
           authority_decision, authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          draft.topic,
          draft.context,
          draft.route,
          draft.conflictLevel,
          JSON.stringify(draft.decision),
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
        `DELETE FROM onx_d14_coordination_decisions
         WHERE id <= COALESCE(
          (SELECT id FROM onx_d14_coordination_decisions ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [D14_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: D14_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: D14CoordinationRecord = {
    ...draft,
    id: ++memoryId,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memory.push(rec);
  let pruned = 0;
  while (memory.length > D14_RETENTION_KEEP) {
    memory.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: D14_RETENTION_KEEP,
  };
}

export interface D14HistoryQuery {
  context?: "FOUNDER" | "CLINIC" | "PERSONAL" | "BUILDER" | "OPERATOR" | "ANALYST" | "PLATFORM";
  limit?: number;
}

export interface D14HistoryResult {
  persistence: D14Persistence;
  count: number;
  decisions: D14CoordinationRecord[];
  retentionKeep: number;
}

export async function getD14History(query: D14HistoryQuery = {}): Promise<D14HistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(D14_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isD14PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.context
      ? await p.query(
          `SELECT * FROM onx_d14_coordination_decisions WHERE context = $1 ORDER BY id DESC LIMIT $2`,
          [query.context, limit],
        )
      : await p.query(`SELECT * FROM onx_d14_coordination_decisions ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      decisions: rows.rows.map(rowToRecord),
      retentionKeep: D14_RETENTION_KEEP,
    };
  }
  const filtered = query.context ? memory.filter((d) => d.context === query.context) : memory;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    decisions: newestFirst,
    retentionKeep: D14_RETENTION_KEEP,
  };
}

export interface D14OutcomeResult {
  found: boolean;
  persistence: D14Persistence;
  decision: D14CoordinationRecord | null;
}

export async function recordD14Outcome(
  id: number,
  outcome: Exclude<D14Outcome, "PENDING">,
  note?: string,
): Promise<D14OutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`D14_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isD14PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_d14_coordination_decisions
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", decision: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_d14_coordination_decisions WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      decision: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memory.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", decision: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", decision: rec };
}

export interface D14Accuracy {
  persistence: D14Persistence;
  context: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getD14Accuracy(
  context?: "FOUNDER" | "CLINIC" | "PERSONAL" | "BUILDER" | "OPERATOR" | "ANALYST" | "PLATFORM",
): Promise<D14Accuracy> {
  if (isD14PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = context
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d14_coordination_decisions
           WHERE context = $1 GROUP BY outcome`,
          [context],
        )
      : await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d14_coordination_decisions GROUP BY outcome`,
        );
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
    const accuracy = resolved > 0 ? confirmed / resolved : 0;
    return {
      persistence: "POSTGRES",
      context: context ?? null,
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy,
    };
  }

  const filtered = context ? memory.filter((d) => d.context === context) : memory;
  const total = filtered.length;
  const confirmed = filtered.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = filtered.filter((d) => d.outcome === "REJECTED").length;
  const deferred = filtered.filter((d) => d.outcome === "DEFERRED").length;
  const pending = filtered.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  const accuracy = resolved > 0 ? confirmed / resolved : 0;
  return {
    persistence: "UNPERSISTED",
    context: context ?? null,
    total,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy,
  };
}

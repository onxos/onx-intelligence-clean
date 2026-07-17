import { Pool } from "pg";
import type { D13CapitalDraft } from "./d13-capital-engine";

export type D13Persistence = "POSTGRES" | "UNPERSISTED";
export type D13Outcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const D13_RETENTION_KEEP = 1000;

export interface D13CapitalRecord extends D13CapitalDraft {
  id: number;
  outcome: D13Outcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryRecords: D13CapitalRecord[] = [];
let memoryIdCounter = 0;

export function __resetD13CapitalStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryRecords.length = 0;
  memoryIdCounter = 0;
}

export function isD13PersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("D13_CAPITAL_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_d13_capital_records (
    id SERIAL PRIMARY KEY,
    signal_id TEXT NOT NULL,
    amount NUMERIC(18,4) NOT NULL,
    category VARCHAR(24) NOT NULL,
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
function rowToRecord(r: any): D13CapitalRecord {
  return {
    id: Number(r.id),
    signalId: r.signal_id,
    amount: Number(r.amount),
    category: r.category,
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

export interface RecordD13Result {
  id: number;
  persistence: D13Persistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordD13Capital(
  draft: D13CapitalDraft,
): Promise<RecordD13Result> {
  if (isD13PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_d13_capital_records
          (signal_id, amount, category, rationale, verdict, evidence, authority_level,
           authority_decision, authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          draft.signalId,
          draft.amount,
          draft.category,
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
        `DELETE FROM onx_d13_capital_records
         WHERE id <= COALESCE(
          (SELECT id FROM onx_d13_capital_records ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [D13_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: D13_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: D13CapitalRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryRecords.push(rec);
  let pruned = 0;
  while (memoryRecords.length > D13_RETENTION_KEEP) {
    memoryRecords.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: D13_RETENTION_KEEP,
  };
}

export interface D13HistoryQuery {
  category?: "WISDOM" | "JUDGMENT" | "UNDERSTANDING" | "PATTERN" | "PROCESS";
  limit?: number;
}

export interface D13HistoryResult {
  persistence: D13Persistence;
  count: number;
  records: D13CapitalRecord[];
  retentionKeep: number;
}

export async function getD13History(
  query: D13HistoryQuery = {},
): Promise<D13HistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(D13_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isD13PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.category
      ? await p.query(
          `SELECT * FROM onx_d13_capital_records WHERE category = $1 ORDER BY id DESC LIMIT $2`,
          [query.category, limit],
        )
      : await p.query(`SELECT * FROM onx_d13_capital_records ORDER BY id DESC LIMIT $1`, [limit]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      records: rows.rows.map(rowToRecord),
      retentionKeep: D13_RETENTION_KEEP,
    };
  }
  const filtered = query.category ? memoryRecords.filter((d) => d.category === query.category) : memoryRecords;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    records: newestFirst,
    retentionKeep: D13_RETENTION_KEEP,
  };
}

export interface D13OutcomeResult {
  found: boolean;
  persistence: D13Persistence;
  record: D13CapitalRecord | null;
}

export async function recordD13Outcome(
  id: number,
  outcome: Exclude<D13Outcome, "PENDING">,
  note?: string,
): Promise<D13OutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`D13_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isD13PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_d13_capital_records
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", record: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_d13_capital_records WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      record: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryRecords.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", record: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", record: rec };
}

export interface D13Accuracy {
  persistence: D13Persistence;
  category: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getD13Accuracy(
  category?: "WISDOM" | "JUDGMENT" | "UNDERSTANDING" | "PATTERN" | "PROCESS",
): Promise<D13Accuracy> {
  if (isD13PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = category
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d13_capital_records
           WHERE category = $1 GROUP BY outcome`,
          [category],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_d13_capital_records GROUP BY outcome`);
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
      category: category ?? null,
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
    };
  }
  const rows = category ? memoryRecords.filter((d) => d.category === category) : memoryRecords;
  const confirmed = rows.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = rows.filter((d) => d.outcome === "REJECTED").length;
  const deferred = rows.filter((d) => d.outcome === "DEFERRED").length;
  const pending = rows.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  return {
    persistence: "UNPERSISTED",
    category: category ?? null,
    total: rows.length,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
  };
}


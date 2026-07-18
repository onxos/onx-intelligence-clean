import { Pool } from "pg";
import type { D15VerificationDraft } from "./d15-proof-engine";

export type D15Persistence = "POSTGRES" | "UNPERSISTED";
export type D15Outcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const D15_RETENTION_KEEP = 1000;

export interface D15VerificationRecord extends D15VerificationDraft {
  id: number;
  outcome: D15Outcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memory: D15VerificationRecord[] = [];
let memoryId = 0;

export function __resetD15ProofStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memory.length = 0;
  memoryId = 0;
}

export function isD15PersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("D15_PROOF_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_d15_proof_verifications (
    id SERIAL PRIMARY KEY,
    suite_id VARCHAR(120) NOT NULL,
    mode VARCHAR(24) NOT NULL,
    target TEXT NOT NULL,
    stress_level INTEGER NOT NULL,
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
function rowToRecord(r: any): D15VerificationRecord {
  return {
    id: Number(r.id),
    suiteId: r.suite_id,
    mode: r.mode,
    target: r.target,
    stressLevel: Number(r.stress_level),
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

export interface RecordD15Result {
  id: number;
  persistence: D15Persistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordD15Verification(
  draft: D15VerificationDraft,
): Promise<RecordD15Result> {
  if (isD15PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_d15_proof_verifications
          (suite_id, mode, target, stress_level, decision, verdict, rationale, evidence, authority_level,
           authority_decision, authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          draft.suiteId,
          draft.mode,
          draft.target,
          draft.stressLevel,
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
        `DELETE FROM onx_d15_proof_verifications
         WHERE id <= COALESCE(
          (SELECT id FROM onx_d15_proof_verifications ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [D15_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: D15_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: D15VerificationRecord = {
    ...draft,
    id: ++memoryId,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memory.push(rec);
  let pruned = 0;
  while (memory.length > D15_RETENTION_KEEP) {
    memory.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: D15_RETENTION_KEEP,
  };
}

export interface D15HistoryQuery {
  mode?: "CRITERIA" | "CONTRADICTION" | "STRESS" | "FAULT";
  limit?: number;
}

export interface D15HistoryResult {
  persistence: D15Persistence;
  count: number;
  verifications: D15VerificationRecord[];
  retentionKeep: number;
}

export async function getD15History(query: D15HistoryQuery = {}): Promise<D15HistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(D15_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isD15PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.mode
      ? await p.query(
          `SELECT * FROM onx_d15_proof_verifications WHERE mode = $1 ORDER BY id DESC LIMIT $2`,
          [query.mode, limit],
        )
      : await p.query(`SELECT * FROM onx_d15_proof_verifications ORDER BY id DESC LIMIT $1`, [limit]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      verifications: rows.rows.map(rowToRecord),
      retentionKeep: D15_RETENTION_KEEP,
    };
  }
  const filtered = query.mode ? memory.filter((d) => d.mode === query.mode) : memory;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    verifications: newestFirst,
    retentionKeep: D15_RETENTION_KEEP,
  };
}

export interface D15OutcomeResult {
  found: boolean;
  persistence: D15Persistence;
  verification: D15VerificationRecord | null;
}

export async function recordD15Outcome(
  id: number,
  outcome: Exclude<D15Outcome, "PENDING">,
  note?: string,
): Promise<D15OutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`D15_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isD15PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_d15_proof_verifications
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", verification: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_d15_proof_verifications WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      verification: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memory.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", verification: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", verification: rec };
}

export interface D15Accuracy {
  persistence: D15Persistence;
  mode: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getD15Accuracy(
  mode?: "CRITERIA" | "CONTRADICTION" | "STRESS" | "FAULT",
): Promise<D15Accuracy> {
  if (isD15PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = mode
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d15_proof_verifications
           WHERE mode = $1 GROUP BY outcome`,
          [mode],
        )
      : await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d15_proof_verifications GROUP BY outcome`,
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
      mode: mode ?? null,
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy,
    };
  }
  const filtered = mode ? memory.filter((d) => d.mode === mode) : memory;
  const total = filtered.length;
  const confirmed = filtered.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = filtered.filter((d) => d.outcome === "REJECTED").length;
  const deferred = filtered.filter((d) => d.outcome === "DEFERRED").length;
  const pending = filtered.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  const accuracy = resolved > 0 ? confirmed / resolved : 0;
  return {
    persistence: "UNPERSISTED",
    mode: mode ?? null,
    total,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy,
  };
}

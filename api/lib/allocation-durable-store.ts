import { Pool } from "pg";
import type { DurableAllocationDraft } from "./allocation-durable-engine";

export type AllocationPersistence = "POSTGRES" | "UNPERSISTED";
export type AllocationOutcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const ALLOCATION_RETENTION_KEEP = 1000;

export interface DurableAllocationRecord extends DurableAllocationDraft {
  id: number;
  outcome: AllocationOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memory: DurableAllocationRecord[] = [];
let memoryId = 0;

export function __resetAllocationDurableStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memory.length = 0;
  memoryId = 0;
}

export function isAllocationPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("ALLOCATION_DURABLE_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_allocation_decisions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    request JSONB NOT NULL,
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
function rowToRecord(r: any): DurableAllocationRecord {
  return {
    id: Number(r.id),
    question: r.question,
    request: typeof r.request === "string" ? JSON.parse(r.request) : r.request,
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

export interface RecordAllocationResult {
  id: number;
  persistence: AllocationPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordAllocationDecision(
  draft: DurableAllocationDraft,
): Promise<RecordAllocationResult> {
  if (isAllocationPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_allocation_decisions
          (question, request, decision, verdict, rationale, evidence, authority_level, authority_decision,
           authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          draft.question,
          JSON.stringify(draft.request),
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
        `DELETE FROM onx_allocation_decisions
         WHERE id <= COALESCE(
          (SELECT id FROM onx_allocation_decisions ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [ALLOCATION_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: ALLOCATION_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: DurableAllocationRecord = {
    ...draft,
    id: ++memoryId,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memory.push(rec);
  let pruned = 0;
  while (memory.length > ALLOCATION_RETENTION_KEEP) {
    memory.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: ALLOCATION_RETENTION_KEEP,
  };
}

export interface AllocationHistoryQuery {
  limit?: number;
}

export interface AllocationHistoryResult {
  persistence: AllocationPersistence;
  count: number;
  decisions: DurableAllocationRecord[];
  retentionKeep: number;
}

export async function getAllocationHistory(
  query: AllocationHistoryQuery = {},
): Promise<AllocationHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(ALLOCATION_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isAllocationPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = await p.query(`SELECT * FROM onx_allocation_decisions ORDER BY id DESC LIMIT $1`, [
      limit,
    ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      decisions: rows.rows.map(rowToRecord),
      retentionKeep: ALLOCATION_RETENTION_KEEP,
    };
  }
  const newestFirst = [...memory].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    decisions: newestFirst,
    retentionKeep: ALLOCATION_RETENTION_KEEP,
  };
}

export interface AllocationOutcomeResult {
  found: boolean;
  persistence: AllocationPersistence;
  decision: DurableAllocationRecord | null;
}

export async function recordAllocationOutcome(
  id: number,
  outcome: Exclude<AllocationOutcome, "PENDING">,
  note?: string,
): Promise<AllocationOutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`ALLOCATION_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isAllocationPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_allocation_decisions
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", decision: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_allocation_decisions WHERE id = $1`, [id]);
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

export interface AllocationAccuracy {
  persistence: AllocationPersistence;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getAllocationAccuracy(): Promise<AllocationAccuracy> {
  if (isAllocationPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_allocation_decisions GROUP BY outcome`);
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
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
    };
  }
  const confirmed = memory.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = memory.filter((d) => d.outcome === "REJECTED").length;
  const deferred = memory.filter((d) => d.outcome === "DEFERRED").length;
  const pending = memory.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  return {
    persistence: "UNPERSISTED",
    total: memory.length,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
  };
}


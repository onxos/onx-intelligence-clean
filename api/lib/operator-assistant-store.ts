import { Pool } from "pg";
import type { OperatorActionDraft } from "./operator-assistant-engine";

export type OperatorPersistence = "POSTGRES" | "UNPERSISTED";
export type OperatorOutcome = "PENDING" | "MITIGATED" | "ESCALATED" | "DEFERRED";
export const OPERATOR_RETENTION_KEEP = 1000;

export interface OperatorActionRecord extends OperatorActionDraft {
  id: number;
  outcome: OperatorOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryActions: OperatorActionRecord[] = [];
let memoryIdCounter = 0;

export function __resetOperatorAssistantStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryActions.length = 0;
  memoryIdCounter = 0;
}

export function isOperatorPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("OPERATOR_ASSISTANT_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_operator_assistant_actions (
    id SERIAL PRIMARY KEY,
    incident TEXT NOT NULL,
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
function rowToRecord(r: any): OperatorActionRecord {
  return {
    id: Number(r.id),
    incident: r.incident,
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

export interface RecordOperatorResult {
  id: number;
  persistence: OperatorPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordOperatorAction(
  draft: OperatorActionDraft,
): Promise<RecordOperatorResult> {
  if (isOperatorPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_operator_assistant_actions
          (incident, domain, verdict, rationale, evidence, authority_level, authority_decision,
           authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          draft.incident,
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
        `DELETE FROM onx_operator_assistant_actions
         WHERE id <= COALESCE(
          (SELECT id FROM onx_operator_assistant_actions ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [OPERATOR_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: OPERATOR_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: OperatorActionRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryActions.push(rec);
  let pruned = 0;
  while (memoryActions.length > OPERATOR_RETENTION_KEEP) {
    memoryActions.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: OPERATOR_RETENTION_KEEP,
  };
}

export interface OperatorHistoryQuery {
  domain?: "INCIDENT" | "RELIABILITY" | "SECURITY" | "COST";
  limit?: number;
}

export interface OperatorHistoryResult {
  persistence: OperatorPersistence;
  count: number;
  actions: OperatorActionRecord[];
  retentionKeep: number;
}

export async function getOperatorHistory(
  query: OperatorHistoryQuery = {},
): Promise<OperatorHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(OPERATOR_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isOperatorPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.domain
      ? await p.query(
          `SELECT * FROM onx_operator_assistant_actions WHERE domain = $1 ORDER BY id DESC LIMIT $2`,
          [query.domain, limit],
        )
      : await p.query(`SELECT * FROM onx_operator_assistant_actions ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      actions: rows.rows.map(rowToRecord),
      retentionKeep: OPERATOR_RETENTION_KEEP,
    };
  }
  const filtered = query.domain ? memoryActions.filter((d) => d.domain === query.domain) : memoryActions;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    actions: newestFirst,
    retentionKeep: OPERATOR_RETENTION_KEEP,
  };
}

export interface OperatorOutcomeResult {
  found: boolean;
  persistence: OperatorPersistence;
  action: OperatorActionRecord | null;
}

export async function recordOperatorOutcome(
  id: number,
  outcome: Exclude<OperatorOutcome, "PENDING">,
  note?: string,
): Promise<OperatorOutcomeResult> {
  if (outcome !== "MITIGATED" && outcome !== "ESCALATED" && outcome !== "DEFERRED") {
    throw new Error(`OPERATOR_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isOperatorPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_operator_assistant_actions
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", action: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_operator_assistant_actions WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      action: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryActions.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", action: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", action: rec };
}

export interface OperatorAccuracy {
  persistence: OperatorPersistence;
  domain: string | null;
  total: number;
  resolved: number;
  mitigated: number;
  escalated: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getOperatorAccuracy(
  domain?: "INCIDENT" | "RELIABILITY" | "SECURITY" | "COST",
): Promise<OperatorAccuracy> {
  if (isOperatorPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = domain
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_operator_assistant_actions
           WHERE domain = $1 GROUP BY outcome`,
          [domain],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_operator_assistant_actions GROUP BY outcome`);
    let mitigated = 0;
    let escalated = 0;
    let deferred = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "MITIGATED") mitigated = Number(r.n);
      else if (r.outcome === "ESCALATED") escalated = Number(r.n);
      else if (r.outcome === "DEFERRED") deferred = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = mitigated + escalated + deferred;
    return {
      persistence: "POSTGRES",
      domain: domain ?? null,
      total: resolved + pending,
      resolved,
      mitigated,
      escalated,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((mitigated / resolved) * 10000) / 10000,
    };
  }
  const domainRows = domain ? memoryActions.filter((d) => d.domain === domain) : memoryActions;
  const mitigated = domainRows.filter((d) => d.outcome === "MITIGATED").length;
  const escalated = domainRows.filter((d) => d.outcome === "ESCALATED").length;
  const deferred = domainRows.filter((d) => d.outcome === "DEFERRED").length;
  const pending = domainRows.filter((d) => d.outcome === "PENDING").length;
  const resolved = mitigated + escalated + deferred;
  return {
    persistence: "UNPERSISTED",
    domain: domain ?? null,
    total: domainRows.length,
    resolved,
    mitigated,
    escalated,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((mitigated / resolved) * 10000) / 10000,
  };
}


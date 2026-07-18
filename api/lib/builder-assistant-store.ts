import { Pool } from "pg";
import type { BuilderPlanDraft } from "./builder-assistant-engine";

export type BuilderPersistence = "POSTGRES" | "UNPERSISTED";
export type BuilderOutcome = "PENDING" | "SHIPPED" | "ROLLED_BACK" | "DEFERRED";
export const BUILDER_RETENTION_KEEP = 1000;

export interface BuilderPlanRecord extends BuilderPlanDraft {
  id: number;
  outcome: BuilderOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryPlans: BuilderPlanRecord[] = [];
let memoryIdCounter = 0;

export function __resetBuilderAssistantStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryPlans.length = 0;
  memoryIdCounter = 0;
}

export function isBuilderPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("BUILDER_ASSISTANT_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_builder_assistant_plans (
    id SERIAL PRIMARY KEY,
    task TEXT NOT NULL,
    scope VARCHAR(16) NOT NULL,
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
function rowToRecord(r: any): BuilderPlanRecord {
  return {
    id: Number(r.id),
    task: r.task,
    scope: r.scope,
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

export interface RecordBuilderResult {
  id: number;
  persistence: BuilderPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordBuilderPlan(
  draft: BuilderPlanDraft,
): Promise<RecordBuilderResult> {
  if (isBuilderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_builder_assistant_plans
          (task, scope, verdict, rationale, evidence, authority_level, authority_decision,
           authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          draft.task,
          draft.scope,
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
        `DELETE FROM onx_builder_assistant_plans
         WHERE id <= COALESCE(
          (SELECT id FROM onx_builder_assistant_plans ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [BUILDER_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: BUILDER_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: BuilderPlanRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryPlans.push(rec);
  let pruned = 0;
  while (memoryPlans.length > BUILDER_RETENTION_KEEP) {
    memoryPlans.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: BUILDER_RETENTION_KEEP,
  };
}

export interface BuilderHistoryQuery {
  scope?: "FEATURE" | "ARCHITECTURE" | "REFACTOR" | "DELIVERY";
  limit?: number;
}

export interface BuilderHistoryResult {
  persistence: BuilderPersistence;
  count: number;
  plans: BuilderPlanRecord[];
  retentionKeep: number;
}

export async function getBuilderHistory(
  query: BuilderHistoryQuery = {},
): Promise<BuilderHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(BUILDER_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isBuilderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.scope
      ? await p.query(
          `SELECT * FROM onx_builder_assistant_plans WHERE scope = $1 ORDER BY id DESC LIMIT $2`,
          [query.scope, limit],
        )
      : await p.query(`SELECT * FROM onx_builder_assistant_plans ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      plans: rows.rows.map(rowToRecord),
      retentionKeep: BUILDER_RETENTION_KEEP,
    };
  }
  const filtered = query.scope ? memoryPlans.filter((d) => d.scope === query.scope) : memoryPlans;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    plans: newestFirst,
    retentionKeep: BUILDER_RETENTION_KEEP,
  };
}

export interface BuilderOutcomeResult {
  found: boolean;
  persistence: BuilderPersistence;
  plan: BuilderPlanRecord | null;
}

export async function recordBuilderOutcome(
  id: number,
  outcome: Exclude<BuilderOutcome, "PENDING">,
  note?: string,
): Promise<BuilderOutcomeResult> {
  if (outcome !== "SHIPPED" && outcome !== "ROLLED_BACK" && outcome !== "DEFERRED") {
    throw new Error(`BUILDER_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isBuilderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_builder_assistant_plans
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", plan: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_builder_assistant_plans WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      plan: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryPlans.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", plan: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", plan: rec };
}

export interface BuilderAccuracy {
  persistence: BuilderPersistence;
  scope: string | null;
  total: number;
  resolved: number;
  shipped: number;
  rolledBack: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getBuilderAccuracy(
  scope?: "FEATURE" | "ARCHITECTURE" | "REFACTOR" | "DELIVERY",
): Promise<BuilderAccuracy> {
  if (isBuilderPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = scope
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_builder_assistant_plans
           WHERE scope = $1 GROUP BY outcome`,
          [scope],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_builder_assistant_plans GROUP BY outcome`);
    let shipped = 0;
    let rolledBack = 0;
    let deferred = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "SHIPPED") shipped = Number(r.n);
      else if (r.outcome === "ROLLED_BACK") rolledBack = Number(r.n);
      else if (r.outcome === "DEFERRED") deferred = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = shipped + rolledBack + deferred;
    return {
      persistence: "POSTGRES",
      scope: scope ?? null,
      total: resolved + pending,
      resolved,
      shipped,
      rolledBack,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((shipped / resolved) * 10000) / 10000,
    };
  }
  const scopeRows = scope ? memoryPlans.filter((d) => d.scope === scope) : memoryPlans;
  const shipped = scopeRows.filter((d) => d.outcome === "SHIPPED").length;
  const rolledBack = scopeRows.filter((d) => d.outcome === "ROLLED_BACK").length;
  const deferred = scopeRows.filter((d) => d.outcome === "DEFERRED").length;
  const pending = scopeRows.filter((d) => d.outcome === "PENDING").length;
  const resolved = shipped + rolledBack + deferred;
  return {
    persistence: "UNPERSISTED",
    scope: scope ?? null,
    total: scopeRows.length,
    resolved,
    shipped,
    rolledBack,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((shipped / resolved) * 10000) / 10000,
  };
}


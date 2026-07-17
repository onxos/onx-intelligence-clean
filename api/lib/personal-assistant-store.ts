import { Pool } from "pg";
import type { PersonalPlanDraft } from "./personal-assistant-engine";

export type PersonalPersistence = "POSTGRES" | "UNPERSISTED";
export type PersonalOutcome = "PENDING" | "COMPLETED" | "ABANDONED" | "DEFERRED";
export const PERSONAL_RETENTION_KEEP = 1000;

export interface PersonalPlanRecord extends PersonalPlanDraft {
  id: number;
  outcome: PersonalOutcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryPlans: PersonalPlanRecord[] = [];
let memoryIdCounter = 0;

export function __resetPersonalAssistantStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryPlans.length = 0;
  memoryIdCounter = 0;
}

export function isPersonalPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("PERSONAL_ASSISTANT_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_personal_assistant_plans (
    id SERIAL PRIMARY KEY,
    request TEXT NOT NULL,
    context VARCHAR(16) NOT NULL,
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
function rowToRecord(r: any): PersonalPlanRecord {
  return {
    id: Number(r.id),
    request: r.request,
    context: r.context,
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

export interface RecordPersonalResult {
  id: number;
  persistence: PersonalPersistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordPersonalPlan(
  draft: PersonalPlanDraft,
): Promise<RecordPersonalResult> {
  if (isPersonalPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_personal_assistant_plans
          (request, context, verdict, rationale, evidence, authority_level, authority_decision,
           authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          draft.request,
          draft.context,
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
        `DELETE FROM onx_personal_assistant_plans
         WHERE id <= COALESCE(
          (SELECT id FROM onx_personal_assistant_plans ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [PERSONAL_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: PERSONAL_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: PersonalPlanRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryPlans.push(rec);
  let pruned = 0;
  while (memoryPlans.length > PERSONAL_RETENTION_KEEP) {
    memoryPlans.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: PERSONAL_RETENTION_KEEP,
  };
}

export interface PersonalHistoryQuery {
  context?: "PERSONAL" | "WELLNESS" | "PRODUCTIVITY" | "FINANCE";
  limit?: number;
}

export interface PersonalHistoryResult {
  persistence: PersonalPersistence;
  count: number;
  plans: PersonalPlanRecord[];
  retentionKeep: number;
}

export async function getPersonalHistory(
  query: PersonalHistoryQuery = {},
): Promise<PersonalHistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(PERSONAL_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isPersonalPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.context
      ? await p.query(
          `SELECT * FROM onx_personal_assistant_plans WHERE context = $1 ORDER BY id DESC LIMIT $2`,
          [query.context, limit],
        )
      : await p.query(`SELECT * FROM onx_personal_assistant_plans ORDER BY id DESC LIMIT $1`, [
          limit,
        ]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      plans: rows.rows.map(rowToRecord),
      retentionKeep: PERSONAL_RETENTION_KEEP,
    };
  }
  const filtered = query.context ? memoryPlans.filter((d) => d.context === query.context) : memoryPlans;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    plans: newestFirst,
    retentionKeep: PERSONAL_RETENTION_KEEP,
  };
}

export interface PersonalOutcomeResult {
  found: boolean;
  persistence: PersonalPersistence;
  plan: PersonalPlanRecord | null;
}

export async function recordPersonalOutcome(
  id: number,
  outcome: Exclude<PersonalOutcome, "PENDING">,
  note?: string,
): Promise<PersonalOutcomeResult> {
  if (outcome !== "COMPLETED" && outcome !== "ABANDONED" && outcome !== "DEFERRED") {
    throw new Error(`PERSONAL_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isPersonalPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_personal_assistant_plans
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", plan: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_personal_assistant_plans WHERE id = $1`, [id]);
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

export interface PersonalAccuracy {
  persistence: PersonalPersistence;
  context: string | null;
  total: number;
  resolved: number;
  completed: number;
  abandoned: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getPersonalAccuracy(
  context?: "PERSONAL" | "WELLNESS" | "PRODUCTIVITY" | "FINANCE",
): Promise<PersonalAccuracy> {
  if (isPersonalPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = context
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_personal_assistant_plans
           WHERE context = $1 GROUP BY outcome`,
          [context],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_personal_assistant_plans GROUP BY outcome`);
    let completed = 0;
    let abandoned = 0;
    let deferred = 0;
    let pending = 0;
    for (const r of rows.rows) {
      if (r.outcome === "COMPLETED") completed = Number(r.n);
      else if (r.outcome === "ABANDONED") abandoned = Number(r.n);
      else if (r.outcome === "DEFERRED") deferred = Number(r.n);
      else if (r.outcome === "PENDING") pending = Number(r.n);
    }
    const resolved = completed + abandoned + deferred;
    return {
      persistence: "POSTGRES",
      context: context ?? null,
      total: resolved + pending,
      resolved,
      completed,
      abandoned,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((completed / resolved) * 10000) / 10000,
    };
  }
  const scope = context ? memoryPlans.filter((d) => d.context === context) : memoryPlans;
  const completed = scope.filter((d) => d.outcome === "COMPLETED").length;
  const abandoned = scope.filter((d) => d.outcome === "ABANDONED").length;
  const deferred = scope.filter((d) => d.outcome === "DEFERRED").length;
  const pending = scope.filter((d) => d.outcome === "PENDING").length;
  const resolved = completed + abandoned + deferred;
  return {
    persistence: "UNPERSISTED",
    context: context ?? null,
    total: scope.length,
    resolved,
    completed,
    abandoned,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((completed / resolved) * 10000) / 10000,
  };
}


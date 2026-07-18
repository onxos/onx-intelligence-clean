import { Pool } from "pg";
import type { D11FeedDraft } from "./d11-feeding-engine";

export type D11Persistence = "POSTGRES" | "UNPERSISTED";
export type D11Outcome = "PENDING" | "CONFIRMED" | "REJECTED" | "DEFERRED";
export const D11_RETENTION_KEEP = 1000;

export interface D11FeedRecord extends D11FeedDraft {
  id: number;
  outcome: D11Outcome;
  outcomeNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

let pool: Pool | null = null;
let schemaReady = false;
const memoryFeeds: D11FeedRecord[] = [];
let memoryIdCounter = 0;

export function __resetD11FeedingStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryFeeds.length = 0;
  memoryIdCounter = 0;
}

export function isD11PersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("D11_FEEDING_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_d11_feeding_events (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    object_type VARCHAR(16) NOT NULL,
    origin_source VARCHAR(16) NOT NULL,
    suggested_lifecycle VARCHAR(16) NOT NULL,
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
function rowToRecord(r: any): D11FeedRecord {
  return {
    id: Number(r.id),
    content: r.content,
    objectType: r.object_type,
    originSource: r.origin_source,
    suggestedLifecycle: r.suggested_lifecycle,
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

export interface RecordD11Result {
  id: number;
  persistence: D11Persistence;
  fingerprint: string;
  pruned: number;
  retentionKeep: number;
}

export async function recordD11Feed(
  draft: D11FeedDraft,
): Promise<RecordD11Result> {
  if (isD11PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_d11_feeding_events
          (content, object_type, origin_source, suggested_lifecycle, verdict, rationale, evidence,
           authority_level, authority_decision, authority_reason, status, eval_score, fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          draft.content,
          draft.objectType,
          draft.originSource,
          draft.suggestedLifecycle,
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
        `DELETE FROM onx_d11_feeding_events
         WHERE id <= COALESCE(
          (SELECT id FROM onx_d11_feeding_events ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [D11_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        persistence: "POSTGRES",
        fingerprint: draft.fingerprint,
        pruned: del.rowCount ?? 0,
        retentionKeep: D11_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const rec: D11FeedRecord = {
    ...draft,
    id: ++memoryIdCounter,
    outcome: "PENDING",
    outcomeNote: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  memoryFeeds.push(rec);
  let pruned = 0;
  while (memoryFeeds.length > D11_RETENTION_KEEP) {
    memoryFeeds.shift();
    pruned++;
  }
  return {
    id: rec.id,
    persistence: "UNPERSISTED",
    fingerprint: rec.fingerprint,
    pruned,
    retentionKeep: D11_RETENTION_KEEP,
  };
}

export interface D11HistoryQuery {
  objectType?: "SIGNAL" | "PATTERN" | "UNDERSTANDING" | "JUDGMENT" | "WISDOM" | "LESSON";
  limit?: number;
}

export interface D11HistoryResult {
  persistence: D11Persistence;
  count: number;
  feeds: D11FeedRecord[];
  retentionKeep: number;
}

export async function getD11History(
  query: D11HistoryQuery = {},
): Promise<D11HistoryResult> {
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.min(D11_RETENTION_KEEP, Math.max(1, Math.floor(query.limit)))
      : 50;
  if (isD11PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = query.objectType
      ? await p.query(
          `SELECT * FROM onx_d11_feeding_events WHERE object_type = $1 ORDER BY id DESC LIMIT $2`,
          [query.objectType, limit],
        )
      : await p.query(`SELECT * FROM onx_d11_feeding_events ORDER BY id DESC LIMIT $1`, [limit]);
    return {
      persistence: "POSTGRES",
      count: rows.rowCount ?? rows.rows.length,
      feeds: rows.rows.map(rowToRecord),
      retentionKeep: D11_RETENTION_KEEP,
    };
  }
  const filtered = query.objectType
    ? memoryFeeds.filter((d) => d.objectType === query.objectType)
    : memoryFeeds;
  const newestFirst = [...filtered].reverse().slice(0, limit);
  return {
    persistence: "UNPERSISTED",
    count: newestFirst.length,
    feeds: newestFirst,
    retentionKeep: D11_RETENTION_KEEP,
  };
}

export interface D11OutcomeResult {
  found: boolean;
  persistence: D11Persistence;
  feed: D11FeedRecord | null;
}

export async function recordD11Outcome(
  id: number,
  outcome: Exclude<D11Outcome, "PENDING">,
  note?: string,
): Promise<D11OutcomeResult> {
  if (outcome !== "CONFIRMED" && outcome !== "REJECTED" && outcome !== "DEFERRED") {
    throw new Error(`D11_OUTCOME_INVALID: ${String(outcome)}`);
  }
  if (isD11PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const upd = await p.query(
      `UPDATE onx_d11_feeding_events
       SET outcome = $2, outcome_note = $3, resolved_at = now()
       WHERE id = $1 AND outcome = 'PENDING'
       RETURNING *`,
      [id, outcome, note ?? null],
    );
    if (upd.rows[0]) {
      return { found: true, persistence: "POSTGRES", feed: rowToRecord(upd.rows[0]) };
    }
    const existing = await p.query(`SELECT * FROM onx_d11_feeding_events WHERE id = $1`, [id]);
    return {
      found: Boolean(existing.rows[0]),
      persistence: "POSTGRES",
      feed: existing.rows[0] ? rowToRecord(existing.rows[0]) : null,
    };
  }
  const rec = memoryFeeds.find((d) => d.id === id);
  if (!rec) return { found: false, persistence: "UNPERSISTED", feed: null };
  if (rec.outcome === "PENDING") {
    rec.outcome = outcome;
    rec.outcomeNote = note ?? null;
    rec.resolvedAt = new Date().toISOString();
  }
  return { found: true, persistence: "UNPERSISTED", feed: rec };
}

export interface D11Accuracy {
  persistence: D11Persistence;
  objectType: string | null;
  total: number;
  resolved: number;
  confirmed: number;
  rejected: number;
  deferred: number;
  pending: number;
  accuracy: number;
}

export async function getD11Accuracy(
  objectType?: "SIGNAL" | "PATTERN" | "UNDERSTANDING" | "JUDGMENT" | "WISDOM" | "LESSON",
): Promise<D11Accuracy> {
  if (isD11PersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const rows = objectType
      ? await p.query(
          `SELECT outcome, COUNT(*)::int AS n FROM onx_d11_feeding_events
           WHERE object_type = $1 GROUP BY outcome`,
          [objectType],
        )
      : await p.query(`SELECT outcome, COUNT(*)::int AS n FROM onx_d11_feeding_events GROUP BY outcome`);
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
      objectType: objectType ?? null,
      total: resolved + pending,
      resolved,
      confirmed,
      rejected,
      deferred,
      pending,
      accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
    };
  }
  const rows = objectType ? memoryFeeds.filter((d) => d.objectType === objectType) : memoryFeeds;
  const confirmed = rows.filter((d) => d.outcome === "CONFIRMED").length;
  const rejected = rows.filter((d) => d.outcome === "REJECTED").length;
  const deferred = rows.filter((d) => d.outcome === "DEFERRED").length;
  const pending = rows.filter((d) => d.outcome === "PENDING").length;
  const resolved = confirmed + rejected + deferred;
  return {
    persistence: "UNPERSISTED",
    objectType: objectType ?? null,
    total: rows.length,
    resolved,
    confirmed,
    rejected,
    deferred,
    pending,
    accuracy: resolved === 0 ? 0 : Math.round((confirmed / resolved) * 10000) / 10000,
  };
}


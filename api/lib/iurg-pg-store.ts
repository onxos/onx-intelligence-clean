// ============================================================
// IURG POSTGRES STORE — Wave 6-b "Persistent mind memory"
// Direct Postgres access via `pg`, following the exact pattern of
// api/lib/platform-inbox-store.ts (production DATABASE_URL is
// Postgres on Render, while the drizzle layer is mysql2-only).
//
// Scope: raw parameterized SQL for the three mind-memory tables
//   onx_iurg_object, onx_iuc_snapshot, onx_continuity_log.
// This module MAY throw (connection/schema errors); the caller
// (api/lib/iurg-store.ts) guards every call and falls back to the
// in-memory store so a pg failure can never kill cron/boot paths.
// ============================================================
import { Pool } from "pg";
import type { IurgObjectInput } from "../iuc-engine";
import { withPgTransaction } from "./pg-diagnostics";

let pool: Pool | null = null;
let schemaReady = false;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("IURG_PG_NOT_CONFIGURED: DATABASE_URL is not set");
  }
  return url;
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = getConnectionString();
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
  try {
    await p.query(`CREATE TABLE IF NOT EXISTS onx_iurg_object (
      id VARCHAR(200) PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      rank SMALLINT NOT NULL DEFAULT 1,
      verification VARCHAR(20) NOT NULL DEFAULT 'UNVERIFIED',
      content_text TEXT,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await p.query(
      `CREATE INDEX IF NOT EXISTS iurg_object_type_idx ON onx_iurg_object (type)`,
    );
    await p.query(`CREATE TABLE IF NOT EXISTS onx_iuc_snapshot (
      id VARCHAR(36) PRIMARY KEY,
      snapshot_at TIMESTAMPTZ NOT NULL,
      tuc DOUBLE PRECISION NOT NULL,
      ugr DOUBLE PRECISION NOT NULL DEFAULT 0,
      urs DOUBLE PRECISION NOT NULL DEFAULT 0,
      ksr DOUBLE PRECISION NOT NULL DEFAULT 0,
      pdr DOUBLE PRECISION NOT NULL DEFAULT 0,
      krr DOUBLE PRECISION NOT NULL DEFAULT 0,
      kor DOUBLE PRECISION NOT NULL DEFAULT 0,
      scg DOUBLE PRECISION NOT NULL DEFAULT 0,
      sai DOUBLE PRECISION NOT NULL DEFAULT 0,
      object_count INTEGER NOT NULL DEFAULT 0,
      snapshot_hash TEXT NOT NULL
    )`);
    await p.query(
      `CREATE INDEX IF NOT EXISTS iuc_snapshot_at_idx ON onx_iuc_snapshot (snapshot_at)`,
    );
    await p.query(`CREATE TABLE IF NOT EXISTS onx_continuity_log (
      seq BIGSERIAL PRIMARY KEY,
      id VARCHAR(36) NOT NULL,
      tick INTEGER NOT NULL DEFAULT 0,
      event_type VARCHAR(20) NOT NULL,
      object_id VARCHAR(200),
      detail TEXT,
      previous_hash VARCHAR(64) NOT NULL,
      current_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await p.query(
      `CREATE INDEX IF NOT EXISTS continuity_log_hash_idx ON onx_continuity_log (current_hash)`,
    );
    schemaReady = true;
  } catch (error) {
    // Leave schemaReady=false so the next call retries
    throw new Error(`IURG_PG_SCHEMA_FAILED: ${(error as Error).message}`);
  }
}

// --- IURG objects -------------------------------------------------

const OBJECT_UPSERT_SQL = `INSERT INTO onx_iurg_object (id, type, rank, verification, content_text, payload, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET
       type = EXCLUDED.type,
       rank = EXCLUDED.rank,
       verification = EXCLUDED.verification,
       content_text = EXCLUDED.content_text,
       payload = EXCLUDED.payload,
       updated_at = now()`;

function objectUpsertParams(obj: IurgObjectInput & { id: string }): unknown[] {
  return [
    obj.id,
    obj.type,
    Math.max(1, Math.min(6, Math.trunc(obj.rank ?? 1))),
    obj.verification ?? "UNVERIFIED",
    obj.contentText ?? null,
    JSON.stringify(obj),
  ];
}

/** Escape LIKE wildcards so a prefix is always matched literally. */
function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/([\\%_])/g, "\\$1");
}

export async function pgUpsertObject(obj: IurgObjectInput & { id: string }): Promise<void> {
  await ensureSchema();
  await getPool().query(OBJECT_UPSERT_SQL, objectUpsertParams(obj));
}

export async function pgLoadAllObjects(): Promise<IurgObjectInput[]> {
  await ensureSchema();
  const result = await getPool().query<{ id: string; payload: unknown }>(
    `SELECT id, payload FROM onx_iurg_object ORDER BY created_at ASC`,
  );
  const objects: IurgObjectInput[] = [];
  for (const row of result.rows) {
    const raw = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    if (raw && typeof raw === "object") {
      objects.push({ ...(raw as IurgObjectInput), id: row.id });
    }
  }
  return objects;
}

export async function pgObjectCounts(): Promise<Array<{ type: string; count: number }>> {
  await ensureSchema();
  const result = await getPool().query<{ type: string; count: string }>(
    `SELECT type, count(*) AS count FROM onx_iurg_object GROUP BY type`,
  );
  return result.rows.map((r) => ({ type: r.type, count: Number(r.count) }));
}

export async function pgDeleteAllObjects(): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM onx_iurg_object`);
}

export async function pgDeleteObjectsByIdPrefix(prefix: string): Promise<void> {
  await ensureSchema();
  // Escape LIKE wildcards in the prefix so it is always a literal prefix match.
  const escaped = escapeLikePrefix(prefix);
  await getPool().query(
    `DELETE FROM onx_iurg_object WHERE id LIKE $1 ESCAPE '\\'`,
    [`${escaped}%`],
  );
}

// --- Atomic replace (fail-closed) ---------------------------------
// The old path did DELETE then a loop of independently-swallowed INSERTs:
// a mid-way pg failure left Postgres partially rewritten and silently
// divergent from the authoritative in-memory mirror. These run DELETE +
// all INSERTs inside a SINGLE transaction via withPgTransaction, so the
// pg side is all-or-nothing: on any failure it ROLLBACKs and propagates
// FAIL-CLOSED (the store then absorbs it for cron availability, but pg is
// never corrupted and the failure is recorded loudly).

async function replaceWithinTransaction(
  op: string,
  deleteSql: string,
  deleteParams: unknown[],
  objects: Array<IurgObjectInput & { id: string }>,
): Promise<void> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await withPgTransaction(
      client,
      async (tx) => {
        await tx.query(deleteSql, deleteParams);
        for (const obj of objects) {
          await tx.query(OBJECT_UPSERT_SQL, objectUpsertParams(obj));
        }
      },
      { op },
    );
  } finally {
    client.release();
  }
}

export async function pgReplaceObjects(
  objects: Array<IurgObjectInput & { id: string }>,
): Promise<void> {
  await replaceWithinTransaction(
    "iurg-pg.replaceObjects",
    `DELETE FROM onx_iurg_object`,
    [],
    objects,
  );
}

export async function pgReplaceObjectsByIdPrefix(
  prefix: string,
  objects: Array<IurgObjectInput & { id: string }>,
): Promise<void> {
  const escaped = escapeLikePrefix(prefix);
  await replaceWithinTransaction(
    "iurg-pg.replaceObjectsByPrefix",
    `DELETE FROM onx_iurg_object WHERE id LIKE $1 ESCAPE '\\'`,
    [`${escaped}%`],
    objects,
  );
}

// --- IUC snapshots ------------------------------------------------

export interface PgSnapshotRow {
  id: string;
  timestamp: Date;
  tuc: number;
  ugr: number;
  urs: number;
  ksr: number;
  pdr: number;
  krr: number;
  kor: number;
  scg: number;
  sai: number;
  objectCount: number;
  snapshotHash: string;
}

export async function pgInsertSnapshot(row: PgSnapshotRow): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO onx_iuc_snapshot
       (id, snapshot_at, tuc, ugr, urs, ksr, pdr, krr, kor, scg, sai, object_count, snapshot_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO NOTHING`,
    [
      row.id, row.timestamp.toISOString(), row.tuc, row.ugr, row.urs, row.ksr,
      row.pdr, row.krr, row.kor, row.scg, row.sai, row.objectCount, row.snapshotHash,
    ],
  );
}

interface RawSnapshotRow {
  id: string;
  snapshot_at: Date | string;
  tuc: number | string;
  ugr: number | string;
  urs: number | string;
  ksr: number | string;
  pdr: number | string;
  krr: number | string;
  kor: number | string;
  scg: number | string;
  sai: number | string;
  object_count: number | string;
  snapshot_hash: string;
}

export async function pgLatestSnapshot(): Promise<PgSnapshotRow | null> {
  await ensureSchema();
  const result = await getPool().query<RawSnapshotRow>(
    `SELECT * FROM onx_iuc_snapshot ORDER BY snapshot_at DESC LIMIT 1`,
  );
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    timestamp: r.snapshot_at instanceof Date ? r.snapshot_at : new Date(r.snapshot_at),
    tuc: Number(r.tuc),
    ugr: Number(r.ugr),
    urs: Number(r.urs),
    ksr: Number(r.ksr),
    pdr: Number(r.pdr),
    krr: Number(r.krr),
    kor: Number(r.kor),
    scg: Number(r.scg),
    sai: Number(r.sai),
    objectCount: Number(r.object_count),
    snapshotHash: r.snapshot_hash,
  };
}

export async function pgClearSnapshots(): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM onx_iuc_snapshot`);
}

// --- Continuity log (append-only hash chain) ----------------------

export interface PgContinuityRow {
  id: string;
  tick: number;
  eventType: string;
  objectId: string | null;
  detail: string | null;
  previousHash: string;
  currentHash: string;
  createdAt: Date;
}

export async function pgAppendContinuity(row: PgContinuityRow): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO onx_continuity_log
       (id, tick, event_type, object_id, detail, previous_hash, current_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.id, row.tick, row.eventType, row.objectId, row.detail,
      row.previousHash, row.currentHash, row.createdAt.toISOString(),
    ],
  );
}

export async function pgLatestContinuityHash(): Promise<string | null> {
  await ensureSchema();
  const result = await getPool().query<{ current_hash: string }>(
    `SELECT current_hash FROM onx_continuity_log ORDER BY seq DESC LIMIT 1`,
  );
  return result.rows[0]?.current_hash ?? null;
}

interface RawContinuityRow {
  id: string;
  tick: number | string;
  event_type: string;
  object_id: string | null;
  detail: string | null;
  previous_hash: string;
  current_hash: string;
  created_at: Date | string;
}

export async function pgListContinuity(limit: number): Promise<PgContinuityRow[]> {
  await ensureSchema();
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 500) : 100;
  const result = await getPool().query<RawContinuityRow>(
    `SELECT id, tick, event_type, object_id, detail, previous_hash, current_hash, created_at
     FROM onx_continuity_log ORDER BY seq DESC LIMIT $1`,
    [safeLimit],
  );
  return result.rows.map((r) => ({
    id: r.id,
    tick: Number(r.tick),
    eventType: r.event_type,
    objectId: r.object_id,
    detail: r.detail,
    previousHash: r.previous_hash,
    currentHash: r.current_hash,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}

export async function pgClearContinuity(): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM onx_continuity_log`);
}

// --- Health stats -------------------------------------------------

export interface PgHealthStats {
  objectCount: number;
  snapshotCount: number;
  continuityLogCount: number;
  lastTickAt: Date | null;
}

export async function pgHealthStats(): Promise<PgHealthStats> {
  await ensureSchema();
  const p = getPool();
  const [objects, snapshots, continuity] = await Promise.all([
    p.query<{ count: string }>(`SELECT count(*) AS count FROM onx_iurg_object`),
    p.query<{ count: string }>(`SELECT count(*) AS count FROM onx_iuc_snapshot`),
    p.query<{ count: string; last_tick_at: Date | string | null }>(
      `SELECT count(*) AS count, max(created_at) AS last_tick_at FROM onx_continuity_log`,
    ),
  ]);
  const rawLast = continuity.rows[0]?.last_tick_at ?? null;
  const lastTickAt =
    rawLast == null ? null : rawLast instanceof Date ? rawLast : new Date(rawLast);
  return {
    objectCount: Number(objects.rows[0]?.count ?? 0),
    snapshotCount: Number(snapshots.rows[0]?.count ?? 0),
    continuityLogCount: Number(continuity.rows[0]?.count ?? 0),
    lastTickAt: lastTickAt && !Number.isNaN(lastTickAt.getTime()) ? lastTickAt : null,
  };
}

// Test-only: reset module singletons
export function __resetIurgPgForTests(): void {
  pool = null;
  schemaReady = false;
}

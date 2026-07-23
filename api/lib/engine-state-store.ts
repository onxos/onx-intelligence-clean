// ============================================================
// ENGINE STATE STORE — Line I / Phase 1 "Durable mind"
// Generic Postgres persistence for the 18 runtime engines so the
// institutional mind survives restarts (CCOP continuity).
//
// Follows api/lib/corpus-pg-store.ts exactly: lazy pool,
// CREATE TABLE IF NOT EXISTS, honest UNPERSISTED when no DB.
//
// Table: onx_engine_state — one JSONB snapshot row per engine,
// upserted on mutation, loaded once at boot (hydration).
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;
// In-memory fallback when no DATABASE_URL (dev/test): works within the
// process, lost on restart — the honest UNPERSISTED mode, matching how
// the engines themselves behave without a database.
const memoryFallback = new Map<string, unknown>();

export function isEngineStatePersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("ENGINE_STATE_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
    }
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 3,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS onx_engine_state (
    engine VARCHAR(60) PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  schemaReady = true;
}

export async function saveEngineState(engine: string, state: unknown): Promise<boolean> {
  if (!isEngineStatePersistenceConfigured()) {
    memoryFallback.set(engine, JSON.parse(JSON.stringify(state)));
    return false; // honestly UNPERSISTED — process-local only
  }
  await ensureSchema();
  await getPool().query(
    `INSERT INTO onx_engine_state (engine, state, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (engine) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [engine, JSON.stringify(state)],
  );
  return true;
}

export async function loadEngineState<T>(engine: string): Promise<T | null> {
  if (!isEngineStatePersistenceConfigured()) {
    const v = memoryFallback.get(engine);
    return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
  }
  await ensureSchema();
  const result = await getPool().query(
    `SELECT state FROM onx_engine_state WHERE engine = $1`,
    [engine],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].state as T;
}

/** Fire-and-forget persist: never lets a DB hiccup break a mutation.
 *  Without a database it still keeps the process-local fallback so
 *  learning/judgment state survives between calls (UNPERSISTED). */
export function persistEngineAsync(engine: string, snapshot: () => unknown): void {
  void saveEngineState(engine, snapshot()).catch(() => {
    /* honest degradation: engine keeps working in-memory */
  });
}

/** Test hook. */
export function __resetEngineStateStoreForTests(): void {
  pool = null;
  schemaReady = false;
  memoryFallback.clear();
}

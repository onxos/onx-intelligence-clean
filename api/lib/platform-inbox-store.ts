// ============================================================
// PLATFORM EVENT INBOX STORE — Phase C3a follow-up
// Direct Postgres access via `pg` (production DATABASE_URL is
// Postgres on Render, while the drizzle layer is mysql2-only).
// Scope: onx_platform_event_inbox only — no other path changes.
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

function getConnectionString(): string {
  const url = process.env.PLATFORM_INBOX_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("PLATFORM_INBOX_DB_NOT_CONFIGURED: Set PLATFORM_INBOX_DATABASE_URL or DATABASE_URL");
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
    await p.query(`CREATE TABLE IF NOT EXISTS onx_platform_event_inbox (
      id BIGSERIAL PRIMARY KEY,
      source VARCHAR(100) NOT NULL,
      event_id BIGINT NOT NULL,
      event_type VARCHAR(200) NOT NULL,
      aggregate_type VARCHAR(200),
      aggregate_id VARCHAR(200),
      occurred_at TIMESTAMPTZ,
      payload JSONB,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await p.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS inbox_source_event_idx ON onx_platform_event_inbox (source, event_id)`,
    );
    await p.query(
      `CREATE INDEX IF NOT EXISTS inbox_event_type_idx ON onx_platform_event_inbox (event_type)`,
    );
    await p.query(
      `CREATE INDEX IF NOT EXISTS inbox_aggregate_idx ON onx_platform_event_inbox (aggregate_type, aggregate_id)`,
    );
    schemaReady = true;
  } catch (error) {
    // Leave schemaReady=false so the next call retries
    throw new Error(`PLATFORM_INBOX_SCHEMA_FAILED: ${(error as Error).message}`);
  }
}

export interface InsertEventInput {
  source: string;
  eventId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload?: Record<string, unknown> | null;
}

export interface InsertEventResult {
  duplicate: boolean;
  id?: number;
}

export async function insertEvent(input: InsertEventInput): Promise<InsertEventResult> {
  await ensureSchema();
  const p = getPool();

  const inserted = await p.query<{ id: string }>(
    `INSERT INTO onx_platform_event_inbox
       (source, event_id, event_type, aggregate_type, aggregate_id, occurred_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (source, event_id) DO NOTHING
     RETURNING id`,
    [
      input.source,
      input.eventId,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      input.occurredAt,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  );

  if (inserted.rows.length > 0) {
    return { duplicate: false, id: Number(inserted.rows[0].id) };
  }

  const existing = await p.query<{ id: string }>(
    `SELECT id FROM onx_platform_event_inbox WHERE source = $1 AND event_id = $2 LIMIT 1`,
    [input.source, input.eventId],
  );
  return { duplicate: true, id: existing.rows[0] ? Number(existing.rows[0].id) : undefined };
}

export async function countEvents(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query<{ count: string }>(
    `SELECT count(*) AS count FROM onx_platform_event_inbox`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

// Test-only: reset module singletons
export function __resetForTests(): void {
  pool = null;
  schemaReady = false;
}

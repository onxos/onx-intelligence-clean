/**
 * Platform Event Inbox store (Phase C3a fix).
 *
 * The production DATABASE_URL points at a Render Postgres instance, while the
 * repo's drizzle layer targets MySQL — so the inbox uses `pg` directly.
 * Idempotent: creates its own table on first use, and inserts use
 * ON CONFLICT DO NOTHING keyed on (source, event_id).
 */
import { Pool } from "pg";

export interface PlatformInboxEvent {
  source: string;
  eventId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  payload: Record<string, unknown> | null;
}

export interface InsertEventResult {
  duplicate: boolean;
  id: number;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.PLATFORM_INBOX_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
    const external = /render\.com|\bsslmode=require\b/.test(connectionString);
    pool = new Pool({
      connectionString,
      max: 3,
      ssl: external ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const p = getPool();
      await p.query(`
        CREATE TABLE IF NOT EXISTS onx_platform_event_inbox (
          id BIGSERIAL PRIMARY KEY,
          source VARCHAR(100) NOT NULL,
          event_id BIGINT NOT NULL,
          event_type VARCHAR(200) NOT NULL,
          aggregate_type VARCHAR(200),
          aggregate_id VARCHAR(200),
          occurred_at TIMESTAMPTZ,
          payload JSONB,
          received_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await p.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS inbox_source_event_idx
           ON onx_platform_event_inbox (source, event_id)`,
      );
      await p.query(
        `CREATE INDEX IF NOT EXISTS inbox_event_type_idx
           ON onx_platform_event_inbox (event_type)`,
      );
      await p.query(
        `CREATE INDEX IF NOT EXISTS inbox_aggregate_idx
           ON onx_platform_event_inbox (aggregate_type, aggregate_id)`,
      );
    })();
    // Allow retry on next call if schema creation failed (e.g. transient DB outage)
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  return schemaReady;
}

export async function insertEvent(event: PlatformInboxEvent): Promise<InsertEventResult> {
  await ensureSchema();
  const p = getPool();

  const inserted = await p.query<{ id: string }>(
    `INSERT INTO onx_platform_event_inbox
       (source, event_id, event_type, aggregate_type, aggregate_id, occurred_at, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (source, event_id) DO NOTHING
     RETURNING id`,
    [
      event.source,
      event.eventId,
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      event.occurredAt,
      event.payload === null ? null : JSON.stringify(event.payload),
    ],
  );

  if (inserted.rows.length > 0) {
    return { duplicate: false, id: Number(inserted.rows[0].id) };
  }

  const existing = await p.query<{ id: string }>(
    `SELECT id FROM onx_platform_event_inbox WHERE source = $1 AND event_id = $2 LIMIT 1`,
    [event.source, event.eventId],
  );
  return { duplicate: true, id: Number(existing.rows[0]?.id ?? 0) };
}

export async function countEvents(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query<{ count: string }>(
    `SELECT count(*) AS count FROM onx_platform_event_inbox`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

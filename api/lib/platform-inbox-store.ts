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

// ============================================================
// ANALYTICAL READ LAYER — Phase E1 "Mind reads body"
// Read-only, parameterized queries over the event inbox.
// ============================================================

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function clampLimit(limit: number, max: number, fallback: number): number {
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) return fallback;
  return Math.min(limit, max);
}

export interface EventTypeCount {
  eventType: string;
  count: number;
}

export interface EventStats {
  totalEvents: number;
  byType: EventTypeCount[];
  oldestReceivedAt: string | null;
  newestReceivedAt: string | null;
  last24hCount: number;
}

export async function getEventStats(): Promise<EventStats> {
  await ensureSchema();
  const p = getPool();

  const totals = await p.query<{
    total: string;
    oldest: Date | string | null;
    newest: Date | string | null;
    last24h: string;
  }>(
    `SELECT count(*) AS total,
            min(received_at) AS oldest,
            max(received_at) AS newest,
            count(*) FILTER (WHERE received_at >= now() - interval '24 hours') AS last24h
     FROM onx_platform_event_inbox`,
  );

  const byType = await p.query<{ event_type: string; count: string }>(
    `SELECT event_type, count(*) AS count
     FROM onx_platform_event_inbox
     GROUP BY event_type
     ORDER BY count DESC, event_type ASC`,
  );

  const row = totals.rows[0];
  return {
    totalEvents: Number(row?.total ?? 0),
    byType: byType.rows.map((r) => ({ eventType: r.event_type, count: Number(r.count) })),
    oldestReceivedAt: toIso(row?.oldest ?? null),
    newestReceivedAt: toIso(row?.newest ?? null),
    last24hCount: Number(row?.last24h ?? 0),
  };
}

export interface InboxEventRow {
  id: number;
  source: string;
  eventId: number;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  occurredAt: string | null;
  receivedAt: string | null;
  payloadPreview: string | null;
}

interface RawInboxRow {
  id: string;
  source: string;
  event_id: string;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  occurred_at: Date | string | null;
  received_at: Date | string | null;
  payload_preview: string | null;
}

function mapRow(r: RawInboxRow): InboxEventRow {
  return {
    id: Number(r.id),
    source: r.source,
    eventId: Number(r.event_id),
    eventType: r.event_type,
    aggregateType: r.aggregate_type,
    aggregateId: r.aggregate_id,
    occurredAt: toIso(r.occurred_at),
    receivedAt: toIso(r.received_at),
    payloadPreview: r.payload_preview,
  };
}

const EVENT_COLUMNS = `id, source, event_id, event_type, aggregate_type, aggregate_id,
       occurred_at, received_at, left(payload::text, 300) AS payload_preview`;

export async function getRecentEvents(limit = 20): Promise<InboxEventRow[]> {
  await ensureSchema();
  const safeLimit = clampLimit(limit, 50, 20);
  const result = await getPool().query<RawInboxRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM onx_platform_event_inbox
     ORDER BY id DESC
     LIMIT $1`,
    [safeLimit],
  );
  return result.rows.map(mapRow);
}

export async function getAggregateTimeline(
  aggregateType: string,
  aggregateId: string,
  limit = 50,
): Promise<InboxEventRow[]> {
  await ensureSchema();
  const safeLimit = clampLimit(limit, 200, 50);
  const result = await getPool().query<RawInboxRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM onx_platform_event_inbox
     WHERE aggregate_type = $1 AND aggregate_id = $2
     ORDER BY occurred_at ASC NULLS LAST, id ASC
     LIMIT $3`,
    [aggregateType, aggregateId, safeLimit],
  );
  return result.rows.map(mapRow);
}

// ============================================================
// PERCEPTION FEED — Wave 5-b "Mind thinks about body"
// Cursor-based read used by api/lib/perception-adapter.ts.
// Payload *keys* are extracted SQL-side; payload values never
// leave the database through this query.
// ============================================================

export interface PerceptionSourceRow {
  id: number;
  source: string;
  eventId: number;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  occurredAt: string | null;
  receivedAt: string | null;
  payloadKeys: string[];
}

interface RawPerceptionSourceRow {
  id: string;
  source: string;
  event_id: string;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  occurred_at: Date | string | null;
  received_at: Date | string | null;
  payload_keys: string[] | null;
}

export async function getEventsAfterId(afterId: number, limit = 200): Promise<PerceptionSourceRow[]> {
  await ensureSchema();
  const safeAfterId = Number.isFinite(afterId) ? Math.max(0, Math.trunc(afterId)) : 0;
  const safeLimit = clampLimit(limit, 500, 200);
  const result = await getPool().query<RawPerceptionSourceRow>(
    `SELECT id, source, event_id, event_type, aggregate_type, aggregate_id,
            occurred_at, received_at,
            CASE WHEN jsonb_typeof(payload) = 'object'
                 THEN (SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[])
                       FROM jsonb_object_keys(payload) AS k)
                 ELSE ARRAY[]::text[]
            END AS payload_keys
     FROM onx_platform_event_inbox
     WHERE id > $1
     ORDER BY id ASC
     LIMIT $2`,
    [safeAfterId, safeLimit],
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    source: r.source,
    eventId: Number(r.event_id),
    eventType: r.event_type,
    aggregateType: r.aggregate_type,
    aggregateId: r.aggregate_id,
    occurredAt: toIso(r.occurred_at),
    receivedAt: toIso(r.received_at),
    payloadKeys: r.payload_keys ?? [],
  }));
}

// Test-only: reset module singletons
export function __resetForTests(): void {
  pool = null;
  schemaReady = false;
}

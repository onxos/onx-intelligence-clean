// ============================================================
// CORPUS PG STORE — STE-N-02 "Corpus persistence + honest ingest"
// Direct Postgres access via `pg`, following the exact pattern of
// api/lib/iurg-pg-store.ts (CREATE TABLE IF NOT EXISTS, lazy pool).
//
// Table: onx_knowledge_corpus — fingerprint UNIQUE gives
// upsert-dedup at the database level (ON CONFLICT DO NOTHING).
// Without a postgres DATABASE_URL this module reports
// UNPERSISTED and callers keep the in-memory behavior.
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

export function isCorpusPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("CORPUS_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_knowledge_corpus (
    id VARCHAR(80) PRIMARY KEY,
    fingerprint VARCHAR(64) NOT NULL UNIQUE,
    domain VARCHAR(40) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await p.query(
    `CREATE INDEX IF NOT EXISTS knowledge_corpus_domain_idx ON onx_knowledge_corpus (domain)`,
  );
  schemaReady = true;
}

export interface CorpusUnitInput {
  fingerprint: string;
  domain: string;
  title: string;
  body: string;
  source: string;
}

export interface CorpusInsertResult {
  accepted: number;
  duplicates: number;
  total: number;
}

// Batch insert with fingerprint dedup enforced by the UNIQUE
// constraint (ON CONFLICT DO NOTHING) — honest counts returned.
export async function insertCorpusUnits(units: CorpusUnitInput[]): Promise<CorpusInsertResult> {
  await ensureSchema();
  const p = getPool();
  let accepted = 0;
  for (const unit of units) {
    const result = await p.query(
      `INSERT INTO onx_knowledge_corpus (id, fingerprint, domain, title, body, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (fingerprint) DO NOTHING`,
      [
        `corpus_${unit.fingerprint.slice(0, 24)}`,
        unit.fingerprint,
        unit.domain,
        unit.title,
        unit.body,
        unit.source,
      ],
    );
    accepted += result.rowCount ?? 0;
  }
  return { accepted, duplicates: units.length - accepted, total: units.length };
}

// STE-K-01: load persisted units for the BM25 search index.
export interface CorpusUnitRow {
  id: string;
  domain: string;
  title: string;
  body: string;
}

export async function loadAllCorpusUnits(): Promise<CorpusUnitRow[]> {
  await ensureSchema();
  const p = getPool();
  const result = await p.query(
    `SELECT id, domain, title, body FROM onx_knowledge_corpus ORDER BY id`,
  );
  return result.rows ?? [];
}

export async function countCorpusUnits(): Promise<number> {
  await ensureSchema();
  const p = getPool();
  const result = await p.query(`SELECT COUNT(*)::int AS count FROM onx_knowledge_corpus`);
  return result.rows[0]?.count ?? 0;
}

export function __resetCorpusPgForTests(): void {
  pool = null;
  schemaReady = false;
}

// Admin maintenance (bridge-guarded callers only): retag units by
// source+domain. Used to correct domain mis-tags honestly — every call is
// audited by the caller and returns the true affected-row count.
export async function retagCorpusDomain(
  source: string,
  fromDomain: string,
  toDomain: string,
): Promise<{ updated: number }> {
  const p = getPool();
  await ensureSchema();
  const r = await p.query(
    `UPDATE onx_knowledge_corpus SET domain = $1 WHERE source = $2 AND domain = $3`,
    [toDomain, source, fromDomain],
  );
  return { updated: r.rowCount ?? 0 };
}

// Admin listing by source — precise maintenance needs to SEE the rows first.
export async function listCorpusBySource(
  source: string,
): Promise<Array<{ id: string; domain: string; title: string }>> {
  const p = getPool();
  await ensureSchema();
  const r = await p.query(
    `SELECT id, domain, title FROM onx_knowledge_corpus WHERE source = $1 ORDER BY title`,
    [source],
  );
  return r.rows as Array<{ id: string; domain: string; title: string }>;
}

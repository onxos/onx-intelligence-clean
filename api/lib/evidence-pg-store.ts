// ============================================================
// EVIDENCE PG STORE — STE fix "Evidence Registry persistence"
// Direct Postgres access via `pg`, following the exact pattern of
// api/lib/corpus-pg-store.ts and api/lib/iurg-pg-store.ts
// (lazy pool, CREATE TABLE IF NOT EXISTS, honest UNPERSISTED fallback).
//
// Root cause fixed: the drizzle/mysql2 layer (mode: planetscale)
// cannot connect to the Postgres DATABASE_URL, so the evidence
// registry silently fell back to in-memory and lost all data on
// every deploy. This store talks to the same Postgres instance
// already used by corpus/iurg stores.
//
// Table: evidence_registry — mirrors db/schema.ts evidenceRegistry
// column-for-column (camelCase quoted identifiers preserved).
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

export function isEvidencePersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("EVIDENCE_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS evidence_registry (
    id SERIAL PRIMARY KEY,
    "evidenceId" VARCHAR(20) NOT NULL UNIQUE,
    category VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "verificationMethod" VARCHAR(255),
    "actualResult" TEXT,
    "expectedResult" TEXT,
    layer VARCHAR(2),
    priority INT NOT NULL DEFAULT 99,
    "founderSigned" INT NOT NULL DEFAULT 0,
    verifier VARCHAR(80),
    "verifiedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await p.query(`CREATE INDEX IF NOT EXISTS ev_cat_idx ON evidence_registry (category)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ev_status_idx ON evidence_registry (status)`);
  schemaReady = true;
}

export interface EvidenceSeedRecord {
  evidenceId: string;
  category: string;
  layer: string | null;
  priority: number;
  title: string;
  description: string;
  expectedResult: string;
}

export interface EvidenceRow extends EvidenceSeedRecord {
  id: number;
  status: string;
  verificationMethod: string | null;
  actualResult: string | null;
  founderSigned: number;
  verifier: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** كل السجلات مرتبة بالأولوية — المصدر PostgreSQL */
export async function listEvidence(): Promise<EvidenceRow[]> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT * FROM evidence_registry ORDER BY priority ASC`,
  );
  return res.rows as EvidenceRow[];
}

/** Seed idempotent — لا يمس نتائج التحقق الموجودة أبداً */
export async function seedEvidence(records: EvidenceSeedRecord[]): Promise<{
  seeded: number;
  existing: number;
}> {
  await ensureSchema();
  const p = getPool();
  const existingRes = await p.query(`SELECT "evidenceId" FROM evidence_registry`);
  const existingIds = new Set(existingRes.rows.map((r) => r.evidenceId as string));
  const toInsert = records.filter((r) => !existingIds.has(r.evidenceId));
  for (const r of toInsert) {
    await p.query(
      `INSERT INTO evidence_registry
        ("evidenceId", category, title, description, "expectedResult", priority, layer, status, "founderSigned")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',0)
       ON CONFLICT ("evidenceId") DO NOTHING`,
      [r.evidenceId, r.category, r.title, r.description, r.expectedResult, r.priority, r.layer],
    );
  }
  return { seeded: toInsert.length, existing: existingIds.size };
}

export interface EvidenceVerification {
  evidenceId: string;
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "WAIVED";
  verificationMethod?: string;
  actualResult?: string;
  verifier?: string;
  founderSign?: boolean;
}

/** تسجيل نتيجة تحقق — النشر الدائم */
export async function setEvidenceVerification(
  v: EvidenceVerification,
): Promise<{ updated: boolean }> {
  await ensureSchema();
  const res = await getPool().query(
    `UPDATE evidence_registry
       SET status = $2,
           "verificationMethod" = COALESCE($3, "verificationMethod"),
           "actualResult" = COALESCE($4, "actualResult"),
           verifier = COALESCE($5, verifier),
           "founderSigned" = CASE WHEN $6 THEN 1 ELSE "founderSigned" END,
           "verifiedAt" = now(),
           "updatedAt" = now()
     WHERE "evidenceId" = $1`,
    [
      v.evidenceId,
      v.status,
      v.verificationMethod ?? null,
      v.actualResult ?? null,
      v.verifier ?? null,
      v.founderSign === true,
    ],
  );
  return { updated: (res.rowCount ?? 0) > 0 };
}

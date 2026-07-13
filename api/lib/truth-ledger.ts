// ============================================================
// TRUTH LEDGER — STE-K-03 "The system remembers its truth"
// Chronological store of OSVA self-verification snapshots so
// truth drift is detectable over time, not just at one instant.
//
// Follows api/lib/corpus-pg-store.ts literally: lazy Pool,
// CREATE TABLE IF NOT EXISTS, ssl for render.com hosts. Without
// a postgres DATABASE_URL it falls back to an in-memory ring
// honestly declared UNPERSISTED (lost on restart).
// ============================================================
import { Pool } from "pg";
import { buildSelfVerification, type SelfVerificationReport } from "./self-verify";

export type LedgerPersistence = "POSTGRES" | "UNPERSISTED";

export interface TruthSnapshotRow {
  id: number;
  fingerprint: string;
  claimsMeasured: number;
  claimsAsserted: number;
  createdAt: string;
}

export interface TruthHistoryEntry extends TruthSnapshotRow {
  // true when this snapshot's fingerprint differs from the one
  // immediately before it — automatic truth-drift detection.
  drift: boolean;
}

let pool: Pool | null = null;
let schemaReady = false;

// In-memory fallback ring (newest last), capped to keep it honest
// about being a bounded diagnostic buffer, not a database.
const MEMORY_CAP = 200;
const memoryLedger: TruthSnapshotRow[] = [];
let memoryIdCounter = 0;

export function __resetTruthLedgerForTests(): void {
  pool = null;
  schemaReady = false;
  memoryLedger.length = 0;
  memoryIdCounter = 0;
}

export function isTruthLedgerPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("TRUTH_LEDGER_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
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
  await p.query(`CREATE TABLE IF NOT EXISTS onx_truth_ledger (
    id SERIAL PRIMARY KEY,
    fingerprint VARCHAR(64) NOT NULL,
    claims_measured INT NOT NULL,
    claims_asserted INT NOT NULL,
    report JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  schemaReady = true;
}

export interface RecordSnapshotResult {
  id: number;
  fingerprint: string;
  claimsMeasured: number;
  claimsAsserted: number;
  persistence: LedgerPersistence;
}

// Build the CURRENT self-verification report and append it to the
// ledger. The report stored is the full honest OSVA JSON (which by
// construction never contains env values — proven in
// self-verify.test.ts's no-leak test).
export async function recordTruthSnapshot(): Promise<RecordSnapshotResult> {
  const report: SelfVerificationReport = await buildSelfVerification();

  if (isTruthLedgerPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const result = await p.query(
      `INSERT INTO onx_truth_ledger (fingerprint, claims_measured, claims_asserted, report)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [report.fingerprint, report.claimsMeasured, report.claimsAsserted, JSON.stringify(report)],
    );
    return {
      id: result.rows[0]?.id ?? -1,
      fingerprint: report.fingerprint,
      claimsMeasured: report.claimsMeasured,
      claimsAsserted: report.claimsAsserted,
      persistence: "POSTGRES",
    };
  }

  const row: TruthSnapshotRow = {
    id: ++memoryIdCounter,
    fingerprint: report.fingerprint,
    claimsMeasured: report.claimsMeasured,
    claimsAsserted: report.claimsAsserted,
    createdAt: new Date().toISOString(),
  };
  memoryLedger.push(row);
  if (memoryLedger.length > MEMORY_CAP) memoryLedger.shift();
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    claimsMeasured: row.claimsMeasured,
    claimsAsserted: row.claimsAsserted,
    persistence: "UNPERSISTED",
  };
}

export interface TruthHistoryResult {
  persistence: LedgerPersistence;
  count: number;
  snapshots: TruthHistoryEntry[]; // newest first
}

function withDriftFlags(rowsNewestFirst: TruthSnapshotRow[]): TruthHistoryEntry[] {
  // drift = fingerprint differs from the snapshot immediately BEFORE
  // it in time (the next element in newest-first order). The oldest
  // returned snapshot has no predecessor in view → drift: false.
  return rowsNewestFirst.map((row, i) => {
    const previous = rowsNewestFirst[i + 1];
    return { ...row, drift: previous ? previous.fingerprint !== row.fingerprint : false };
  });
}

export async function getTruthHistory(limit: number): Promise<TruthHistoryResult> {
  const capped = Math.max(1, Math.min(100, limit));

  if (isTruthLedgerPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    // Fetch one extra row so the oldest visible snapshot can still
    // get an honest drift comparison against its true predecessor.
    const result = await p.query(
      `SELECT id, fingerprint, claims_measured, claims_asserted, created_at
       FROM onx_truth_ledger ORDER BY id DESC LIMIT $1`,
      [capped + 1],
    );
    const rows: TruthSnapshotRow[] = (result.rows ?? []).map((r) => ({
      id: r.id,
      fingerprint: r.fingerprint,
      claimsMeasured: r.claims_measured,
      claimsAsserted: r.claims_asserted,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
    const flagged = withDriftFlags(rows).slice(0, capped);
    return { persistence: "POSTGRES", count: flagged.length, snapshots: flagged };
  }

  const newestFirst = [...memoryLedger].reverse().slice(0, capped + 1);
  const flagged = withDriftFlags(newestFirst).slice(0, capped);
  return { persistence: "UNPERSISTED", count: flagged.length, snapshots: flagged };
}

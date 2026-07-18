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

// STE-K-22: BOUNDED RETENTION. The ledger is captured hourly by the web
// cron (truth-snapshot-cron.ts) and would otherwise grow without limit in
// a production table. We keep only the newest N rows, pruning the oldest
// ATOMICALLY at capture time (same transaction as the insert). N=168 is
// exactly 7 days at the hourly cadence — long enough to observe week-scale
// truth drift, bounded enough to keep the table small. The bound is
// DISCLOSED on the read surface (measured), never a silent delete.
export const LEDGER_RETENTION_KEEP = 168;

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
  // STE-K-22: set ONLY on the oldest retained snapshot when its true
  // predecessor was pruned by bounded retention (so drift here is NOT a
  // measured comparison — it is named honestly, not implied false).
  predecessorPruned?: boolean;
}

let pool: Pool | null = null;
let schemaReady = false;

// In-memory fallback ring (newest last). Bounded by the same retention
// window as Postgres so the fallback is honest about being a bounded
// diagnostic buffer, not an unbounded database.
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
  // STE-K-22: how many oldest rows were pruned by retention in THIS
  // capture (measured), and the configured retention window.
  pruned: number;
  retentionKeep: number;
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
    // Insert + bounded-retention prune in ONE transaction so the table
    // never transiently exceeds the window and a concurrent reader never
    // sees a half-applied trim.
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const ins = await client.query(
        `INSERT INTO onx_truth_ledger (fingerprint, claims_measured, claims_asserted, report)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [report.fingerprint, report.claimsMeasured, report.claimsAsserted, JSON.stringify(report)],
      );
      // Delete everything older than the newest LEDGER_RETENTION_KEEP rows.
      // The threshold is the id of the (keep+1)-th newest row; rows with
      // id <= it are pruned. COALESCE(…,0) → delete nothing when the table
      // holds <= keep rows (OFFSET past the end returns no row).
      const del = await client.query(
        `DELETE FROM onx_truth_ledger
         WHERE id <= COALESCE(
           (SELECT id FROM onx_truth_ledger ORDER BY id DESC OFFSET $1 LIMIT 1), 0)`,
        [LEDGER_RETENTION_KEEP],
      );
      await client.query("COMMIT");
      return {
        id: ins.rows[0]?.id ?? -1,
        fingerprint: report.fingerprint,
        claimsMeasured: report.claimsMeasured,
        claimsAsserted: report.claimsAsserted,
        persistence: "POSTGRES",
        pruned: del.rowCount ?? 0,
        retentionKeep: LEDGER_RETENTION_KEEP,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const row: TruthSnapshotRow = {
    id: ++memoryIdCounter,
    fingerprint: report.fingerprint,
    claimsMeasured: report.claimsMeasured,
    claimsAsserted: report.claimsAsserted,
    createdAt: new Date().toISOString(),
  };
  memoryLedger.push(row);
  let pruned = 0;
  while (memoryLedger.length > LEDGER_RETENTION_KEEP) {
    memoryLedger.shift();
    pruned++;
  }
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    claimsMeasured: row.claimsMeasured,
    claimsAsserted: row.claimsAsserted,
    persistence: "UNPERSISTED",
    pruned,
    retentionKeep: LEDGER_RETENTION_KEEP,
  };
}

export interface RetentionDisclosure {
  // configured retention window (max rows kept) — matches LEDGER_RETENTION_KEEP.
  keep: number;
  // MEASURED smallest id currently stored (the oldest retained snapshot),
  // or null when the ledger is empty.
  oldestRetainedId: number | null;
  // true when the genesis snapshot (id=1) is still retained → nothing has
  // been pruned yet. false → retention has trimmed older rows (edge honesty).
  oldestRetainedIsGenesis: boolean;
}

export interface TruthHistoryResult {
  persistence: LedgerPersistence;
  count: number;
  snapshots: TruthHistoryEntry[]; // newest first
  // STE-K-22: measured retention policy disclosed on the read surface.
  retention: RetentionDisclosure;
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

// STE-K-22 edge honesty: when a page reaches the BOTTOM of the ledger, the
// oldest visible snapshot IS the oldest retained row. If that row is not the
// genesis snapshot (its id equals the measured min id but is > 1), its true
// predecessor was pruned by retention, so its drift:false is not a measured
// comparison — we NAME it (predecessorPruned) instead of implying no drift.
function markPrunedEdge(
  flagged: TruthHistoryEntry[],
  reachedBottom: boolean,
  oldestRetainedId: number | null,
): void {
  if (!reachedBottom || flagged.length === 0) return;
  const oldest = flagged[flagged.length - 1];
  if (oldestRetainedId != null && oldest.id === oldestRetainedId && oldest.id > 1) {
    oldest.predecessorPruned = true;
  }
}

// STE-K-22: MEASURED smallest id currently stored (oldest retained row).
async function measureOldestRetainedId(): Promise<number | null> {
  if (isTruthLedgerPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const result = await p.query(`SELECT MIN(id)::int AS m FROM onx_truth_ledger`);
    const m = result.rows[0]?.m;
    return m == null ? null : Number(m);
  }
  return memoryLedger.length ? memoryLedger[0].id : null;
}

// STE-K-15: total number of ledger rows (independent of the paged
// read limit) so the honest surface can report the true snapshot
// count, not just the size of the current page.
export async function getTruthLedgerCount(): Promise<number> {
  if (isTruthLedgerPersistenceConfigured()) {
    await ensureSchema();
    const p = getPool();
    const result = await p.query(`SELECT COUNT(*)::int AS n FROM onx_truth_ledger`);
    return Number(result.rows[0]?.n ?? 0);
  }
  return memoryLedger.length;
}

// STE-K-15: a compact, MEASURED summary of the latest ledger state for
// the honest public surface (onx.selfVerify). An empty ledger is a
// VALID named state ("EMPTY"), never fabricated history. The latest
// snapshot's drift flag is real: getTruthHistory(1) fetches one extra
// row so the single visible snapshot is compared against its true
// predecessor. All fields are read from the ledger, none asserted.
export interface TruthLedgerSummary {
  state: "POPULATED" | "EMPTY";
  persistence: LedgerPersistence;
  count: number;
  latestFingerprint: string | null;
  capturedAt: string | null;
  claimsMeasured: number | null;
  claimsAsserted: number | null;
  drift: boolean;
  // STE-K-22: measured retention policy (also surfaced on selfVerify).
  retention: RetentionDisclosure;
}

export async function summarizeTruthLedger(): Promise<TruthLedgerSummary> {
  const history = await getTruthHistory(1);
  const count = await getTruthLedgerCount();
  const latest = history.snapshots[0];
  if (!latest) {
    return {
      state: "EMPTY",
      persistence: history.persistence,
      count: 0,
      latestFingerprint: null,
      capturedAt: null,
      claimsMeasured: null,
      claimsAsserted: null,
      drift: false,
      retention: history.retention,
    };
  }
  return {
    state: "POPULATED",
    persistence: history.persistence,
    count,
    latestFingerprint: latest.fingerprint,
    capturedAt: latest.createdAt,
    claimsMeasured: latest.claimsMeasured,
    claimsAsserted: latest.claimsAsserted,
    drift: latest.drift,
    retention: history.retention,
  };
}

export async function getTruthHistory(limit: number): Promise<TruthHistoryResult> {
  const capped = Math.max(1, Math.min(100, limit));
  const oldestRetainedId = await measureOldestRetainedId();
  const retention: RetentionDisclosure = {
    keep: LEDGER_RETENTION_KEEP,
    oldestRetainedId,
    oldestRetainedIsGenesis: oldestRetainedId === 1,
  };

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
    const reachedBottom = rows.length <= capped;
    const flagged = withDriftFlags(rows).slice(0, capped);
    markPrunedEdge(flagged, reachedBottom, oldestRetainedId);
    return { persistence: "POSTGRES", count: flagged.length, snapshots: flagged, retention };
  }

  const newestFirst = [...memoryLedger].reverse().slice(0, capped + 1);
  const reachedBottom = newestFirst.length <= capped;
  const flagged = withDriftFlags(newestFirst).slice(0, capped);
  markPrunedEdge(flagged, reachedBottom, oldestRetainedId);
  return { persistence: "UNPERSISTED", count: flagged.length, snapshots: flagged, retention };
}

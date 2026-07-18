// ============================================================
// TRUTH SNAPSHOT CRON (STE-K-14) — live capture from the web
// service's existing cron. Closes the K-13 gap: before this, the
// truth ledger was empty on production because the only recorder
// was the standalone `onx-scheduler` worker (render.yaml autoDeploy
// :false / branch:main — not deployed). We now capture from the
// live web cron (api/boot.ts) instead of running a second service.
//
// CADENCE — hourly, justified: truth drift tracks DEPLOYS and
// capability changes, not minutes. The web cron ticks every 5 min
// (boot.ts), but snapshotting every tick would write ~288 near-
// identical rows/day and grow the Postgres ledger with no signal.
// An hourly gate (24/day) captures drift honestly while staying
// cheap. The gate uses an injectable clock so tests drive cadence
// deterministically.
//
// NON-FATAL — a failed snapshot is logged server-side and NEVER
// throws: the living-loop tick and the whole web service must
// survive a bad ledger write (honest-cron survival pattern, S-10).
//
// DOUBLE-CAPTURE — if `onx-scheduler` is ever deployed alongside
// the web service, both will record. That is safe: every snapshot
// row is independent by its own id + timestamp (no unique key to
// violate), and the drift flag stays correct (identical fingerprints
// → drift:false). No guard is needed; documented in the runbook و.8.
// ============================================================
import { recordTruthSnapshot, type RecordSnapshotResult } from "./truth-ledger";

export const TRUTH_SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let lastSnapshotAt = 0;

// Test seam: reset the cadence gate between cases.
export function __resetTruthSnapshotCronForTests(): void {
  lastSnapshotAt = 0;
}

// Called from the web cron every tick. Records a truth snapshot at
// most once per TRUTH_SNAPSHOT_INTERVAL_MS. Returns the snapshot on a
// successful capture, or null when skipped by cadence or when a
// failure was swallowed (non-fatal). The clock is injectable.
export async function maybeRecordTruthSnapshot(
  now: number = Date.now(),
): Promise<RecordSnapshotResult | null> {
  // lastSnapshotAt === 0 means "never captured yet" → always record on
  // the first tick after boot, regardless of the absolute clock value.
  if (lastSnapshotAt !== 0 && now - lastSnapshotAt < TRUTH_SNAPSHOT_INTERVAL_MS) return null;
  try {
    const snap = await recordTruthSnapshot();
    // Advance the gate only on success so a failed write retries next
    // tick instead of silently skipping a whole hour.
    lastSnapshotAt = now;
    process.stderr.write(
      `[truth-snapshot] #${snap.id} fp=${snap.fingerprint.slice(0, 12)}… (${snap.persistence})\n`,
    );
    return snap;
  } catch (err) {
    console.error("[truth-snapshot] capture failed (non-fatal):", err);
    return null;
  }
}

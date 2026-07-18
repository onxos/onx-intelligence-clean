import { describe, it, expect, vi, beforeEach } from "vitest";

// Deterministic control over the ledger write so we can assert cadence
// and non-fatal behaviour without a database.
const recordMock = vi.fn();
vi.mock("../lib/truth-ledger", () => ({
  recordTruthSnapshot: () => recordMock(),
}));

import {
  maybeRecordTruthSnapshot,
  TRUTH_SNAPSHOT_INTERVAL_MS,
  __resetTruthSnapshotCronForTests,
} from "../lib/truth-snapshot-cron";

const okSnap = {
  id: 1,
  fingerprint: "a".repeat(64),
  claimsMeasured: 19,
  claimsAsserted: 0,
  persistence: "UNPERSISTED" as const,
};

describe("truth-snapshot-cron (STE-K-14)", () => {
  beforeEach(() => {
    recordMock.mockReset();
    __resetTruthSnapshotCronForTests();
  });

  it("uses an hourly cadence", () => {
    expect(TRUTH_SNAPSHOT_INTERVAL_MS).toBe(60 * 60 * 1000);
  });

  it("records on the first tick after boot", async () => {
    recordMock.mockResolvedValue(okSnap);
    const r = await maybeRecordTruthSnapshot(1_000_000);
    expect(r).toEqual(okSnap);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("skips a second tick inside the same hour (cadence gate)", async () => {
    recordMock.mockResolvedValue(okSnap);
    const t0 = 1_000_000;
    await maybeRecordTruthSnapshot(t0);
    const r = await maybeRecordTruthSnapshot(t0 + TRUTH_SNAPSHOT_INTERVAL_MS - 1);
    expect(r).toBeNull();
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("records again once the hour has elapsed", async () => {
    recordMock.mockResolvedValue(okSnap);
    const t0 = 1_000_000;
    await maybeRecordTruthSnapshot(t0);
    const r = await maybeRecordTruthSnapshot(t0 + TRUTH_SNAPSHOT_INTERVAL_MS);
    expect(r).toEqual(okSnap);
    expect(recordMock).toHaveBeenCalledTimes(2);
  });

  it("is NON-FATAL: a failing write is swallowed and returns null, never throws", async () => {
    recordMock.mockRejectedValue(new Error("ledger write blew up"));
    await expect(maybeRecordTruthSnapshot(1_000_000)).resolves.toBeNull();
  });

  it("retries on the next tick after a swallowed failure (gate not advanced on failure)", async () => {
    const t0 = 1_000_000;
    recordMock.mockRejectedValueOnce(new Error("transient"));
    const first = await maybeRecordTruthSnapshot(t0);
    expect(first).toBeNull();
    // Only 1 minute later — would be skipped if the gate had advanced,
    // but a failure must NOT consume the hourly slot.
    recordMock.mockResolvedValue(okSnap);
    const second = await maybeRecordTruthSnapshot(t0 + 60_000);
    expect(second).toEqual(okSnap);
    expect(recordMock).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// TRUTH LEDGER — STE-K-03 tests (no external DB; mocked pg Pool
// following the corpus-ingest.test.ts pattern).
// Proves: SQL text (CREATE TABLE / INSERT / SELECT ORDER BY),
// drift detection, honest UNPERSISTED memory fallback, bridge
// fail-closed rejection, and zero env leakage (canary).
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
    // STE-K-22: recordTruthSnapshot wraps insert+prune in a transaction via
    // a pooled client. The client routes to the same queryMock so SQL
    // contracts remain observable in queryMock.mock.calls.
    connect = async () => ({ query: queryMock, release: releaseMock });
  },
}));

vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      bridgeEnabled: true,
      bridgeSharedSecret: "test-bridge-secret",
    },
  };
});

import { appRouter } from "../router";
import {
  __resetTruthLedgerForTests,
  getTruthHistory,
  recordTruthSnapshot,
  summarizeTruthLedger,
} from "../lib/truth-ledger";
import { __resetProviderRegistryForTests } from "../lib/provider-registry";

const CANARY = "TRUTH-LEDGER-CANARY-VALUE-9f2c7e";

function bridgeCtx() {
  return {
    req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
  } as never;
}

describe("truth ledger (STE-K-03)", () => {
  beforeEach(() => {
    __resetTruthLedgerForTests();
    __resetProviderRegistryForTests();
    queryMock.mockReset();
    delete process.env.DATABASE_URL;
    delete process.env.TRUTH_CANARY_KEY;
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.TRUTH_CANARY_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("rejects truthSnapshot without a valid bridge key (fail-closed)", async () => {
    const caller = appRouter.createCaller({
      req: { headers: new Headers({ "x-onx-bridge-key": "wrong-key" }) },
    } as never);
    await expect(caller.onx.truthSnapshot()).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("memory fallback: honest UNPERSISTED snapshots + history newest-first", async () => {
    const caller = appRouter.createCaller(bridgeCtx());
    const first = await caller.onx.truthSnapshot();
    expect(first.persistence).toBe("UNPERSISTED");
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const second = await caller.onx.truthSnapshot();
    expect(second.id).toBe(first.id + 1);

    const history = await caller.onx.truthHistory({ limit: 10 });
    expect(history.persistence).toBe("UNPERSISTED");
    expect(history.count).toBe(2);
    expect(history.snapshots[0].id).toBe(second.id); // newest first
    expect(history.snapshots[1].id).toBe(first.id);
  });

  it("drift detection: a real fact change flips the fingerprint and sets drift=true", async () => {
    await recordTruthSnapshot();
    await recordTruthSnapshot(); // identical facts → same fingerprint
    process.env.ANTHROPIC_API_KEY = "sk-drift-test-key-123456"; // fact change: MISSING_KEY → CONFIGURED_UNPROBED
    await recordTruthSnapshot();

    const history = await getTruthHistory(10);
    const [newest, middle, oldest] = history.snapshots;
    expect(newest.fingerprint).not.toBe(middle.fingerprint);
    expect(newest.drift).toBe(true); // fact changed before it
    expect(middle.drift).toBe(false); // identical to its predecessor
    expect(oldest.drift).toBe(false); // no predecessor in view
  });

  it("postgres path: exact SQL contracts (CREATE TABLE, INSERT RETURNING, SELECT ORDER BY DESC)", async () => {
    process.env.DATABASE_URL = "postgresql://onx:onx@localhost:5432/onx";
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes("INSERT")) return { rowCount: 1, rows: [{ id: 7 }] };
      if (String(sql).includes("SELECT"))
        return {
          rowCount: 2,
          rows: [
            { id: 7, fingerprint: "b".repeat(64), claims_measured: 19, claims_asserted: 0, created_at: new Date("2026-07-13T12:00:00Z") },
            { id: 6, fingerprint: "a".repeat(64), claims_measured: 19, claims_asserted: 0, created_at: new Date("2026-07-13T11:00:00Z") },
          ],
        };
      return { rowCount: 0, rows: [] };
    });

    const snap = await recordTruthSnapshot();
    expect(snap.persistence).toBe("POSTGRES");
    expect(snap.id).toBe(7);

    const history = await getTruthHistory(5);
    expect(history.persistence).toBe("POSTGRES");
    expect(history.snapshots[0].id).toBe(7);
    expect(history.snapshots[0].drift).toBe(true); // b… differs from a…
    expect(history.snapshots[0].claimsMeasured).toBe(19);

    const sqls = queryMock.mock.calls.map(([s]) => String(s));
    const create = sqls.find((s) => s.includes("onx_truth_ledger") && s.includes("CREATE"));
    expect(create).toContain("CREATE TABLE IF NOT EXISTS onx_truth_ledger");
    expect(create).toContain("id SERIAL PRIMARY KEY");
    expect(create).toContain("fingerprint VARCHAR(64) NOT NULL");
    expect(create).toContain("report JSONB NOT NULL");
    const insert = sqls.find((s) => s.includes("INSERT"));
    expect(insert).toContain("INSERT INTO onx_truth_ledger");
    expect(insert).toContain("RETURNING id");
    // buildSelfVerification's live DB ping also issues "SELECT 1" on
    // the mocked pool — target the ledger's own statements explicitly.
    const select = sqls.find((s) => s.includes("SELECT") && s.includes("onx_truth_ledger"));
    expect(select).toContain("ORDER BY id DESC");
  });

  it("never leaks env values: canary absent from snapshot and history JSON", async () => {
    process.env.TRUTH_CANARY_KEY = CANARY;
    const caller = appRouter.createCaller(bridgeCtx());
    const snap = await caller.onx.truthSnapshot();
    const history = await caller.onx.truthHistory({ limit: 5 });
    expect(JSON.stringify(snap)).not.toContain(CANARY);
    expect(JSON.stringify(history)).not.toContain(CANARY);
  });

  // STE-K-15: the honest-surface summary (exposed on onx.selfVerify).
  it("summary: EMPTY ledger is a named honest state, not fabricated history", async () => {
    const summary = await summarizeTruthLedger();
    expect(summary.state).toBe("EMPTY");
    expect(summary.count).toBe(0);
    expect(summary.latestFingerprint).toBeNull();
    expect(summary.capturedAt).toBeNull();
    expect(summary.drift).toBe(false);
  });

  it("summary: drift=false path — latest snapshot identical to its predecessor", async () => {
    await recordTruthSnapshot();
    await recordTruthSnapshot(); // identical facts → same fingerprint
    const summary = await summarizeTruthLedger();
    expect(summary.state).toBe("POPULATED");
    expect(summary.count).toBe(2);
    expect(summary.drift).toBe(false);
    expect(summary.latestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(summary.capturedAt).not.toBeNull();
    expect(summary.claimsMeasured).toBe(20);
  });

  it("summary: drift=true path — a real fact change flips the latest flag", async () => {
    await recordTruthSnapshot();
    process.env.ANTHROPIC_API_KEY = "sk-summary-drift-key-123456"; // MISSING_KEY → CONFIGURED_UNPROBED
    await recordTruthSnapshot();
    const summary = await summarizeTruthLedger();
    expect(summary.state).toBe("POPULATED");
    expect(summary.count).toBe(2);
    expect(summary.drift).toBe(true); // latest differs from predecessor
  });

  // ============================================================
  // STE-K-22: bounded retention with MEASURED honest disclosure.
  // ============================================================
  it("memory capture: pruned=0 and retentionKeep disclosed while under the window", async () => {
    const snap = await recordTruthSnapshot();
    expect(snap.persistence).toBe("UNPERSISTED");
    expect(snap.pruned).toBe(0);
    expect(snap.retentionKeep).toBe(168);
  });

  it("memory read: retention disclosure names genesis retained when nothing was pruned", async () => {
    await recordTruthSnapshot();
    await recordTruthSnapshot();
    const history = await getTruthHistory(10);
    expect(history.retention.keep).toBe(168);
    expect(history.retention.oldestRetainedId).toBe(1);
    expect(history.retention.oldestRetainedIsGenesis).toBe(true);
    // predecessor NOT pruned (genesis is present) → no fabricated edge flag
    expect(history.snapshots[history.snapshots.length - 1].predecessorPruned).toBeUndefined();
    expect(summaryDrift(history.snapshots)).toBe(false);
  });

  it("summary carries the measured retention disclosure", async () => {
    await recordTruthSnapshot();
    const summary = await summarizeTruthLedger();
    expect(summary.retention.keep).toBe(168);
    expect(summary.retention.oldestRetainedId).toBe(1);
    expect(summary.retention.oldestRetainedIsGenesis).toBe(true);
  });

  it("postgres capture: insert+prune are ATOMIC (BEGIN/INSERT/DELETE OFFSET keep/COMMIT)", async () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/onx";
    const order: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      order.push(s.trim().split(/\s+/).slice(0, 2).join(" "));
      if (s.includes("INSERT INTO onx_truth_ledger")) return { rowCount: 1, rows: [{ id: 200 }] };
      if (s.includes("DELETE FROM onx_truth_ledger")) return { rowCount: 3, rows: [] };
      return { rowCount: 0, rows: [] };
    });

    const snap = await recordTruthSnapshot();
    expect(snap.persistence).toBe("POSTGRES");
    expect(snap.id).toBe(200);
    expect(snap.retentionKeep).toBe(168);
    expect(snap.pruned).toBe(3);

    const del = queryMock.mock.calls.find(([s]) => String(s).includes("DELETE FROM onx_truth_ledger"));
    expect(del).toBeTruthy();
    expect(del![1]).toEqual([168]); // OFFSET bound = retention keep
    expect(String(del![0])).toContain("OFFSET $1");
    // transaction envelope present and correctly ordered around the writes
    const begin = order.findIndex((o) => o.startsWith("BEGIN"));
    const insert = order.findIndex((o) => o.startsWith("INSERT INTO"));
    const delIdx = order.findIndex((o) => o.startsWith("DELETE FROM"));
    const commit = order.findIndex((o) => o.startsWith("COMMIT"));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(begin);
    expect(delIdx).toBeGreaterThan(insert);
    expect(commit).toBeGreaterThan(delIdx);
  });

  it("postgres read: discloses measured retention + NAMES a pruned-predecessor edge honestly", async () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/onx";
    queryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("MIN(id)")) return { rowCount: 1, rows: [{ m: 40 }] }; // oldest retained id=40 (older pruned)
      if (s.includes("SELECT id, fingerprint"))
        return {
          rowCount: 2,
          rows: [
            { id: 41, fingerprint: "b".repeat(64), claims_measured: 19, claims_asserted: 0, created_at: new Date("2026-01-02T00:00:00Z") },
            { id: 40, fingerprint: "a".repeat(64), claims_measured: 19, claims_asserted: 0, created_at: new Date("2026-01-01T00:00:00Z") },
          ],
        };
      return { rowCount: 0, rows: [] };
    });

    const history = await getTruthHistory(50); // asks 51, gets 2 → reached bottom of the retained window
    expect(history.retention.keep).toBe(168);
    expect(history.retention.oldestRetainedId).toBe(40);
    expect(history.retention.oldestRetainedIsGenesis).toBe(false);

    const oldest = history.snapshots[history.snapshots.length - 1];
    expect(oldest.id).toBe(40);
    // predecessor was pruned by retention → named, and drift stays false
    // (drift is not measurable once the predecessor is gone).
    expect(oldest.predecessorPruned).toBe(true);
    expect(oldest.drift).toBe(false);
  });
});

// local helper: latest-flag reading used by the retention disclosure test
function summaryDrift(snaps: Array<{ drift: boolean }>): boolean {
  return snaps[0]?.drift ?? false;
}

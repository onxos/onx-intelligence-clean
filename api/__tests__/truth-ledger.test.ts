// ============================================================
// TRUTH LEDGER — STE-K-03 tests (no external DB; mocked pg Pool
// following the corpus-ingest.test.ts pattern).
// Proves: SQL text (CREATE TABLE / INSERT / SELECT ORDER BY),
// drift detection, honest UNPERSISTED memory fallback, bridge
// fail-closed rejection, and zero env leakage (canary).
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
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
});

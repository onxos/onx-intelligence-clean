// Guardian alert acknowledgment — human review lifts an alert out of the
// ACTIVE violation set (D-059 gate) without ever deleting the record.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, bridgeEnabled: true, bridgeSharedSecret: "test-bridge-secret" },
  };
});

import { appRouter } from "../router";
import { __resetEngineStateStoreForTests } from "../lib/engine-state-store";

const caller = (key?: string) =>
  appRouter.createCaller({
    req: { headers: new Headers(key ? { "x-onx-bridge-key": key } : {}) },
  } as never);

describe("Guardian — alert acknowledgment (human gate, tamper-evident)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    __resetEngineStateStoreForTests();
  });

  it("acknowledging a reviewed RED alert clears the active violation but keeps the record", async () => {
    const c = caller("test-bridge-secret");

    // cause a real violation
    const r = await c.runtime.guardian.checkAmanah({ score: 0.2 });
    expect(r.passed).toBe(false);
    let stats = await c.runtime.guardian.stats();
    expect(stats.violations).toBe(1);
    const alerts = await c.runtime.guardian.alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("AMANAH_FLOOR_VIOLATION");

    // the gate is bridge-guarded
    await expect(
      caller().runtime.guardian.acknowledgeAlert({ id: "alert-1", reason: "no key" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    // human review acknowledges with a reason
    const ack = await c.runtime.guardian.acknowledgeAlert({
      id: "alert-1",
      reason: "deliberate hard-block verification test",
    });
    expect(ack).toMatchObject({ found: true, alreadyAcknowledged: false });

    // active violation set is now empty (D-059 can proceed)…
    stats = await c.runtime.guardian.stats();
    expect(stats.violations).toBe(0);

    // …but the record was never deleted and carries the review trail
    const after = await c.runtime.guardian.alerts();
    expect(after).toHaveLength(1);
    expect(after[0].acknowledged).toBe(true);
    expect(after[0].ackReason).toContain("verification test");
    expect(after[0].ackTs).toBeTruthy();

    // idempotent: a second ack never double-decrements
    const again = await c.runtime.guardian.acknowledgeAlert({ id: "alert-1", reason: "dup" });
    expect(again.alreadyAcknowledged).toBe(true);
    stats = await c.runtime.guardian.stats();
    expect(stats.violations).toBe(0);

    // unknown id is reported, not silent
    const missing = await c.runtime.guardian.acknowledgeAlert({ id: "alert-99", reason: "nope" });
    expect(missing.found).toBe(false);
  });
});

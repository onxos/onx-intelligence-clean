// ============================================================
// ENGINE PERSISTENCE — Line I / Phase 1 tests
// Proves: (1) snapshot/restore round-trips preserve engine state,
// (2) the continuity chain uses REAL sha256 tamper-evidence
// (mutating one byte of history breaks verification),
// (3) the persistence status endpoint reports honestly with no DB.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  GoalEngine,
  CausalGraph,
  ContinuityEngine,
  UnderstandingLadder,
  Auditor,
} from "@onx/intelligence-runtime";
import { appRouter } from "../router";

describe("Engine snapshot/restore round-trips", () => {
  it("GoalEngine: goals survive a simulated restart", () => {
    const a = new GoalEngine();
    a.createGoal("Grow IUC", "Accumulate understanding capital", 100, "units");
    a.updateProgress(a.getActiveGoals()[0].id, 42);
    const snap = JSON.parse(JSON.stringify(a.snapshot())); // simulate JSONB
    const b = new GoalEngine();
    b.restore(snap);
    expect(b.getStats().total).toBe(1);
    expect(b.getActiveGoals()[0].current).toBe(42);
  });

  it("CausalGraph: nodes and edges survive", () => {
    const a = new CausalGraph();
    a.addNode({ id: 0, objectId: "obj-1" });
    a.addNode({ id: 1, objectId: "obj-2" });
    a.addEdge("obj-1", "obj-2", "leads_to", 0.9);
    const b = new CausalGraph();
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.getStats()).toEqual({ nodes: 2, edges: 1 });
  });

  it("UnderstandingLadder + Auditor survive", () => {
    const ladder = new UnderstandingLadder();
    ladder.ascend("test");
    ladder.ascend("test2");
    const ladder2 = new UnderstandingLadder();
    ladder2.restore(JSON.parse(JSON.stringify(ladder.snapshot())));
    expect(ladder2.getCurrentRung()).toBe(2);

    const aud = new Auditor();
    aud.audit("corpus", "INGEST", { count: 12 });
    const aud2 = new Auditor();
    aud2.restore(JSON.parse(JSON.stringify(aud.snapshot())));
    expect(aud2.getSummary().total).toBe(1);
  });
});

describe("ContinuityEngine — REAL sha256 tamper-evidence", () => {
  it("builds a verifiable chain and survives restore", () => {
    const a = new ContinuityEngine();
    a.record("L3_EVENT", "INGEST", "doc-1", { count: 1 });
    a.record("L4_DECISION", "APPROVE", "doc-1", { by: "founder" });
    expect(a.verifyChain().valid).toBe(true);
    expect(a.getStats().totalRecords).toBe(2);
    // hashes are real sha256 (64 hex), not Date.now-random
    const snap = a.snapshot() as { records: Array<{ hash: string }> };
    expect(snap.records[0].hash).toMatch(/^[0-9a-f]{64}$/);

    const b = new ContinuityEngine();
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.verifyChain().valid).toBe(true);
  });

  it("detects tampering with any historical record", () => {
    const a = new ContinuityEngine();
    a.record("L3_EVENT", "INGEST", "doc-1", { count: 1 });
    a.record("L4_DECISION", "APPROVE", "doc-1", { by: "founder" });
    const tampered = JSON.parse(JSON.stringify(a.snapshot()));
    tampered.records[0].data.count = 999; // attacker rewrites history
    const b = new ContinuityEngine();
    expect(() => b.restore(tampered)).toThrow("CONTINUITY_CHAIN_CORRUPT");
  });
});

describe("runtime.persistence.status — honest without DB", () => {
  it("reports configured:false and still answers", async () => {
    delete process.env.DATABASE_URL;
    const caller = appRouter.createCaller({ req: { headers: new Headers() } } as never);
    const status = await caller.runtime.persistence.status();
    expect(status.configured).toBe(false);
    expect(status.engines).toContain("continuity");
    expect(typeof status.counts.continuityRecords).toBe("number");
  });
});

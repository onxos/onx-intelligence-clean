// ============================================================
// IUC CONTINUITY + PROMOTION ENGINE — UNIT TESTS (I-M2)
// Covers: live IURG graph, hash-chain continuity, and the
// R1->R6 promotion state machine (auto + human-gated rungs).
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { IurgContinuityGraph } from "../iuc-continuity";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as any);

describe("IurgContinuityGraph — objects + hash chain", () => {
  it("records OBJECT_CREATED and grows a valid chain", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "a", type: "PERCEPTION", rank: 1 });
    g.addObject({ id: "b", type: "PATTERN", rank: 2 });
    const chain = g.getChain();
    expect(chain).toHaveLength(2);
    expect(chain[0].eventType).toBe("OBJECT_CREATED");
    expect(g.verifyChain().valid).toBe(true);
  });

  it("links every entry to the previous hash", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ type: "PERCEPTION", rank: 1 });
    g.addObject({ type: "PATTERN", rank: 2 });
    g.addObject({ type: "UNDERSTANDING", rank: 3 });
    const chain = g.getChain();
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].prevHash).toBe(chain[i - 1].hash);
    }
    expect(chain[0].prevHash).toBe("0".repeat(64));
  });

  it("auto-generates ids when none provided", () => {
    const g = new IurgContinuityGraph();
    const n1 = g.addObject({ type: "PERCEPTION" });
    const n2 = g.addObject({ type: "PATTERN" });
    expect(n1.id).not.toBe(n2.id);
    expect(g.list()).toHaveLength(2);
  });
});

describe("IurgContinuityGraph — promotion state machine", () => {
  it("auto-promotes R1->R2 when eligible", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "p", type: "PERCEPTION", rank: 1, trust: 0.7, sources: 2 });
    const res = g.attemptPromotion("p");
    expect(res.status).toBe("PROMOTED");
    expect(res.newRank).toBe(2);
    expect(g.get("p")?.rank).toBe(2);
    expect(g.getChain().some((e) => e.eventType === "PROMOTION_AUTO")).toBe(true);
  });

  it("holds a human-gated R3->R4 promotion as PENDING", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "u", type: "UNDERSTANDING", rank: 3, trust: 0.9 });
    const res = g.attemptPromotion("u");
    expect(res.status).toBe("PENDING");
    expect(res.gate).toBe("DG-09");
    expect(res.humanApprovalRequired).toBe(true);
    expect(g.get("u")?.rank).toBe(3); // unchanged until approval
    expect(g.getPending()).toHaveLength(1);
  });

  it("applies a pending promotion on approval", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "u", type: "UNDERSTANDING", rank: 3, trust: 0.9 });
    g.attemptPromotion("u");
    const appr = g.approve("u", "DG-09", "ops-manager");
    expect(appr.approved).toBe(true);
    expect(appr.newRank).toBe(4);
    expect(g.get("u")?.rank).toBe(4);
    expect(g.getPending()).toHaveLength(0);
    expect(g.verifyChain().valid).toBe(true);
    expect(g.getChain().some((e) => e.eventType === "PROMOTION_APPROVED")).toBe(true);
  });

  it("keeps rank on rejection and clears the pending request", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "u", type: "UNDERSTANDING", rank: 3, trust: 0.9 });
    g.attemptPromotion("u");
    const rej = g.reject("u", "DG-09", "ops-manager", "needs more evidence");
    expect(rej.approved).toBe(false);
    expect(g.get("u")?.rank).toBe(3);
    expect(g.getPending()).toHaveLength(0);
    expect(g.getChain().some((e) => e.eventType === "PROMOTION_REJECTED")).toBe(true);
  });

  it("reports INELIGIBLE when thresholds are not met", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "j", type: "JUDGMENT", rank: 4, trust: 0.5, overrides: 0 });
    expect(g.attemptPromotion("j").status).toBe("INELIGIBLE");
  });

  it("reports NOT_FOUND for unknown objects", () => {
    const g = new IurgContinuityGraph();
    expect(g.attemptPromotion("ghost").status).toBe("NOT_FOUND");
  });

  it("rejects gate mismatches on approval", () => {
    const g = new IurgContinuityGraph();
    g.addObject({ id: "u", type: "UNDERSTANDING", rank: 3, trust: 0.9 });
    g.attemptPromotion("u");
    const bad = g.approve("u", "DG-10", "founder");
    expect(bad.approved).toBe(false);
    expect(g.get("u")?.rank).toBe(3);
  });
});

describe("IUC Router — continuity endpoints (tRPC)", () => {
  beforeEach(async () => {
    await caller.iuc.reset();
  });

  it("exposes the live graph with contributions", async () => {
    const g = await caller.iuc.graph();
    expect(g.length).toBeGreaterThan(0);
    expect(g.every((n) => typeof n.contribution === "number")).toBe(true);
  });

  it("auto-promotes the seed perception R1->R2", async () => {
    const res = await caller.iuc.applyPromotion({ id: "seed-perc" });
    expect(res.status).toBe("PROMOTED");
    expect(res.newRank).toBe(2);
  });

  it("routes an understanding object through DG-09 approval", async () => {
    const pend = await caller.iuc.applyPromotion({ id: "seed-und" });
    expect(pend.status).toBe("PENDING");
    expect(pend.gate).toBe("DG-09");
    const pendingList = await caller.iuc.pending();
    expect(pendingList.some((p) => p.objectId === "seed-und")).toBe(true);
    const appr = await caller.iuc.approveGate({ id: "seed-und", gate: "DG-09", approver: "founder" });
    expect(appr.approved).toBe(true);
    expect(appr.newRank).toBe(4);
  });

  it("keeps a verifiable continuity chain across operations", async () => {
    await caller.iuc.applyPromotion({ id: "seed-perc" });
    const verify = await caller.iuc.verifyChain();
    expect(verify.valid).toBe(true);
    const chain = await caller.iuc.chain();
    expect(chain.total).toBeGreaterThan(0);
    expect(chain.entries.length).toBeGreaterThan(0);
  });

  it("reports chain + pending counts in stats", async () => {
    await caller.iuc.applyPromotion({ id: "seed-und" });
    const stats = await caller.iuc.stats();
    expect(stats.chainValid).toBe(true);
    expect(stats.chainLength).toBeGreaterThan(0);
    expect(stats.pendingCount).toBe(1);
  });
});

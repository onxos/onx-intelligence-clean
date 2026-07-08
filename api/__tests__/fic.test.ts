// ============================================================
// FIC v0.2 GOVERNANCE ENGINE + ROUTER — UNIT TESTS (M4)
// Covers the constraint registry, the Amanah 0.50 HARD_BLOCK floor
// (proof #6), HC rejections, DG gates, OR overrides, and the
// append-only Intent Evolution Ledger hash chain.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";
import { evaluateIntent, CONSTRAINT_COUNTS, AMANAH_FLOOR } from "../fic-engine";

const caller = appRouter.createCaller({} as any);

describe("FIC engine — constraint registry", () => {
  it("has the full 7-family constraint set", () => {
    expect(CONSTRAINT_COUNTS.HC).toBe(12);
    expect(CONSTRAINT_COUNTS.SC).toBe(12);
    expect(CONSTRAINT_COUNTS.AC).toBe(6);
    expect(CONSTRAINT_COUNTS.DG).toBe(12);
    expect(CONSTRAINT_COUNTS.EB).toBe(12);
    expect(CONSTRAINT_COUNTS.OVR).toBe(10);
    expect(CONSTRAINT_COUNTS.OR).toBe(5);
    expect(CONSTRAINT_COUNTS.total).toBe(69);
  });
});

describe("FIC engine — Amanah 0.50 floor (proof #6)", () => {
  it("HARD_BLOCKs an intent below the floor", () => {
    const v = evaluateIntent({ amanahScore: 0.3 });
    expect(v.amanah.status).toBe("HARD_BLOCK");
    expect(v.status).toBe("HARD_BLOCK");
    expect(v.allowed).toBe(false);
  });

  it("passes an intent at/above the floor", () => {
    const v = evaluateIntent({ amanahScore: AMANAH_FLOOR });
    expect(v.amanah.status).toBe("PASS");
  });

  it("lets a direct founder intent (L1) override the floor", () => {
    const v = evaluateIntent({ amanahScore: 0.2, founderL1: true });
    expect(v.amanah.status).toBe("PASS");
    expect(v.status).toBe("APPROVED");
  });
});

describe("FIC engine — hard constraints (auto-reject)", () => {
  it("rejects a live weight update (HC-01/EB-06)", () => {
    const v = evaluateIntent({ action: "LIVE_WEIGHT_UPDATE" });
    expect(v.status).toBe("REJECTED");
    expect(v.hardViolations.map((c) => c.id)).toContain("HC-01");
    expect(v.executionBlocks.map((c) => c.id)).toContain("EB-06");
  });

  it("rejects a claim with no evidence (HC-03)", () => {
    const v = evaluateIntent({ flags: ["CLAIM"], evidence: 0 });
    expect(v.status).toBe("REJECTED");
    expect(v.hardViolations.map((c) => c.id)).toContain("HC-03");
  });

  it("rejects when Frontier AI is not used (HC-06)", () => {
    const v = evaluateIntent({ usesFrontierAI: false });
    expect(v.hardViolations.map((c) => c.id)).toContain("HC-06");
  });

  it("rejects when Corpus is missing (HC-07/EB-09)", () => {
    const v = evaluateIntent({ usesCorpus: false });
    expect(v.hardViolations.map((c) => c.id)).toContain("HC-07");
    expect(v.executionBlocks.map((c) => c.id)).toContain("EB-09");
  });
});

describe("FIC engine — decision gates & overrides", () => {
  it("routes a medical decision to DG-01 as PENDING_GATES", () => {
    const v = evaluateIntent({ action: "MEDICAL_DECISION", flags: ["HUMAN_APPROVED"] });
    expect(v.status).toBe("PENDING_GATES");
    expect(v.requiredGates.map((c) => c.id)).toContain("DG-01");
  });

  it("gates a discount above 30% (DG-04)", () => {
    const v = evaluateIntent({ discountPercent: 40 });
    expect(v.requiredGates.map((c) => c.id)).toContain("DG-04");
  });

  it("permits a blocked action under an emergency override (OR)", () => {
    const v = evaluateIntent({ action: "DESTRUCTIVE_DELETE", emergency: "FOUNDER" });
    expect(v.status).toBe("OVERRIDE");
    expect(v.allowed).toBe(true);
    expect(v.activeOverride?.id).toBe("OR-02");
  });

  it("approves a clean intent", () => {
    const v = evaluateIntent({ amanahScore: 0.8, action: "GENERAL" });
    expect(v.status).toBe("APPROVED");
    expect(v.allowed).toBe(true);
  });
});

describe("FIC router — Intent Evolution Ledger", () => {
  beforeEach(async () => {
    await caller.fic.reset();
  });

  it("exposes the constraint registry", async () => {
    const res = await caller.fic.constraints();
    expect(res.counts.total).toBe(69);
    expect(res.amanahFloor).toBe(0.5);
    expect(res.overrides).toHaveLength(5);
  });

  it("records each evaluation as an append-only hash-chained entry", async () => {
    await caller.fic.evaluate({ amanahScore: 0.9 });
    await caller.fic.evaluate({ action: "LIVE_WEIGHT_UPDATE" });
    const led = await caller.fic.ledger();
    expect(led.total).toBe(2);
    const verify = await caller.fic.verifyLedger();
    expect(verify.valid).toBe(true);
  });

  it("labels a hard block event in the ledger", async () => {
    const res = await caller.fic.evaluate({ amanahScore: 0.2 });
    expect(res.verdict.status).toBe("HARD_BLOCK");
    expect(res.ledger.type).toBe("hard_block");
  });

  it("assess does not write to the ledger", async () => {
    await caller.fic.assess({ amanahScore: 0.9 });
    const led = await caller.fic.ledger();
    expect(led.total).toBe(0);
  });
});

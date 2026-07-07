// ============================================================
// PURPOSE COMPILER + FOUNDER COGNITIVE MODEL — UNIT TESTS (M4)
// Covers the 9-stage chain, the 7-question gate (flag vs escalate),
// and the Founder Cognitive Model alignment scoring.
// ============================================================
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import {
  compilePurpose,
  evaluatePurposeGate,
  scoreAlignment,
  escalationTime,
  PURPOSE_CHAIN,
  FCM_DIMENSIONS,
  FOUNDER_DECISION_PATTERNS,
} from "../purpose-compiler";

const caller = appRouter.createCaller({} as any);

describe("Purpose compiler — 9-stage chain", () => {
  it("has the 9 teleological stages in order", () => {
    expect(PURPOSE_CHAIN).toHaveLength(9);
    expect(PURPOSE_CHAIN[0].id).toBe("AMANAH");
    expect(PURPOSE_CHAIN[8].id).toBe("EVOLUTION");
  });

  it("advances only through leading satisfied stages", () => {
    const r = compilePurpose({ AMANAH: true, LIFE: true, POTENTIAL: false, EFFICACY: true });
    expect(r.depth).toBe(2);
    expect(r.reachedStage).toBe("LIFE");
    expect(r.blockedAt).toBe("POTENTIAL");
    expect(r.complete).toBe(false);
  });

  it("completes when all 9 stages pass", () => {
    const all = Object.fromEntries(PURPOSE_CHAIN.map((s) => [s.id, true]));
    const r = compilePurpose(all as any);
    expect(r.depth).toBe(9);
    expect(r.complete).toBe(true);
    expect(r.blockedAt).toBeNull();
  });
});

describe("Purpose gate — 7 questions", () => {
  it("passes with all yes", () => {
    expect(evaluatePurposeGate([true, true, true, true, true, true, true]).status).toBe("PASS");
  });

  it("flags on 1-2 no", () => {
    const r = evaluatePurposeGate([true, false, true, true, true, true, true]);
    expect(r.status).toBe("FLAG_REVIEW");
    expect(r.noCount).toBe(1);
    expect(r.escalate).toBe(false);
  });

  it("blocks + escalates on 3+ no", () => {
    const r = evaluatePurposeGate([false, false, false, true, true, true, true]);
    expect(r.status).toBe("BLOCK_ESCALATE");
    expect(r.escalate).toBe(true);
  });
});

describe("Founder Cognitive Model", () => {
  it("has 8 dimensions and 10 decision patterns", () => {
    expect(FCM_DIMENSIONS).toHaveLength(8);
    expect(FOUNDER_DECISION_PATTERNS).toHaveLength(10);
  });

  it("scores full alignment when all patterns satisfied", () => {
    const all = FOUNDER_DECISION_PATTERNS.map((p) => p.id);
    const r = scoreAlignment(all);
    expect(r.score).toBe(1);
    expect(r.verdict).toBe("ALIGNED");
  });

  it("marks misalignment when nothing matches", () => {
    const r = scoreAlignment([]);
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("MISALIGNED");
  });

  it("rates care-first as aligned", () => {
    const r = scoreAlignment(["FDP-001", "FDP-002", "FDP-003", "FDP-004", "FDP-005", "FDP-006", "FDP-007"]);
    expect(r.verdict).toBe("ALIGNED");
    expect(r.matched).toContain("FDP-001");
  });

  it("uses a fast medical escalation window", () => {
    expect(escalationTime("MEDICAL")).toBe("دقائق");
    expect(escalationTime("STRATEGIC")).toBe("24-48 ساعة");
  });
});

describe("Purpose router", () => {
  it("compiles and gates through the router", async () => {
    const c = await caller.purpose.compile({ satisfied: ["AMANAH", "LIFE", "POTENTIAL"] });
    expect(c.depth).toBe(3);
    const g = await caller.purpose.gate({ answers: [true, false, false, false, true, true, true] });
    expect(g.status).toBe("BLOCK_ESCALATE");
  });

  it("exposes the founder model and alignment", async () => {
    const fm = await caller.purpose.founderModel();
    expect(fm.dimensions).toHaveLength(8);
    expect(fm.overrides).toHaveLength(5);
    const a = await caller.purpose.alignment({ patterns: ["FDP-001", "FDP-007"] });
    expect(a.score).toBeGreaterThan(0);
  });
});

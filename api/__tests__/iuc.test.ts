// ============================================================
// IUC ENGINE + ROUTER — UNIT TESTS (I-M4)
// Covers: 16 IURG types, IUC equation, 11 indicators,
// 7 validation gates, R1→R6 ladder, and the tRPC router.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";
import {
  objectIUC,
  computeIUC,
  decayFactor,
  validationGates,
  checkPromotion,
  IURG_TYPES,
  TYPE_WEIGHTS,
  DECAY_FLOOR,
} from "../iuc-engine";

const caller = appRouter.createCaller({} as any);

describe("IUC Engine — IURG model", () => {
  it("defines exactly 16 object types", () => {
    expect(IURG_TYPES).toHaveLength(16);
    expect(IURG_TYPES).toContain("PERCEPTION");
    expect(IURG_TYPES).toContain("OUTCOME");
    expect(IURG_TYPES).toContain("FOUNDER_INTENT");
    expect(IURG_TYPES).toContain("CONSTITUTIONAL_CONSTRAINT");
    expect(IURG_TYPES).toContain("LEARNING_EVENT");
  });

  it("uses spec-calibrated core type weights (§2.3)", () => {
    expect(TYPE_WEIGHTS.PERCEPTION).toBe(1);
    expect(TYPE_WEIGHTS.PATTERN).toBe(5);
    expect(TYPE_WEIGHTS.UNDERSTANDING).toBe(20);
    expect(TYPE_WEIGHTS.JUDGMENT).toBe(50);
    expect(TYPE_WEIGHTS.OUTCOME).toBe(30);
  });
});

describe("IUC Engine — decay D(t) (§2.3)", () => {
  it("is 1.0 for a fresh object", () => {
    expect(decayFactor("PERCEPTION", 0)).toBe(1.0);
  });

  it("never decays constitutional / founder objects", () => {
    expect(decayFactor("CONSTITUTIONAL_CONSTRAINT", 1000)).toBe(1.0);
    expect(decayFactor("FOUNDER_INTENT", 1000)).toBe(1.0);
  });

  it("floors decay at DECAY_FLOOR", () => {
    expect(decayFactor("PERCEPTION", 100)).toBe(DECAY_FLOOR);
    expect(decayFactor("PERCEPTION", 100)).toBeGreaterThanOrEqual(0.20);
  });
});

describe("IUC Engine — objectIUC = U×C×M×V×Y×D", () => {
  it("computes a full-strength judgment object as its type weight", () => {
    const val = objectIUC({
      type: "JUDGMENT", rank: 6, verification: "PROVEN", context: 1, yield: 1, ageDays: 0,
    });
    expect(val).toBeCloseTo(50, 5); // 50 × 1 × 1.0 × 1.0 × 1 × 1
  });

  it("scales down with lower rank and verification", () => {
    const strong = objectIUC({ type: "UNDERSTANDING", rank: 6, verification: "PROVEN" });
    const weak = objectIUC({ type: "UNDERSTANDING", rank: 1, verification: "UNVERIFIED" });
    expect(strong).toBeGreaterThan(weak);
  });

  it("gives zero contribution to CONFLICT/OVERRIDE (weight 0)", () => {
    expect(objectIUC({ type: "OVERRIDE", rank: 3, verification: "PROVEN" })).toBe(0);
  });
});

describe("IUC Engine — computeIUC snapshot (§2.4)", () => {
  const sample = [
    { type: "JUDGMENT" as const, rank: 4 as const, verification: "PROVEN" as const, amanah: 0.96, founderAlignment: 0.97, validated: true, transfer: 0.8, yield: 0.9 },
    { type: "UNDERSTANDING" as const, rank: 3 as const, verification: "CONFIRMED" as const, amanah: 0.95, founderAlignment: 0.96, validated: true, transfer: 0.75 },
    { type: "OUTCOME" as const, rank: 5 as const, verification: "PROVEN" as const, amanah: 0.98, founderAlignment: 0.98, validated: true, transfer: 0.85, overrides: 0 },
  ];

  it("returns exactly the 11 dashboard indicators", () => {
    const snap = computeIUC(sample);
    expect(snap.indicators).toHaveLength(11);
    const keys = snap.indicators.map((i) => i.key);
    expect(keys).toEqual(["TUC", "UGR", "UY", "URS", "UC", "UCV", "UT", "UM", "UVR", "CAS", "FAS"]);
  });

  it("accumulates positive TUC", () => {
    const snap = computeIUC(sample);
    expect(snap.tuc).toBeGreaterThan(0);
    expect(snap.capital).toBeGreaterThan(0);
  });

  it("computes UGR from a previous TUC baseline", () => {
    const first = computeIUC(sample);
    const grown = computeIUC([...sample, { type: "PATTERN" as const, rank: 2 as const, verification: "PROBABLE" as const }], { previousTUC: first.tuc });
    const ugr = grown.indicators.find((i) => i.key === "UGR");
    expect(ugr?.value).toBeGreaterThan(0);
  });

  it("flags CAS/FAS GREEN when alignment exceeds 0.95", () => {
    const snap = computeIUC(sample);
    const cas = snap.indicators.find((i) => i.key === "CAS");
    const fas = snap.indicators.find((i) => i.key === "FAS");
    expect(cas?.status).toBe("GREEN");
    expect(fas?.status).toBe("GREEN");
  });

  it("penalizes overrides and catastrophes", () => {
    const clean = computeIUC(sample);
    const damaged = computeIUC([...sample, { type: "OVERRIDE" as const, rank: 3 as const, overrides: 3, catastrophe: true }]);
    expect(damaged.penalties).toBeGreaterThan(clean.penalties);
  });

  it("handles an empty graph without throwing", () => {
    const snap = computeIUC([]);
    expect(snap.tuc).toBe(0);
    expect(snap.indicators).toHaveLength(11);
  });
});

describe("IUC Engine — 7 validation gates (§2.3)", () => {
  it("passes a well-formed object", () => {
    const res = validationGates({
      type: "UNDERSTANDING", verification: "PROBABLE", sources: 2, trust: 0.7, amanah: 0.6, transfer: 0.7, drift: 0,
    });
    expect(res.passed).toBe(true);
    expect(res.gates).toHaveLength(7);
  });

  it("fails on low trust", () => {
    const res = validationGates({ type: "PERCEPTION", verification: "PROBABLE", sources: 2, trust: 0.4, amanah: 0.6, transfer: 0.7 });
    expect(res.passed).toBe(false);
    expect(res.gates.find((g) => g.name === "TRUST")?.passed).toBe(false);
  });

  it("fails on a single source", () => {
    const res = validationGates({ type: "PATTERN", verification: "PROBABLE", sources: 1, trust: 0.8, amanah: 0.6, transfer: 0.7 });
    expect(res.gates.find((g) => g.name === "SOURCES")?.passed).toBe(false);
  });
});

describe("IUC Engine — R1→R6 ladder (§2.2)", () => {
  it("auto-promotes R1→R2 with trust ≥ 0.60 and 2 sources", () => {
    const p = checkPromotion({ type: "PATTERN", rank: 1, trust: 0.62, sources: 2 });
    expect(p.eligible).toBe(true);
    expect(p.nextRank).toBe(2);
    expect(p.humanApprovalRequired).toBe(false);
  });

  it("requires DG-09 for R3→R4", () => {
    const p = checkPromotion({ type: "JUDGMENT", rank: 3, trust: 0.86 });
    expect(p.eligible).toBe(true);
    expect(p.gate).toBe("DG-09");
    expect(p.humanApprovalRequired).toBe(true);
  });

  it("requires DG-10 + zero overrides for R4→R5", () => {
    expect(checkPromotion({ type: "JUDGMENT", rank: 4, trust: 0.95, overrides: 1 }).eligible).toBe(false);
    const ok = checkPromotion({ type: "JUDGMENT", rank: 4, trust: 0.95, overrides: 0 });
    expect(ok.eligible).toBe(true);
    expect(ok.gate).toBe("DG-10");
  });

  it("caps at R6 (constitutional ceiling)", () => {
    const p = checkPromotion({ type: "CONSTITUTIONAL_CONSTRAINT", rank: 6, trust: 1 });
    expect(p.nextRank).toBeNull();
    expect(p.eligible).toBe(false);
  });
});

describe("IUC Router (tRPC)", () => {
  beforeEach(async () => {
    await caller.iuc.reset();
  });

  it("exposes the 16 IURG object types", async () => {
    const res = await caller.iuc.objectTypes();
    expect(res.total).toBe(16);
    expect(res.causalChain).toHaveLength(7);
    expect(res.constraintLayer).toHaveLength(2);
    expect(res.supporting).toHaveLength(7);
  });

  it("returns the 5-rung ladder", async () => {
    const res = await caller.iuc.ladder();
    expect(res.ranks).toHaveLength(5);
    expect(res.ranks[2].gate).toBe("DG-09");
  });

  it("returns a live snapshot with 11 indicators over the seed graph", async () => {
    const snap = await caller.iuc.snapshot();
    expect(snap.indicators).toHaveLength(11);
    expect(snap.objectCount).toBeGreaterThan(0);
    expect(snap.tuc).toBeGreaterThan(0);
  });

  it("ingests an object and grows the store", async () => {
    const before = await caller.iuc.stats();
    const res = await caller.iuc.ingest({ type: "PERCEPTION", rank: 1, verification: "POSSIBLE", sources: 2, trust: 0.65 });
    expect(res.stored).toBe(true);
    expect(res.objectCount).toBe(before.objectCount + 1);
    expect(res.validation.gates).toHaveLength(7);
    expect(res.promotion.currentRank).toBe(1);
  });

  it("commits snapshots into history", async () => {
    const c1 = await caller.iuc.commit();
    const c2 = await caller.iuc.commit();
    expect(c1.historyLength).toBe(1);
    expect(c2.historyLength).toBe(2);
  });

  it("validates and promotes via dedicated endpoints", async () => {
    const v = await caller.iuc.validate({ type: "UNDERSTANDING", verification: "PROBABLE", sources: 2, trust: 0.7, amanah: 0.6, transfer: 0.7 });
    expect(v.passed).toBe(true);
    const p = await caller.iuc.promote({ type: "JUDGMENT", rank: 3, trust: 0.9 });
    expect(p.gate).toBe("DG-09");
  });

  it("resets the store back to the seed graph", async () => {
    await caller.iuc.ingest({ type: "PATTERN", rank: 2 });
    const res = await caller.iuc.reset();
    const stats = await caller.iuc.stats();
    expect(res.reset).toBe(true);
    expect(stats.objectCount).toBe(res.objectCount);
  });
});

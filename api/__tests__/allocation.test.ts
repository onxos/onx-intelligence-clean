// ============================================================
// ALLOCATION ENGINE (D13.5) — UNIT TESTS (M6)
// Covers APS scoring, P1 continuity override, mode selection,
// and detection of each of the 7 failure patterns.
// ============================================================
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import {
  computeAPS,
  resolvePriority,
  selectMode,
  detectFailures,
  allocate,
  APS_DIMENSIONS,
  PRIORITIES,
  ALLOCATION_MODES,
  FAILURE_PATTERNS,
} from "../allocation-engine";

const caller = appRouter.createCaller({} as any);

describe("Allocation — APS scoring", () => {
  it("has 6 dimensions and scores 1.0 when all maxed", () => {
    expect(APS_DIMENSIONS).toHaveLength(6);
    expect(computeAPS({ FI: 1, CS: 1, FA: 1, CM: 1, RC: 1, WL: 1 })).toBe(1);
  });

  it("weights founder-intent and continuity most", () => {
    const fi = computeAPS({ FI: 1 });
    const wl = computeAPS({ WL: 1 });
    expect(fi).toBeGreaterThan(wl);
  });
});

describe("Allocation — P1-P7 priorities", () => {
  it("has 7 priorities with P1 = continuity", () => {
    expect(PRIORITIES).toHaveLength(7);
    expect(PRIORITIES[0].id).toBe("P1");
  });

  it("continuity (P1) overrides everything", () => {
    expect(resolvePriority(["P5", "P1", "P3"])).toBe("P1");
    expect(resolvePriority(["P6", "P4"])).toBe("P4");
    expect(resolvePriority([])).toBeNull();
  });
});

describe("Allocation — 5 modes", () => {
  it("has the 5 modes", () => {
    expect(ALLOCATION_MODES).toHaveLength(5);
  });

  it("continuity risk forces preservation", () => {
    expect(selectMode({ continuityRisk: true, newOpportunity: true })).toBe("PRESERVATION");
  });

  it("routes other signals to their modes", () => {
    expect(selectMode({ transformationReady: true })).toBe("EVOLUTION");
    expect(selectMode({ crossDomainNeed: true })).toBe("TRANSFER");
    expect(selectMode({ newOpportunity: true })).toBe("EXPANSION");
    expect(selectMode({ provenHighValue: true })).toBe("REINFORCEMENT");
    expect(selectMode({})).toBe("REINFORCEMENT");
  });
});

describe("Allocation — 7 failure patterns", () => {
  it("names all 7", () => {
    expect(FAILURE_PATTERNS).toHaveLength(7);
  });

  it("detects hoarding", () => {
    const f = detectFailures({ preservationRatio: 0.9, expansionRatio: 0.02 });
    expect(f.map((x) => x.pattern)).toContain("HOARDING");
  });

  it("detects fragmentation", () => {
    const f = detectFailures({ numAllocations: 15, maxDomainShare: 0.05 });
    expect(f.map((x) => x.pattern)).toContain("FRAGMENTATION");
  });

  it("detects concentration", () => {
    const f = detectFailures({ maxDomainShare: 0.8 });
    expect(f.map((x) => x.pattern)).toContain("CONCENTRATION");
  });

  it("detects fashion and drift", () => {
    const f = detectFailures({ churnRate: 0.7, driftFromIntent: 0.5 }).map((x) => x.pattern);
    expect(f).toContain("FASHION");
    expect(f).toContain("DRIFT");
  });

  it("detects false compounding", () => {
    const f = detectFailures({ claimedCompounding: true, momentum: 0.1 });
    expect(f.map((x) => x.pattern)).toContain("FALSE_COMPOUNDING");
  });

  it("detects paralysis", () => {
    const f = detectFailures({ actionRate: 0.05 });
    expect(f.map((x) => x.pattern)).toContain("PARALYSIS");
  });

  it("reports healthy when nothing triggers", () => {
    expect(detectFailures({ preservationRatio: 0.4, expansionRatio: 0.3, maxDomainShare: 0.3, actionRate: 0.8 })).toHaveLength(0);
  });
});

describe("Allocation router", () => {
  it("computes an integrated decision", async () => {
    const d = await caller.allocation.allocate({
      apsScores: { FI: 0.9, CS: 0.8 },
      priorities: ["P1", "P5"],
      signals: { continuityRisk: true },
      state: { preservationRatio: 0.5, actionRate: 0.7 },
    });
    expect(d.priority).toBe("P1");
    expect(d.mode).toBe("PRESERVATION");
    expect(d.aps).toBeGreaterThan(0);
    expect(d.healthy).toBe(true);
  });

  it("exposes reference constants", async () => {
    const r = await caller.allocation.reference();
    expect(r.economicLaws).toHaveLength(3);
    expect(r.objectives).toHaveLength(9);
    expect(r.transferPaths).toHaveLength(7);
  });
});

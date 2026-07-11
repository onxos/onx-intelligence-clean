// ============================================================
// OCMBR — UNIT TESTS (B0)
// Proves the charter's rule #1: maturity is COMPUTED from evidence,
// never declared. Covers the five-state ladder, criteria coverage,
// idempotent seeding, and the tRPC surface.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeMaturity,
  maturityRank,
  MATURITY_LABEL_AR,
  type AcceptanceCriterion,
  type EvidenceRecord,
} from "../lib/ocmbr-engine";
import {
  __resetOcmbrForTests,
  addCriterion,
  capabilityStatus,
  matrix,
  recordEvidence,
  registerCapability,
  seed,
  summary,
} from "../lib/ocmbr-store";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as never);

function crit(id: string): AcceptanceCriterion {
  return { id, capabilityCode: "X", statement: id };
}
function ev(kind: EvidenceRecord["kind"], over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return { id: `e-${Math.random()}`, capabilityCode: "X", kind, ...over };
}

beforeEach(() => {
  __resetOcmbrForTests();
});

describe("computeMaturity — five states from evidence only", () => {
  it("MISSING when there is no evidence at all", () => {
    const r = computeMaturity([crit("a")], []);
    expect(r.state).toBe("MISSING");
    expect(r.labelAr).toBe("مفقود");
  });

  it("DOCUMENTED when only DOC evidence exists", () => {
    const r = computeMaturity([], [ev("DOC")]);
    expect(r.state).toBe("DOCUMENTED");
    expect(r.labelAr).toBe("موثق");
  });

  it("DEMO when a run/demo exists but no code+test spine", () => {
    const r = computeMaturity([], [ev("RUN"), ev("DEMO")]);
    expect(r.state).toBe("DEMO");
  });

  it("PARTIAL when code+test exist but criteria are not fully covered", () => {
    const r = computeMaturity(
      [crit("a"), crit("b")],
      [ev("CODE"), ev("TEST", { criterionId: "a" }), ev("RUN")],
    );
    expect(r.state).toBe("PARTIAL");
    expect(r.signals.criteriaCovered).toBe(1);
    expect(r.signals.criteriaTotal).toBe(2);
  });

  it("VERIFIED only with code + test + run AND every criterion covered", () => {
    const r = computeMaturity(
      [crit("a"), crit("b")],
      [
        ev("CODE"),
        ev("TEST", { criterionId: "a" }),
        ev("TEST", { criterionId: "b" }),
        ev("RUN"),
      ],
    );
    expect(r.state).toBe("VERIFIED");
    expect(r.labelAr).toBe("منفذ ومثبت");
    expect(r.signals.coverage).toBe(1);
  });

  it("does NOT reach VERIFIED without a run, even when criteria are covered", () => {
    const r = computeMaturity(
      [crit("a")],
      [ev("CODE"), ev("TEST", { criterionId: "a" })],
    );
    expect(r.state).toBe("PARTIAL");
  });

  it("failing (passed:false) evidence does not count toward proof", () => {
    const r = computeMaturity(
      [crit("a")],
      [
        ev("CODE"),
        ev("TEST", { criterionId: "a", passed: false }),
        ev("RUN", { passed: false }),
      ],
    );
    // The only passing evidence is CODE → not DEMO/VERIFIED, stays PARTIAL.
    expect(r.state).toBe("PARTIAL");
    expect(r.signals.criteriaCovered).toBe(0);
  });

  it("state ranks are strictly ordered MISSING<...<VERIFIED", () => {
    expect(maturityRank("MISSING")).toBeLessThan(maturityRank("DOCUMENTED"));
    expect(maturityRank("DOCUMENTED")).toBeLessThan(maturityRank("DEMO"));
    expect(maturityRank("DEMO")).toBeLessThan(maturityRank("PARTIAL"));
    expect(maturityRank("PARTIAL")).toBeLessThan(maturityRank("VERIFIED"));
  });
});

describe("store — evidence drives the computed status", () => {
  it("a capability starts MISSING then climbs as real evidence lands", () => {
    registerCapability({ code: "X", title: "t", program: "test" });
    expect(capabilityStatus("X")!.state).toBe("MISSING");

    addCriterion({ capabilityCode: "X", statement: "works", id: "c1" });
    recordEvidence({ capabilityCode: "X", kind: "CODE" });
    expect(capabilityStatus("X")!.state).toBe("PARTIAL");

    recordEvidence({ capabilityCode: "X", kind: "TEST", criterionId: "c1" });
    recordEvidence({ capabilityCode: "X", kind: "RUN", output: "ok" });
    expect(capabilityStatus("X")!.state).toBe("VERIFIED");
  });

  it("summary counts every capability into exactly one state", () => {
    seed();
    const s = summary();
    const total = Object.values(s.byState).reduce((a, b) => a + b, 0);
    expect(total).toBe(s.totalCapabilities);
    expect(s.totalCapabilities).toBeGreaterThan(0);
  });
});

describe("seed — idempotent import of current project capabilities", () => {
  it("seeds once and never duplicates on re-run", () => {
    const first = seed();
    expect(first.seeded).toBe(true);
    const before = matrix().length;

    const second = seed();
    expect(second.seeded).toBe(false);
    expect(matrix().length).toBe(before);
  });

  it("merged subsystems are VERIFIED; B0/B1/B2/B3 graduate to VERIFIED once merge evidence is recorded", () => {
    seed();
    // Already merged in main → legitimately VERIFIED.
    expect(capabilityStatus("CAP-REFLECTION-CYCLE")!.state).toBe("VERIFIED");
    // B0/B1 carry a merge-gate criterion (ac-b0-merged / ac-b1-merged). It is
    // now covered by COMMIT evidence (real squash-merge sha 5028c3a), so the
    // engine computes them VERIFIED — proven, not self-declared.
    expect(capabilityStatus("B0-OCMBR")!.state).toBe("VERIFIED");
    expect(capabilityStatus("B1-CODEX-GUARD")!.state).toBe("VERIFIED");
    // B3 graduates the same way: ac-b3-merged covered by COMMIT evidence
    // (real squash-merge sha 52d4a5b, PR #34, CI green) → VERIFIED.
    expect(capabilityStatus("B3-CONSTITUTION-RUNTIME")!.state).toBe("VERIFIED");
    // B2 graduates the same way: ac-b2-merged covered by COMMIT evidence
    // (real squash-merge sha 4bd6de1, PR #35, CI green) → VERIFIED.
    expect(capabilityStatus("B2-ORCHESTRATOR")!.state).toBe("VERIFIED");
    // B2-β (Methods Library) graduates the same way: ac-b2ml-merged covered by
    // COMMIT evidence (real squash-merge sha 4b3ad3b, PR #38, CI green) → VERIFIED.
    expect(capabilityStatus("B2-METHODS-LIBRARY")!.state).toBe("VERIFIED");
    // B2-γ (Capability Factory) graduates the same way: ac-b2-gamma-merged
    // covered by COMMIT evidence (real squash-merge sha 7092aa6, PR #42, CI green) → VERIFIED.
    expect(capabilityStatus("B2-CAPABILITY-FACTORY")!.state).toBe("VERIFIED");
  });

  it("partially-built programs (B4..B8) are honestly PARTIAL, not VERIFIED", () => {
    seed();
    for (const code of ["B5-REALITY-ENGINE", "B8-BRIDGE-CONTRACTS"]) {
      expect(capabilityStatus(code)!.state).toBe("PARTIAL");
    }
  });
});

describe("tRPC surface", () => {
  it("ocmbr.matrix returns computed capabilities + labels + summary", async () => {
    const res = await caller.ocmbr.matrix();
    expect(res.labels).toEqual(MATURITY_LABEL_AR);
    expect(res.capabilities.length).toBeGreaterThan(0);
    expect(res.summary.totalCapabilities).toBe(res.capabilities.length);
    // sorted lowest maturity first
    const ranks = res.capabilities.map((c) => maturityRank(c.state));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("ocmbr.recordEvidence recomputes and returns the new state", async () => {
    await caller.ocmbr.registerCapability({ code: "Y", title: "y", program: "test" });
    await caller.ocmbr.addCriterion({ capabilityCode: "Y", statement: "s", id: "yc1" });
    const r1 = await caller.ocmbr.recordEvidence({ capabilityCode: "Y", kind: "CODE" });
    expect(r1.status!.state).toBe("PARTIAL");
    await caller.ocmbr.recordEvidence({ capabilityCode: "Y", kind: "TEST", criterionId: "yc1" });
    const r3 = await caller.ocmbr.recordEvidence({ capabilityCode: "Y", kind: "RUN" });
    expect(r3.status!.state).toBe("VERIFIED");
  });

  it("ocmbr.capability returns found:false for unknown codes", async () => {
    const res = await caller.ocmbr.capability({ code: "NOPE-404" });
    expect(res.found).toBe(false);
  });
});

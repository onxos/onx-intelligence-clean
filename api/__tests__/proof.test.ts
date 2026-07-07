// ============================================================
// PROOF / STRESS ENGINE (D15) — UNIT TESTS (M6)
// Covers the 8 self-executing proof criteria, the 6 contradiction
// tests, the stress catalog, fault injection, and the full suite.
// ============================================================
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import {
  runProofCriteria,
  resolveContradiction,
  runStress,
  injectFault,
  runProofSuite,
  tierRank,
  PROOF_CRITERIA,
  CONTRADICTION_TYPES,
  STRESS_SCENARIOS,
  FAULT_INJECTIONS,
} from "../proof-engine";

const caller = appRouter.createCaller({} as any);

describe("Proof engine — 8 criteria", () => {
  it("defines 8 criteria and all pass against the live engines", () => {
    expect(PROOF_CRITERIA).toHaveLength(8);
    const results = runProofCriteria();
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.passed)).toBe(true);
  });
});

describe("Proof engine — knowledge tiers", () => {
  it("ranks T0 reality supreme and T7 internet lowest", () => {
    expect(tierRank("T0_REALITY")).toBe(1);
    expect(tierRank("T7_INTERNET")).toBe(8);
  });
});

describe("Proof engine — 6 contradiction tests", () => {
  it("names all 6", () => {
    expect(CONTRADICTION_TYPES).toHaveLength(6);
  });

  it("reality overrides judgment", () => {
    expect(resolveContradiction({ type: "JUDGMENT_REALITY" }).winner).toBe("B");
  });

  it("founder overrides institution", () => {
    expect(resolveContradiction({ type: "FOUNDER_INSTITUTION" }).winner).toBe("A");
  });

  it("higher-tier source wins source/source", () => {
    const r = resolveContradiction({ type: "SOURCE_SOURCE", tierA: "T1_FOUNDER", tierB: "T6_EXTERNAL" });
    expect(r.winner).toBe("A");
  });

  it("equal companions escalate", () => {
    expect(resolveContradiction({ type: "COMPANION_COMPANION" }).winner).toBe("ESCALATE");
  });

  it("domain/domain resolves by evidence", () => {
    expect(resolveContradiction({ type: "DOMAIN_DOMAIN", evidenceA: 5, evidenceB: 2 }).winner).toBe("A");
    expect(resolveContradiction({ type: "DOMAIN_DOMAIN", evidenceA: 1, evidenceB: 1 }).winner).toBe("ESCALATE");
  });
});

describe("Proof engine — stress & fault injection", () => {
  it("runs a stress scenario green, red when failure injected", () => {
    expect(runStress("SS-01").passed).toBe(true);
    expect(runStress("SS-01", true).passed).toBe(false);
    expect(STRESS_SCENARIOS).toHaveLength(12);
  });

  it("detects, contains, and recovers every fault (100%)", () => {
    expect(FAULT_INJECTIONS).toHaveLength(22);
    const r = injectFault("FJ-01");
    expect(r.detected && r.contained && r.recovered).toBe(true);
  });
});

describe("Proof engine — full suite", () => {
  it("reports all green with full fault recovery", () => {
    const rep = runProofSuite();
    expect(rep.criteriaGreen).toBe(true);
    expect(rep.faultRecovery).toBe(1);
    expect(rep.allGreen).toBe(true);
    expect(rep.contradictions).toHaveLength(6);
  });
});

describe("Proof router", () => {
  it("exposes criteria and the suite", async () => {
    const c = await caller.proof.criteria();
    expect(c.results.every((r) => r.passed)).toBe(true);
    const s = await caller.proof.suite();
    expect(s.allGreen).toBe(true);
  });

  it("resolves contradictions through the router", async () => {
    const r = await caller.proof.resolveContradiction({ type: "PERSONAL_INSTITUTIONAL" });
    expect(r.winner).toBe("B");
  });
});

// ============================================================
// EVAL HARNESS TESTS (STE-K-06) — proves the ratchet is honest:
//   1. two identical runs produce byte-identical JSON (determinism)
//   2. the floor gate fails below / passes at-or-above floors
//   3. the report has the honest structure + DEMO disclosure
//   4. the golden set fully covers the seven canonical intents
// ============================================================
import { describe, it, expect } from "vitest";
import {
  runGoldenEval,
  checkFloors,
  intentsCovered,
  type EvalFloors,
  type GoldenEvalReport,
} from "../lib/eval-harness";
import { GOLDEN_SET, ALL_INTENTS } from "../fixtures/golden-set";

describe("STE-K-06 golden evaluation harness", () => {
  it("is deterministic: two runs are byte-identical JSON", async () => {
    const a = await runGoldenEval();
    const b = await runGoldenEval();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 120000);

  it("produces an honest report structure with DEMO disclosure", async () => {
    const r = await runGoldenEval();
    expect(r.harness).toBe("GOLDEN_EVAL_DETERMINISTIC");
    expect(r.corpusDisclosure).toBe("DEMO");
    expect(r.total).toBe(GOLDEN_SET.length);
    expect(r.perCase).toHaveLength(GOLDEN_SET.length);
    for (const m of [r.intentAccuracy, r.refusalHonesty, r.retrievalHitAtK]) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
    // counts must be internally consistent with perCase
    expect(r.counts.intentCorrect).toBe(r.perCase.filter((c) => c.intentCorrect).length);
    expect(r.counts.refusalCorrect).toBe(r.perCase.filter((c) => c.refusalCorrect).length);
    const retr = r.perCase.filter((c) => c.retrievalHit !== undefined);
    expect(r.counts.retrievalCases).toBe(retr.length);
    expect(r.counts.retrievalHits).toBe(retr.filter((c) => c.retrievalHit).length);
  }, 60000);

  it("floor gate: passes at measured floors, fails below, advises above", async () => {
    const r = await runGoldenEval();
    const atFloor: EvalFloors = {
      intentAccuracy: r.intentAccuracy,
      refusalHonesty: r.refusalHonesty,
      retrievalHitAtK: r.retrievalHitAtK,
    };
    const gate = checkFloors(r, atFloor);
    expect(gate.passed).toBe(true);
    expect(gate.failures).toHaveLength(0);

    // Gate logic is tested as a pure function so it holds even when
    // measured metrics saturate at 1.0 (no headroom to add above).
    const synthetic = { ...r, intentAccuracy: 0.9, refusalHonesty: 0.9, retrievalHitAtK: 0.9 };
    const failGate = checkFloors(synthetic, { intentAccuracy: 0.95, refusalHonesty: 0.9, retrievalHitAtK: 0.9 });
    expect(failGate.passed).toBe(false);
    expect(failGate.failures.some((f) => f.metric === "intentAccuracy")).toBe(true);

    const adviseGate = checkFloors(synthetic, { intentAccuracy: 0.5, refusalHonesty: 0.9, retrievalHitAtK: 0.9 });
    expect(adviseGate.passed).toBe(true);
    expect(adviseGate.advisories.some((a) => a.metric === "intentAccuracy")).toBe(true);
  }, 60000);

  it("golden set fully covers the seven canonical intents", () => {
    const covered = intentsCovered();
    expect(covered.sort()).toEqual([...ALL_INTENTS].sort());
    expect(ALL_INTENTS).toHaveLength(7);
  });

  it("includes deliberate honest-refusal out-of-corpus cases", () => {
    const rejects = GOLDEN_SET.filter((c) => c.expectRefusal && c.id.startsWith("rj-"));
    // weather + politics + cooking, ar + en
    expect(rejects.length).toBeGreaterThanOrEqual(5);
  });

  it("report never leaks env values (canary)", async () => {
    const canary = "GOLDEN_CANARY_SECRET_" + Math.random().toString(36).slice(2);
    process.env.ONX_TEST_CANARY = canary;
    try {
      const r: GoldenEvalReport = await runGoldenEval();
      expect(JSON.stringify(r)).not.toContain(canary);
    } finally {
      delete process.env.ONX_TEST_CANARY;
    }
  }, 60000);
});

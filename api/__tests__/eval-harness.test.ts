// ============================================================
// EVAL HARNESS TESTS (STE-K-06) — proves the ratchet is honest:
//   1. two identical runs produce byte-identical JSON (determinism)
//   2. the floor gate fails below / passes at-or-above floors
//   3. the report has the honest structure + DEMO disclosure
//   4. the golden set fully covers the seven canonical intents
// ============================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  runGoldenEval,
  checkFloors,
  intentsCovered,
  type EvalFloors,
  type GoldenEvalReport,
} from "../lib/eval-harness";
import { GOLDEN_SET, ALL_INTENTS } from "../fixtures/golden-set";

// runGoldenEval scores composeAnswer over the whole golden set and is
// genuinely heavy (~tens of seconds). Under the full parallel suite it
// starves for CPU, so we compute ONE shared report for the read-only
// assertions (structure / floor gate / canary) and let only the
// determinism test pay for a second, independent run. The canary env is
// set BEFORE the shared run so the leak check covers a report generated
// while the secret was present. Generous timeouts absorb CPU contention.
const HEAVY_TIMEOUT = 240000;

describe("STE-K-06 golden evaluation harness", () => {
  let shared: GoldenEvalReport;
  const canary = "GOLDEN_CANARY_SECRET_" + Math.random().toString(36).slice(2);

  beforeAll(async () => {
    process.env.ONX_TEST_CANARY = canary;
    shared = await runGoldenEval();
  }, HEAVY_TIMEOUT);

  afterAll(() => {
    delete process.env.ONX_TEST_CANARY;
  });

  it("is deterministic: two runs are byte-identical JSON", async () => {
    const b = await runGoldenEval();
    expect(JSON.stringify(shared)).toBe(JSON.stringify(b));
  }, HEAVY_TIMEOUT);

  it("produces an honest report structure with DEMO disclosure", () => {
    const r = shared;
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
  });

  it("floor gate: passes at measured floors, fails below, advises above", () => {
    const r = shared;
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
  });

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

  it("report never leaks env values (canary)", () => {
    // shared was generated in beforeAll while ONX_TEST_CANARY was set.
    expect(JSON.stringify(shared)).not.toContain(canary);
  });
});

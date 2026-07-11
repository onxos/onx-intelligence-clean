import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";
import {
  runGoldenSet,
  computeCalibration,
  regressionGate,
  recordEvaluationEvidence,
  registerRunner,
  EvaluationError,
  B6_CAPABILITY_CODE,
  B6_CRITERION,
  type GoldenSet,
  type CaseResult,
  type EvalBaseline,
} from "../lib/evaluation-learning";
import { GOLDEN_SETS, BASELINES } from "../lib/golden-sets";
import { listEvidence, __resetOcmbrForTests } from "../lib/ocmbr-store";

const caller = appRouter.createCaller({} as never);

// A tiny deterministic stub capability: echoes the input's `say` label
// with a fixed confidence, for pure metric/gate tests.
const stubSet: GoldenSet = {
  capability: "stub.echo",
  subjectCode: "STUB",
  positiveLabel: "FAIL",
  cases: [
    { id: "c1", input: { say: "PASS", conf: 0.9 }, expected: "PASS" },
    { id: "c2", input: { say: "FAIL", conf: 0.8 }, expected: "FAIL" },
    { id: "c3", input: { say: "PASS", conf: 0.2 }, expected: "FAIL" }, // miss
    { id: "c4", input: { say: "FAIL", conf: 0.7 }, expected: "FAIL" },
  ],
};

function stubRunner(input: unknown) {
  const i = input as { say: string; conf: number };
  return { label: i.say, confidence: i.conf };
}

describe("B6 golden-set runner — metrics", () => {
  beforeEach(() => registerRunner("stub.echo", stubRunner));

  it("computes accuracy, precision, recall, f1 against ground truth", () => {
    const m = runGoldenSet(stubSet);
    expect(m.total).toBe(4);
    expect(m.correct).toBe(3); // c3 is a miss
    expect(m.accuracy).toBeCloseTo(0.75, 4);
    // positive = FAIL. TP=c2,c4 ; FP=0 ; FN=c3 → P=1, R=2/3
    expect(m.precision).toBeCloseTo(1, 4);
    expect(m.recall).toBeCloseTo(0.6667, 3);
    expect(m.f1).toBeCloseTo(0.8, 3);
    expect(m.passingCaseIds).toEqual(["c1", "c2", "c4"]);
  });

  it("produces a calibration curve when confidences are present", () => {
    const m = runGoldenSet(stubSet);
    expect(m.calibration).not.toBeNull();
    expect(m.calibration?.sampleCount).toBe(4);
    expect(m.calibration?.ece).toBeGreaterThanOrEqual(0);
  });

  it("returns null calibration when no case carries a confidence", () => {
    const results: CaseResult[] = [
      { id: "a", expected: "X", predicted: "X", confidence: null, correct: true },
    ];
    expect(computeCalibration(results)).toBeNull();
  });

  it("is fail-closed when no runner is registered for the capability", () => {
    expect(() => runGoldenSet({ ...stubSet, capability: "missing.runner" })).toThrow(EvaluationError);
  });
});

describe("B6 regression gate — fail-closed", () => {
  beforeEach(() => registerRunner("stub.echo", stubRunner));

  function baselineFrom(): EvalBaseline {
    const m = runGoldenSet(stubSet);
    return {
      capability: m.capability,
      accuracy: m.accuracy,
      f1: m.f1,
      ece: m.calibration?.ece ?? null,
      passingCaseIds: m.passingCaseIds,
      recordedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("passes when the current run matches its baseline", () => {
    const gate = regressionGate(runGoldenSet(stubSet), baselineFrom());
    expect(gate.passed).toBe(true);
    expect(gate.failures).toEqual([]);
    expect(gate.progress).toBe("STABILIZING");
  });

  it("FAILS and names the broken case when a baseline-passing case regresses", () => {
    const baseline = baselineFrom();
    // A runner that now gets c4 wrong (predicts PASS where truth is FAIL).
    registerRunner("stub.echo", (input) => {
      const i = input as { say: string; conf: number; };
      const label = i.conf === 0.7 ? "PASS" : i.say;
      return { label, confidence: i.conf };
    });
    const gate = regressionGate(runGoldenSet(stubSet), baseline);
    expect(gate.passed).toBe(false);
    expect(gate.brokenCaseIds).toContain("c4");
    expect(gate.failures.join(" ")).toMatch(/c4/);
    expect(gate.progress).toBe("DECLINING");
  });

  it("FAILS when accuracy drops below baseline minus tolerance (no silent threshold)", () => {
    const baseline = baselineFrom();
    const worse = { ...runGoldenSet(stubSet), accuracy: baseline.accuracy - 0.2 };
    const gate = regressionGate(worse, baseline, 0.05);
    expect(gate.passed).toBe(false);
    expect(gate.failures.join(" ")).toMatch(/accuracy/i);
  });
});

describe("B6 OCMBR integration — run recorded as RUN evidence", () => {
  beforeEach(() => {
    __resetOcmbrForTests();
    registerRunner("stub.echo", stubRunner);
  });

  it("records a runtime (RUN) evidence for the evaluation run", () => {
    const m = runGoldenSet(stubSet);
    const gate = regressionGate(m, {
      capability: m.capability,
      accuracy: m.accuracy,
      f1: m.f1,
      ece: m.calibration?.ece ?? null,
      passingCaseIds: m.passingCaseIds,
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
    const ev = recordEvaluationEvidence(m, gate);
    expect(ev.kind).toBe("RUN");
    expect(ev.capabilityCode).toBe(B6_CAPABILITY_CODE);
    expect(ev.criterionId).toBe(B6_CRITERION);
    expect(ev.passed).toBe(gate.passed);
    const recorded = listEvidence(B6_CAPABILITY_CODE);
    expect(recorded.some((e) => e.id === ev.id && e.kind === "RUN")).toBe(true);
  });
});

describe("B6 golden sets over MERGED capabilities (reuse, not rebuild)", () => {
  it("covers the four merged capabilities", () => {
    const subjects = GOLDEN_SETS.map((s) => s.subjectCode).sort();
    expect(subjects).toEqual(
      ["B1-CODEX-GUARD", "B2-METHODS-LIBRARY", "B4-INTELLIGENCE-OBJECTS", "B8-BRIDGE-CONTRACTS"].sort(),
    );
  });

  it("every golden set passes its frozen baseline at HEAD (no regression)", () => {
    for (const set of GOLDEN_SETS) {
      const baseline = BASELINES[set.capability];
      expect(baseline, `missing baseline for ${set.capability}`).toBeDefined();
      const gate = regressionGate(runGoldenSet(set), baseline);
      expect(gate.passed, `${set.capability} failures: ${gate.failures.join("; ")}`).toBe(true);
    }
  });

  it("the intelligence-object judge set carries a real confidence → calibration", () => {
    const judge = GOLDEN_SETS.find((s) => s.subjectCode === "B4-INTELLIGENCE-OBJECTS")!;
    const m = runGoldenSet(judge);
    expect(m.calibration).not.toBeNull();
    expect(m.calibration!.ece).toBeGreaterThanOrEqual(0);
    expect(m.calibration!.ece).toBeLessThanOrEqual(1);
  });

  it("genuinely reuses each merged capability's real output", () => {
    // codex-guard: a forbidden label is detected as a DEVIATION.
    const guard = GOLDEN_SETS.find((s) => s.subjectCode === "B1-CODEX-GUARD")!;
    const gm = runGoldenSet(guard);
    expect(gm.results.some((r) => r.predicted === "DEVIATION")).toBe(true);
    // bridge-contracts: a malformed event is INVALID.
    const bridge = GOLDEN_SETS.find((s) => s.subjectCode === "B8-BRIDGE-CONTRACTS")!;
    const bm = runGoldenSet(bridge);
    expect(bm.results.some((r) => r.predicted === "INVALID")).toBe(true);
    // methods-library: a self-merge output is a VIOLATION.
    const methods = GOLDEN_SETS.find((s) => s.subjectCode === "B2-METHODS-LIBRARY")!;
    const mm = runGoldenSet(methods);
    expect(mm.results.some((r) => r.predicted === "VIOLATION")).toBe(true);
    // judge: a lopsided-supporting case is SUPPORTED.
    const judge = GOLDEN_SETS.find((s) => s.subjectCode === "B4-INTELLIGENCE-OBJECTS")!;
    const jm = runGoldenSet(judge);
    expect(jm.results.some((r) => r.predicted === "SUPPORTED")).toBe(true);
  });
});

describe("B6 tRPC surface", () => {
  it("lists the evaluable capabilities", async () => {
    const list = await caller.evaluationLearning.capabilities();
    expect(list.length).toBe(GOLDEN_SETS.length);
  });

  it("runs a gate through the router and reports pass", async () => {
    const guard = GOLDEN_SETS.find((s) => s.subjectCode === "B1-CODEX-GUARD")!;
    const res = await caller.evaluationLearning.gate({ capability: guard.capability });
    expect(res.passed).toBe(true);
    expect(res.metrics!.total).toBeGreaterThan(0);
  });
});

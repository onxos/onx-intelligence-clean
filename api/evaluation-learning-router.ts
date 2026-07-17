// ============================================================
// EVALUATION & LEARNING ROUTER — B6 over tRPC
//
// Surfaces deterministic golden-set evaluation + fail-closed
// regression gating over the four MERGED capabilities:
//   • capabilities — list the evaluable golden sets (subject provenance)
//   • run          — run one golden set → honest metrics + calibration
//   • gate         — run + compare vs frozen baseline (fail-closed)
//   • gateAll      — gate every golden set; overall pass only if all pass
//
// Reuses the merged capabilities' REAL outputs via golden-sets runners;
// nothing here re-implements a capability. Deterministic, keyless.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  runGoldenSet,
  regressionGate,
  recordEvaluationEvidence,
} from "./lib/evaluation-learning";
import { GOLDEN_SETS, BASELINES } from "./lib/golden-sets";

function findSet(capability: string) {
  return GOLDEN_SETS.find((s) => s.capability === capability);
}

export const evaluationLearningRouter = createRouter({
  // All evaluable capabilities with the merged subject they exercise.
  capabilities: publicQuery.query(() =>
    GOLDEN_SETS.map((s) => ({
      capability: s.capability,
      subjectCode: s.subjectCode,
      positiveLabel: s.positiveLabel,
      cases: s.cases.length,
      hasBaseline: BASELINES[s.capability] !== undefined,
    })),
  ),

  // Run one golden set and return honest metrics + calibration.
  run: publicQuery
    .input(z.object({ capability: z.string().min(1) }))
    .query(({ input }) => {
      const set = findSet(input.capability);
      if (!set) return { found: false as const };
      return { found: true as const, metrics: runGoldenSet(set) };
    }),

  // Run + fail-closed regression gate against the frozen baseline.
  // Records the run as RUN (runtime) evidence in OCMBR.
  gate: publicQuery
    .input(z.object({ capability: z.string().min(1) }))
    .query(({ input }) => {
      const set = findSet(input.capability);
      if (!set) {
        return {
          passed: false,
          found: false as const,
          failures: [`لا مجموعة ذهبية للقدرة «${input.capability}».`],
        };
      }
      const metrics = runGoldenSet(set);
      const gate = regressionGate(metrics, BASELINES[set.capability]);
      const evidence = recordEvaluationEvidence(metrics, gate);
      return {
        found: true as const,
        passed: gate.passed,
        failures: gate.failures,
        brokenCaseIds: gate.brokenCaseIds,
        progress: gate.progress,
        metrics,
        evidenceId: evidence.id,
      };
    }),

  // Gate every golden set; overall pass only when all pass (fail-closed).
  gateAll: publicQuery.query(() => {
    const results = GOLDEN_SETS.map((set) => {
      const metrics = runGoldenSet(set);
      const gate = regressionGate(metrics, BASELINES[set.capability]);
      recordEvaluationEvidence(metrics, gate);
      return {
        capability: set.capability,
        subjectCode: set.subjectCode,
        passed: gate.passed,
        failures: gate.failures,
      };
    });
    return { passed: results.every((r) => r.passed), results };
  }),
});

// ============================================================
// PROOF / STRESS ROUTER — D15 (M6) — MED v2.0 §3 + §12
// Exposes the proof suite: 8 criteria, 6 contradiction tests,
// stress catalog, and fault injection. Pure / CI-safe.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  KNOWLEDGE_TIERS,
  CONTRADICTION_TYPES,
  STRESS_SCENARIOS,
  FAULT_INJECTIONS,
  tierRank,
  runProofCriteria,
  resolveContradiction,
  runStress,
  injectFault,
  runProofSuite,
  type KnowledgeTier,
  type ContradictionType,
  type StressScenarioId,
  type FaultInjectionId,
} from "./proof-engine";

const zTier = z.enum(KNOWLEDGE_TIERS as unknown as [KnowledgeTier, ...KnowledgeTier[]]);
const zContradiction = z.enum(CONTRADICTION_TYPES as unknown as [ContradictionType, ...ContradictionType[]]);
const STRESS_IDS = STRESS_SCENARIOS.map((s) => s.id) as unknown as [StressScenarioId, ...StressScenarioId[]];
const FAULT_IDS = FAULT_INJECTIONS as unknown as [FaultInjectionId, ...FaultInjectionId[]];

export const proofRouter = createRouter({
  criteria: publicQuery.query(() => ({ results: runProofCriteria() })),

  tiers: publicQuery.query(() => ({
    tiers: KNOWLEDGE_TIERS.map((t) => ({ tier: t, rank: tierRank(t) })),
  })),

  contradictionTypes: publicQuery.query(() => ({ types: CONTRADICTION_TYPES })),

  resolveContradiction: publicQuery
    .input(z.object({
      type: zContradiction,
      tierA: zTier.optional(),
      tierB: zTier.optional(),
      evidenceA: z.number().optional(),
      evidenceB: z.number().optional(),
    }))
    .query(({ input }) => resolveContradiction(input)),

  stressScenarios: publicQuery.query(() => ({ scenarios: STRESS_SCENARIOS })),

  runStress: publicQuery
    .input(z.object({ id: z.enum(STRESS_IDS), injectFailure: z.boolean().optional() }))
    .query(({ input }) => runStress(input.id, input.injectFailure ?? false)),

  faults: publicQuery.query(() => ({ faults: FAULT_INJECTIONS })),

  injectFault: publicQuery
    .input(z.object({ id: z.enum(FAULT_IDS) }))
    .query(({ input }) => injectFault(input.id)),

  suite: publicQuery.query(() => runProofSuite()),
});

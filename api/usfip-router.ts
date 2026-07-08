// ============================================================
// USFIP ROUTER — M5 (MED v2.0 §7 Sovereignty)
// tRPC surface over an in-memory sovereignty state: the Self-First
// ladder, ISES source scoring, Provider Capital evolution, the
// 5-question Sovereignty Loop, and the live ISMF sovereignty report
// (`sovereigntyReport`). Pure / CI-safe.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  SELF_FIRST_LADDER,
  LAYER_COST,
  FRONTIER_CONFIDENCE_MIN,
  FRONTIER_CONFIDENCE_MAX,
  INTERNAL_TARGET,
  ISES_DIMENSIONS,
  SOVEREIGNTY_QUESTIONS,
  ISMF_THRESHOLDS,
  scoreSource,
  evolveCapital,
  runSovereigntyLoop,
  sovereigntyReport,
  createSovereignty,
  type SovereigntyState,
} from "./usfip-engine";

const score01 = z.number().min(0).max(1);
const zIsesDims = z.object({
  domainFitness: score01.optional(),
  risk: score01.optional(),
  historicalPerformance: score01.optional(),
  evidenceQuality: score01.optional(),
  judgmentQuality: score01.optional(),
  hallucinationResistance: score01.optional(),
  governanceCompliance: score01.optional(),
  costEfficiency: score01.optional(),
  responseTime: score01.optional(),
  reliability: score01.optional(),
  outcomeSuccess: score01.optional(),
  ownershipAlignment: score01.optional(),
});

const zQueryContext = z.object({
  id: z.string(),
  knowsInternally: z.boolean(),
  ownsData: z.boolean(),
  hasReusableJudgment: z.boolean(),
  hasWisdom: z.boolean(),
  externalNecessary: z.boolean(),
});

let state: SovereigntyState = createSovereignty();

export const usfipRouter = createRouter({
  ladder: publicQuery.query(() => ({
    ladder: SELF_FIRST_LADDER,
    cost: LAYER_COST,
    questions: SOVEREIGNTY_QUESTIONS,
    isesDimensions: ISES_DIMENSIONS,
    frontierConfidence: { min: FRONTIER_CONFIDENCE_MIN, max: FRONTIER_CONFIDENCE_MAX },
    ismfThresholds: ISMF_THRESHOLDS,
    internalTarget: INTERNAL_TARGET,
  })),

  scoreSource: publicQuery.input(zIsesDims).query(({ input }) => scoreSource(input)),

  providers: publicQuery.query(() => ({
    providers: state.providers,
    baselineCapital: state.baselineCapital,
  })),

  evolve: publicQuery
    .input(z.object({ providerId: z.string(), outcome: z.number().min(0).max(1) }))
    .mutation(({ input }) => {
      const idx = state.providers.findIndex((p) => p.id === input.providerId);
      if (idx === -1) throw new Error(`مزود غير معروف: ${input.providerId}`);
      state.providers[idx] = evolveCapital(state.providers[idx], input.outcome);
      return state.providers[idx];
    }),

  loop: publicQuery.input(zQueryContext).mutation(({ input }) => {
    const decision = runSovereigntyLoop(input);
    state.ledger.push(decision);
    return decision;
  }),

  ledger: publicQuery.query(() => ({ total: state.ledger.length, decisions: state.ledger })),

  report: publicQuery.query(() => sovereigntyReport(state)),

  reset: publicQuery.mutation(() => {
    state = createSovereignty();
    return sovereigntyReport(state);
  }),
});

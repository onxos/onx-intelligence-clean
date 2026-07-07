// ============================================================
// PURPOSE COMPILER ROUTER (M4) — MED v2.0 §2.5-2.6
// Exposes the 9-stage purpose chain, the 7-question gate, and the
// Founder Cognitive Model. Pure / deterministic → CI-safe.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  PURPOSE_CHAIN,
  PURPOSE_GATE_QUESTIONS,
  FCM_DIMENSIONS,
  FOUNDER_DECISION_PATTERNS,
  FOUNDER_OVERRIDE_BEHAVIORS,
  compilePurpose,
  evaluatePurposeGate,
  scoreAlignment,
  escalationTime,
  type PurposeStageId,
  type FounderDecisionPatternId,
} from "./purpose-compiler";

const STAGE_IDS = PURPOSE_CHAIN.map((s) => s.id) as unknown as [PurposeStageId, ...PurposeStageId[]];
const FDP_IDS = FOUNDER_DECISION_PATTERNS.map((p) => p.id) as unknown as [FounderDecisionPatternId, ...FounderDecisionPatternId[]];

export const purposeRouter = createRouter({
  chain: publicQuery.query(() => ({ stages: PURPOSE_CHAIN })),

  compile: publicQuery
    .input(z.object({ satisfied: z.array(z.enum(STAGE_IDS)) }))
    .query(({ input }) => {
      const stages: Partial<Record<PurposeStageId, boolean>> = {};
      for (const id of input.satisfied) stages[id] = true;
      return compilePurpose(stages);
    }),

  gateQuestions: publicQuery.query(() => ({ questions: PURPOSE_GATE_QUESTIONS })),

  gate: publicQuery
    .input(z.object({ answers: z.array(z.boolean()) }))
    .query(({ input }) => evaluatePurposeGate(input.answers)),

  founderModel: publicQuery.query(() => ({
    dimensions: FCM_DIMENSIONS,
    patterns: FOUNDER_DECISION_PATTERNS,
    overrides: FOUNDER_OVERRIDE_BEHAVIORS,
  })),

  alignment: publicQuery
    .input(z.object({ patterns: z.array(z.enum(FDP_IDS)) }))
    .query(({ input }) => scoreAlignment(input.patterns)),

  escalation: publicQuery
    .input(z.object({ category: z.string() }))
    .query(({ input }) => ({ category: input.category, time: escalationTime(input.category) })),
});

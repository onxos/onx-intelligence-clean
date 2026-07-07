// ============================================================
// OS OBJECTS ROUTER (M6) — MED v2.0 §5
// Exposes the OS object cores: lifecycle, GoalEngine, Flourishing,
// CompanionRuntime, InstitutionalDecisionEngine, ContinuityEngine,
// Personal/Institutional OS. Pure / CI-safe.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  CONSTITUTIONAL_LIFECYCLE,
  COMPANIONS,
  DECISION_QUESTIONS,
  DECISION_STATES,
  CONTINUITY_CATEGORIES,
  PERSONAL_OS,
  INSTITUTIONAL_OS,
  computeGoalProgress,
  computeFlourishing,
  companionCanAccess,
  resolveCompanion,
  advanceDecision,
  decisionQuality,
  continuityForecast,
  exportContext,
  type CompanionId,
  type DecisionState,
} from "./os-objects";

const COMPANION_IDS = COMPANIONS.map((c) => c.id) as unknown as [CompanionId, ...CompanionId[]];
const zDecisionState = z.enum(DECISION_STATES as unknown as [DecisionState, ...DecisionState[]]);
const zDecisionAction = z.enum(["submit", "approve", "reject", "execute"]);
const score = z.number().optional();

const zVw = z.object({
  HAPPINESS: score, HEALTH: score, MEANING: score, CHARACTER: score, RELATIONSHIPS: score, STABILITY: score,
});
const zPerma = z.object({
  POSITIVE_EMOTION: score, ENGAGEMENT: score, RELATIONSHIPS: score, MEANING: score, ACCOMPLISHMENT: score,
});
const zContinuity = z.object({
  KNOWLEDGE: score, PRACTICE: score, RELATIONSHIP: score, PRINCIPLE: score, CAPABILITY: score, CULTURE: score, HISTORY: score,
});
const zPillars = z.object({
  AGENCY: score, PRIVACY: score, AMANAH: score, CONTEXT_OWNERSHIP: score, FLOURISHING: score,
});

export const osRouter = createRouter({
  lifecycle: publicQuery.query(() => ({ stages: CONSTITUTIONAL_LIFECYCLE })),

  goalProgress: publicQuery
    .input(z.object({ done: z.number(), total: z.number(), blocked: z.boolean().optional() }))
    .query(({ input }) => computeGoalProgress(input.done, input.total, input.blocked ?? false)),

  flourishing: publicQuery
    .input(z.object({ vanderweele: zVw.optional(), perma: zPerma.optional() }))
    .query(({ input }) => computeFlourishing(input.vanderweele ?? {}, input.perma ?? {})),

  companions: publicQuery.query(() => ({ companions: COMPANIONS })),
  companionAccess: publicQuery
    .input(z.object({ id: z.enum(COMPANION_IDS), context: z.string() }))
    .query(({ input }) => ({ allowed: companionCanAccess(input.id, input.context) })),
  resolveCompanion: publicQuery
    .input(z.object({ context: z.string() }))
    .query(({ input }) => ({ companion: resolveCompanion(input.context) })),

  decisionQuestions: publicQuery.query(() => ({ questions: DECISION_QUESTIONS })),
  advanceDecision: publicQuery
    .input(z.object({ state: zDecisionState, action: zDecisionAction }))
    .query(({ input }) => ({ next: advanceDecision(input.state, input.action) })),
  decisionQuality: publicQuery
    .input(z.object({ scores: z.array(z.number()) }))
    .query(({ input }) => ({ quality: decisionQuality(input.scores) })),

  continuityCategories: publicQuery.query(() => ({ categories: CONTINUITY_CATEGORIES })),
  continuityForecast: publicQuery
    .input(z.object({ scores: zContinuity, monthlyDecay: z.number().optional() }))
    .query(({ input }) => continuityForecast(input.scores, input.monthlyDecay ?? 0.1)),

  personalOS: publicQuery.query(() => PERSONAL_OS),
  institutionalOS: publicQuery.query(() => INSTITUTIONAL_OS),
  exportContext: publicQuery.input(zPillars).query(({ input }) => exportContext(input)),
});

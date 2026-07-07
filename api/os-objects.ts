// ============================================================
// OS OBJECTS LAYER (M6) — MED v2.0 §5 (the 25 Runtime objects)
// Pure, deterministic cores for the key OS objects: the 11-stage
// constitutional lifecycle, GoalEngine, FlourishingEngine
// (VanderWeele-6 + PERMA-5), CompanionRuntime (7), the
// InstitutionalDecisionEngine (7 questions, harmonic-mean quality),
// the ContinuityEngine (7 categories + 30/90 forecast), and the
// Personal/Institutional OS constitutions. CI-testable.
// ============================================================

// --- 5.1 Constitutional lifecycle — 11 stages ---
export const CONSTITUTIONAL_LIFECYCLE = [
  "DREAM", "POTENTIAL", "GOAL", "UNDERSTANDING", "JUDGMENT", "EXECUTION",
  "OUTCOME", "FLOURISHING", "CONTINUITY", "EVOLUTION", "DREAM_RENEWAL",
] as const;
export type LifecycleStage = (typeof CONSTITUTIONAL_LIFECYCLE)[number];

// --- GoalEngine ---
export const GOAL_STATES = ["DRAFT", "ACTIVE", "BLOCKED", "ACHIEVED", "ABANDONED"] as const;
export type GoalState = (typeof GOAL_STATES)[number];

export interface GoalProgress {
  progress: number; // [0,1]
  state: GoalState;
  atRisk: boolean;
}
export function computeGoalProgress(milestonesDone: number, milestonesTotal: number, blocked = false): GoalProgress {
  const total = Math.max(0, milestonesTotal);
  const done = Math.max(0, Math.min(milestonesDone, total || milestonesDone));
  const progress = total === 0 ? 0 : Number((done / total).toFixed(4));
  let state: GoalState;
  if (blocked) state = "BLOCKED";
  else if (progress >= 1) state = "ACHIEVED";
  else if (progress > 0) state = "ACTIVE";
  else state = "DRAFT";
  return { progress, state, atRisk: blocked || (progress < 0.34 && state === "ACTIVE") };
}

// --- FlourishingEngine — VanderWeele 6 domains + PERMA 5 ---
export const VANDERWEELE_DOMAINS = [
  "HAPPINESS", "HEALTH", "MEANING", "CHARACTER", "RELATIONSHIPS", "STABILITY",
] as const;
export type VanderweeleDomain = (typeof VANDERWEELE_DOMAINS)[number];

export const PERMA_DOMAINS = [
  "POSITIVE_EMOTION", "ENGAGEMENT", "RELATIONSHIPS", "MEANING", "ACCOMPLISHMENT",
] as const;
export type PermaDomain = (typeof PERMA_DOMAINS)[number];

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  const clamped = values.map((v) => Math.max(0, Math.min(1, v)));
  return clamped.reduce((s, v) => s + v, 0) / clamped.length;
}

export interface FlourishingResult {
  vanderweele: number;
  perma: number;
  index: number; // composite [0,1]
  band: "LOW" | "MODERATE" | "HIGH";
}
export function computeFlourishing(
  vw: Partial<Record<VanderweeleDomain, number>>,
  perma: Partial<Record<PermaDomain, number>>,
): FlourishingResult {
  const vwScore = avg(VANDERWEELE_DOMAINS.map((d) => vw[d] ?? 0));
  const permaScore = avg(PERMA_DOMAINS.map((d) => perma[d] ?? 0));
  const index = Number(((vwScore + permaScore) / 2).toFixed(4));
  const band = index >= 0.7 ? "HIGH" : index >= 0.4 ? "MODERATE" : "LOW";
  return { vanderweele: Number(vwScore.toFixed(4)), perma: Number(permaScore.toFixed(4)), index, band };
}

// --- CompanionRuntime — 7 companions, one intelligence ---
export type CompanionAuthority = "SUPREME" | "HIGH" | "MEDIUM";
export const COMPANIONS = [
  { id: "FOUNDER", authority: "SUPREME", contexts: ["all", "vision"] },
  { id: "EXECUTIVE", authority: "HIGH", contexts: ["strategic"] },
  { id: "OPERATOR", authority: "MEDIUM", contexts: ["tactical"] },
  { id: "BUILDER", authority: "MEDIUM", contexts: ["projects"] },
  { id: "ANALYST", authority: "MEDIUM", contexts: ["analysis"] },
  { id: "CLINIC", authority: "MEDIUM", contexts: ["clinical"] },
  { id: "PERSONAL", authority: "MEDIUM", contexts: ["personal"] },
] as const;
export type CompanionId = (typeof COMPANIONS)[number]["id"];

const AUTHORITY_RANK: Record<CompanionAuthority, number> = { SUPREME: 1, HIGH: 2, MEDIUM: 3 };
export function authorityRank(a: CompanionAuthority): number {
  return AUTHORITY_RANK[a];
}

/** The Founder companion (SUPREME) accesses everything; others only their contexts. */
export function companionCanAccess(id: CompanionId, context: string): boolean {
  const c = COMPANIONS.find((x) => x.id === id);
  if (!c) return false;
  if (c.authority === "SUPREME") return true;
  return (c.contexts as readonly string[]).includes(context);
}

export function resolveCompanion(context: string): CompanionId {
  const match = COMPANIONS.find((c) => c.id !== "FOUNDER" && (c.contexts as readonly string[]).includes(context));
  return match ? match.id : "FOUNDER";
}

// --- InstitutionalDecisionEngine — 7 questions + cycle + harmonic quality ---
export const DECISION_QUESTIONS = [
  "أي حلم؟", "أي إمكانات؟", "أي هدف؟", "أي فهم؟", "أي مخاطر؟", "أثر الازدهار؟", "أثر IFC؟",
] as const;

export const DECISION_STATES = ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "EXECUTE"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];
export type DecisionAction = "submit" | "approve" | "reject" | "execute";

export function advanceDecision(state: DecisionState, action: DecisionAction): DecisionState {
  if (state === "DRAFT" && action === "submit") return "REVIEW";
  if (state === "REVIEW" && action === "approve") return "APPROVED";
  if (state === "REVIEW" && action === "reject") return "REJECTED";
  if (state === "APPROVED" && action === "execute") return "EXECUTE";
  return state;
}

/** Decision quality = harmonic mean of the 7 answer scores (any 0 ⇒ 0). */
export function decisionQuality(scores: number[]): number {
  if (scores.length === 0) return 0;
  const clamped = scores.map((s) => Math.max(0, Math.min(1, s)));
  if (clamped.some((s) => s === 0)) return 0;
  const denom = clamped.reduce((sum, s) => sum + 1 / s, 0);
  return Number((clamped.length / denom).toFixed(4));
}

// --- ContinuityEngine — 7 categories + survival + 30/90 forecast ---
export const CONTINUITY_CATEGORIES = [
  "KNOWLEDGE", "PRACTICE", "RELATIONSHIP", "PRINCIPLE", "CAPABILITY", "CULTURE", "HISTORY",
] as const;
export type ContinuityCategory = (typeof CONTINUITY_CATEGORIES)[number];

export interface ContinuityForecast {
  survivalScore: number; // [0,1]
  day30: number;
  day90: number;
  trend: "STABLE" | "DECLINING" | "AT_RISK";
}
export function continuityForecast(
  scores: Partial<Record<ContinuityCategory, number>>,
  monthlyDecay = 0.1,
): ContinuityForecast {
  const survivalScore = avg(CONTINUITY_CATEGORIES.map((c) => scores[c] ?? 0));
  const decay = Math.max(0, Math.min(1, monthlyDecay));
  const day30 = Number((survivalScore * (1 - decay)).toFixed(4));
  const day90 = Number((survivalScore * Math.pow(1 - decay, 3)).toFixed(4));
  const trend = day90 < 0.4 ? "AT_RISK" : day90 < survivalScore - 0.05 ? "DECLINING" : "STABLE";
  return { survivalScore: Number(survivalScore.toFixed(4)), day30, day90, trend };
}

// --- D05 PersonalOS + D06 InstitutionalOS constitutions ---
export const PERSONAL_PILLARS = ["AGENCY", "PRIVACY", "AMANAH", "CONTEXT_OWNERSHIP", "FLOURISHING"] as const;
export type PersonalPillar = (typeof PERSONAL_PILLARS)[number];

export const PERSONAL_OS = {
  layers: 9,
  pillars: PERSONAL_PILLARS,
  flourishingIndicators: 13,
  defaultDreamVisibility: "PRIVATE" as const,
} as const;

export const INSTITUTIONAL_OS = {
  layers: 7,
  indicators: 9,
  nonReductionRule: true,
  delegatesTo: "InstitutionalDecisionEngine" as const,
} as const;

export function exportContext(pillarScores: Partial<Record<PersonalPillar, number>>): {
  pillars: Record<PersonalPillar, number>;
  agencyRespected: boolean;
} {
  const pillars = {} as Record<PersonalPillar, number>;
  for (const p of PERSONAL_PILLARS) pillars[p] = Math.max(0, Math.min(1, pillarScores[p] ?? 0));
  return { pillars, agencyRespected: pillars.AGENCY >= 0.5 && pillars.PRIVACY >= 0.5 };
}

// ============================================================
// USFIP ENGINE — M5 (MED v2.0 §7: السيادة / Sovereignty)
// Universal Self-First Intelligence Protocol v1.0 + v1.1.
//   • Self-First ladder L1→L5 (IURG internal $0 → Frontier AI teachers → humans)
//   • EXT-01 ISES: 12-dimension source evaluation → Tier
//   • EXT-02 Provider Capital: 11-dimension capital that evolves from outcomes
//   • EXT-03 Sovereignty Loop: 5 questions before every external call
//   • EXT-04 ISMF: 6 metrics (KSR/PDR/KRR/KOR/SCG/SAI)
// Pure / deterministic (no wall-clock, no RNG, no external calls) → CI-safe.
// GPT ≠ ONX: external intelligence becomes ONX only after verification + IURG merge.
// ============================================================

// ---------- Self-First ladder ----------
export const SELF_FIRST_LADDER = [
  "L1_IURG",        // internal knowledge graph ($0)
  "L2_TOOLS",       // deterministic tools
  "L3_FRONTIER_AI", // frontier models as teachers (claims @ conf 0.30–0.50)
  "L4_INTERNET",    // open web
  "L5_HUMANS",      // human experts
] as const;
export type Layer = (typeof SELF_FIRST_LADDER)[number];

export const LAYER_COST: Record<Layer, number> = {
  L1_IURG: 0,
  L2_TOOLS: 1,
  L3_FRONTIER_AI: 5,
  L4_INTERNET: 3,
  L5_HUMANS: 20,
};

export const FRONTIER_CONFIDENCE_MIN = 0.30;
export const FRONTIER_CONFIDENCE_MAX = 0.50;
export const INTERNAL_TARGET = 0.92; // 92% internal answers by month 12

// ---------- EXT-01 ISES (12 dimensions) ----------
export const ISES_DIMENSIONS = [
  "domainFitness",
  "risk",                  // inverse: higher input = safer
  "historicalPerformance",
  "evidenceQuality",
  "judgmentQuality",
  "hallucinationResistance",
  "governanceCompliance",
  "costEfficiency",
  "responseTime",
  "reliability",
  "outcomeSuccess",
  "ownershipAlignment",
] as const;
export type IsesDimension = (typeof ISES_DIMENSIONS)[number];

export const SOURCE_TIERS = ["T1", "T2", "T3", "T4"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

export interface IsesResult {
  score: number;      // 0..100
  tier: SourceTier;
  weakest: IsesDimension;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const round2 = (v: number): number => Number(v.toFixed(2));

/** Evaluate a source across the 12 ISES dimensions → weighted score + Tier. */
export function scoreSource(dims: Partial<Record<IsesDimension, number>>): IsesResult {
  let sum = 0;
  let weakestVal = 2;
  let weakest: IsesDimension = ISES_DIMENSIONS[0];
  for (const d of ISES_DIMENSIONS) {
    const v = clamp01(dims[d] ?? 0);
    sum += v;
    if (v < weakestVal) {
      weakestVal = v;
      weakest = d;
    }
  }
  const score = round2((sum / ISES_DIMENSIONS.length) * 100);
  const tier: SourceTier = score >= 85 ? "T1" : score >= 70 ? "T2" : score >= 50 ? "T3" : "T4";
  return { score, tier, weakest };
}

// ---------- EXT-02 Provider Capital (11 dimensions) ----------
export const CAPITAL_DIMENSIONS = [
  "accuracy",
  "reliability",
  "costEfficiency",
  "latency",
  "evidenceQuality",
  "judgmentQuality",
  "hallucinationResistance",
  "governanceCompliance",
  "outcomeSuccess",
  "domainFitness",
  "ownershipAlignment",
] as const;
export type CapitalDimension = (typeof CAPITAL_DIMENSIONS)[number];

export interface ProviderCapital {
  id: string;
  capital: number; // 0..100 composite
  calls: number;
  wins: number;
}

/** Seed provider capital profiles (MED v2.0 §7.2 EXT-02 seeds). */
export const PROVIDER_SEEDS: ReadonlyArray<{ id: string; capital: number }> = [
  { id: "OpenAI", capital: 90.34 },
  { id: "Qwen", capital: 89.69 },
  { id: "OpenAI-Fallback", capital: 87.28 },
  { id: "DeepSeek", capital: 82.94 },
  { id: "Llama", capital: 81.75 },
];

export function seedProviders(): ProviderCapital[] {
  return PROVIDER_SEEDS.map((p) => ({ id: p.id, capital: p.capital, calls: 0, wins: 0 }));
}

const CAPITAL_LEARNING_RATE = 4; // scale for per-outcome capital delta

/**
 * Evolve provider capital from an outcome.
 * Rule: Intent → IO → Judgment → Outcome → Learning → Capital Update.
 * outcomeScore in [0,1]; >0.5 grows capital, <0.5 shrinks it (deterministic).
 */
export function evolveCapital(p: ProviderCapital, outcomeScore: number): ProviderCapital {
  const o = clamp01(outcomeScore);
  const delta = (o - 0.5) * CAPITAL_LEARNING_RATE;
  return {
    id: p.id,
    capital: round2(Math.max(0, Math.min(100, p.capital + delta))),
    calls: p.calls + 1,
    wins: p.wins + (o >= 0.5 ? 1 : 0),
  };
}

// ---------- EXT-03 Sovereignty Loop (5 questions) ----------
export const SOVEREIGNTY_QUESTIONS = [
  "knowsInternally",      // أنعرف هذا؟
  "ownsData",             // أنملكه؟
  "hasReusableJudgment",  // أنملك حكماً قابلاً لإعادة الاستخدام؟
  "hasWisdom",            // أنملك حكمة؟
  "externalNecessary",    // هل الخارجي ضروري فعلاً؟
] as const;
export type SovereigntyQuestion = (typeof SOVEREIGNTY_QUESTIONS)[number];

export interface QueryContext {
  id: string;
  knowsInternally: boolean;
  ownsData: boolean;
  hasReusableJudgment: boolean;
  hasWisdom: boolean;
  externalNecessary: boolean;
}

export interface SovereigntyDecision {
  id: string;
  answers: Record<SovereigntyQuestion, boolean>;
  internalSufficient: boolean;
  resolvedLayer: Layer;
  cost: number;
  confidence: number;  // 1.0 internal; 0.30–0.50 when frontier is used
  advisory: boolean;   // external requested but internal was sufficient → advisory only
  reusedJudgment: boolean;
  ownedKnowledge: boolean;
}

/**
 * Run the 5-question Sovereignty Loop for one query.
 * Internal is preferred; a frontier call is only made when internal is
 * insufficient AND external is necessary. If internal was sufficient but the
 * caller asked for external, the external result is downgraded to advisory.
 */
export function runSovereigntyLoop(ctx: QueryContext): SovereigntyDecision {
  const answers: Record<SovereigntyQuestion, boolean> = {
    knowsInternally: ctx.knowsInternally,
    ownsData: ctx.ownsData,
    hasReusableJudgment: ctx.hasReusableJudgment,
    hasWisdom: ctx.hasWisdom,
    externalNecessary: ctx.externalNecessary,
  };

  const internalSufficient =
    ctx.knowsInternally && ctx.ownsData && (ctx.hasReusableJudgment || ctx.hasWisdom);

  let resolvedLayer: Layer;
  let confidence: number;
  if (internalSufficient) {
    resolvedLayer = "L1_IURG";
    confidence = 1.0;
  } else if (ctx.externalNecessary) {
    resolvedLayer = "L3_FRONTIER_AI";
    // frontier outputs enter as claims with confidence 0.30–0.50
    confidence = FRONTIER_CONFIDENCE_MIN;
  } else {
    resolvedLayer = "L2_TOOLS";
    confidence = 0.7;
  }

  return {
    id: ctx.id,
    answers,
    internalSufficient,
    resolvedLayer,
    cost: LAYER_COST[resolvedLayer],
    confidence,
    advisory: internalSufficient && ctx.externalNecessary,
    reusedJudgment: ctx.hasReusableJudgment,
    ownedKnowledge: ctx.ownsData,
  };
}

// ---------- EXT-04 ISMF (6 sovereignty metrics) ----------
export interface IsmfMetrics {
  KSR: number;   // Knowledge Self-sufficiency Rate  (>0.70)
  PDR: number;   // Provider Dependency Rate         (<0.30)
  KRR: number;   // Knowledge Reuse Rate             (>0.50)
  KOR: number;   // Knowledge Ownership Rate         (>0.60)
  SCG: number;   // Sovereign Capital Growth         (>0, growing)
  SAI: number;   // Sovereignty Advancement Index    (>0)
  pass: Record<"KSR" | "PDR" | "KRR" | "KOR" | "SCG" | "SAI", boolean>;
  sovereign: boolean; // all six pass
}

export const ISMF_THRESHOLDS = {
  KSR: 0.70,
  PDR: 0.30,
  KRR: 0.50,
  KOR: 0.60,
} as const;

/** Compute the 6 ISMF metrics from a ledger of sovereignty decisions. */
export function computeIsmf(ledger: SovereigntyDecision[], capitalGrowth: number): IsmfMetrics {
  const n = Math.max(1, ledger.length);
  const internal = ledger.filter((d) => d.resolvedLayer === "L1_IURG").length;
  const reused = ledger.filter((d) => d.reusedJudgment).length;
  const owned = ledger.filter((d) => d.ownedKnowledge).length;

  const KSR = round2(internal / n);
  const PDR = round2(1 - internal / n);
  const KRR = round2(reused / n);
  const KOR = round2(owned / n);
  const SCG = round2(capitalGrowth);
  // SAI: net sovereignty momentum = internal minus external, adjusted by reuse.
  const external = ledger.length - internal;
  const SAI = round2(internal - external + reused * 0.5);

  const pass = {
    KSR: KSR > ISMF_THRESHOLDS.KSR,
    PDR: PDR < ISMF_THRESHOLDS.PDR,
    KRR: KRR > ISMF_THRESHOLDS.KRR,
    KOR: KOR > ISMF_THRESHOLDS.KOR,
    SCG: SCG > 0,
    SAI: SAI > 0,
  };
  const sovereign = Object.values(pass).every(Boolean);
  return { KSR, PDR, KRR, KOR, SCG, SAI, pass, sovereign };
}

// ---------- Aggregate sovereignty state ----------
export interface SovereigntyState {
  ledger: SovereigntyDecision[];
  providers: ProviderCapital[];
  baselineCapital: number;
}

export function createSovereignty(): SovereigntyState {
  const providers = seedProviders();
  const baselineCapital = round2(providers.reduce((s, p) => s + p.capital, 0));
  return { ledger: [], providers, baselineCapital };
}

export interface SovereigntyReport {
  queries: number;
  internalRate: number;
  targetInternal: number;
  onTrackToTarget: boolean;
  ismf: IsmfMetrics;
  providers: ProviderCapital[];
  capitalTotal: number;
  capitalGrowth: number;
}

export function sovereigntyReport(state: SovereigntyState): SovereigntyReport {
  const capitalTotal = round2(state.providers.reduce((s, p) => s + p.capital, 0));
  const capitalGrowth = round2(capitalTotal - state.baselineCapital);
  const ismf = computeIsmf(state.ledger, capitalGrowth);
  const internalRate = ismf.KSR;
  return {
    queries: state.ledger.length,
    internalRate,
    targetInternal: INTERNAL_TARGET,
    onTrackToTarget: internalRate >= INTERNAL_TARGET,
    ismf,
    providers: state.providers,
    capitalTotal,
    capitalGrowth,
  };
}

// ============================================================
// ALLOCATION ENGINE — D13.5 (M6) — MED v2.0 §3 (D13.5)
// Where intelligence effort goes: APS (6 dims) + P1-P7 priorities
// (P1 = continuity overrides all) + 5 modes + detection of the 7
// failure patterns. Pure / deterministic → CI-testable.
// ============================================================

// --- APS — Allocation Priority Score, 6 dimensions ---
export const APS_DIMENSIONS = [
  { id: "FI", name: "نية المؤسس", weight: 0.30 },        // Founder Intent
  { id: "CS", name: "حساسية الاستمرارية", weight: 0.25 }, // Continuity Sensitivity
  { id: "FA", name: "محاذاة الازدهار", weight: 0.15 },    // Flourishing Alignment
  { id: "CM", name: "زخم التركيب", weight: 0.12 },        // Compounding Momentum
  { id: "RC", name: "العائد على رأس المال", weight: 0.10 },// Return on Capital
  { id: "WL", name: "الحِمل/الجهد", weight: 0.08 },        // Workload
] as const;
export type ApsDimensionId = (typeof APS_DIMENSIONS)[number]["id"];

const APS_TOTAL_WEIGHT = APS_DIMENSIONS.reduce((s, d) => s + d.weight, 0);

/** Weighted APS in [0,1] from per-dimension scores (each clamped to [0,1]). */
export function computeAPS(scores: Partial<Record<ApsDimensionId, number>>): number {
  let acc = 0;
  for (const d of APS_DIMENSIONS) {
    const raw = scores[d.id] ?? 0;
    const s = Math.max(0, Math.min(1, raw));
    acc += s * d.weight;
  }
  return Number((acc / APS_TOTAL_WEIGHT).toFixed(4));
}

// --- P1-P7 priorities (P1 = continuity, overrides all) ---
export const PRIORITIES = [
  { id: "P1", name: "الاستمرارية (تتجاوز الكل)", rank: 1 },
  { id: "P2", name: "الأمانة/السلامة", rank: 2 },
  { id: "P3", name: "نية المؤسس النشطة", rank: 3 },
  { id: "P4", name: "الجودة/الرعاية", rank: 4 },
  { id: "P5", name: "التركيب/النمو", rank: 5 },
  { id: "P6", name: "الكفاءة", rank: 6 },
  { id: "P7", name: "الاستكشاف/التجريبي", rank: 7 },
] as const;
export type PriorityId = (typeof PRIORITIES)[number]["id"];

/** Pick the winning priority (lowest rank) among those that apply. */
export function resolvePriority(applicable: PriorityId[]): PriorityId | null {
  if (applicable.length === 0) return null;
  const set = new Set(applicable);
  const winner = PRIORITIES.find((p) => set.has(p.id));
  return winner ? winner.id : null;
}

// --- 5 allocation modes ---
export const ALLOCATION_MODES = [
  "PRESERVATION", "REINFORCEMENT", "EXPANSION", "TRANSFER", "EVOLUTION",
] as const;
export type AllocationMode = (typeof ALLOCATION_MODES)[number];

export interface ModeSignals {
  continuityRisk?: boolean;   // capital at risk of decay → protect
  provenHighValue?: boolean;  // proven capital → strengthen
  newOpportunity?: boolean;   // new area → grow
  crossDomainNeed?: boolean;  // move capital between domains
  transformationReady?: boolean; // change capital form
}

export function selectMode(signals: ModeSignals): AllocationMode {
  if (signals.continuityRisk) return "PRESERVATION";
  if (signals.transformationReady) return "EVOLUTION";
  if (signals.crossDomainNeed) return "TRANSFER";
  if (signals.newOpportunity) return "EXPANSION";
  if (signals.provenHighValue) return "REINFORCEMENT";
  return "REINFORCEMENT";
}

// --- 7 failure patterns ---
export const FAILURE_PATTERNS = [
  "HOARDING", "FRAGMENTATION", "CONCENTRATION", "FASHION",
  "DRIFT", "FALSE_COMPOUNDING", "PARALYSIS",
] as const;
export type FailurePattern = (typeof FAILURE_PATTERNS)[number];

export interface AllocationState {
  preservationRatio?: number; // share of effort locked in preservation [0,1]
  expansionRatio?: number;    // share in expansion [0,1]
  numAllocations?: number;    // count of distinct allocations
  maxDomainShare?: number;    // largest single-domain share [0,1]
  driftFromIntent?: number;   // divergence from founder intent [0,1]
  churnRate?: number;         // rate of switching targets [0,1]
  claimedCompounding?: boolean;
  momentum?: number;          // real compounding momentum [0,1]
  actionRate?: number;        // share of effort actually deployed [0,1]
}

export interface FailureFinding {
  pattern: FailurePattern;
  reason: string;
}

/** Detect the 7 allocation failure patterns from an allocation snapshot. */
export function detectFailures(state: AllocationState): FailureFinding[] {
  const s = {
    preservationRatio: state.preservationRatio ?? 0,
    expansionRatio: state.expansionRatio ?? 0,
    numAllocations: state.numAllocations ?? 1,
    maxDomainShare: state.maxDomainShare ?? 0,
    driftFromIntent: state.driftFromIntent ?? 0,
    churnRate: state.churnRate ?? 0,
    claimedCompounding: state.claimedCompounding ?? false,
    momentum: state.momentum ?? 0,
    actionRate: state.actionRate ?? 1,
  };
  const out: FailureFinding[] = [];
  if (s.preservationRatio >= 0.8 && s.expansionRatio <= 0.05) out.push({ pattern: "HOARDING", reason: "اكتناز: كل الجهد محفوظ بلا توسّع" });
  if (s.numAllocations >= 12 && s.maxDomainShare <= 0.1) out.push({ pattern: "FRAGMENTATION", reason: "تشظٍّ: توزيع مفرط بلا تركيز" });
  if (s.maxDomainShare >= 0.7) out.push({ pattern: "CONCENTRATION", reason: "تركّز مفرط في مجال واحد" });
  if (s.churnRate >= 0.6 && s.driftFromIntent >= 0.4) out.push({ pattern: "FASHION", reason: "ملاحقة الموضة: تبديل عالٍ بعيداً عن النية" });
  if (s.driftFromIntent >= 0.5) out.push({ pattern: "DRIFT", reason: "انحراف عن نية المؤسس" });
  if (s.claimedCompounding && s.momentum < 0.3) out.push({ pattern: "FALSE_COMPOUNDING", reason: "تركيب زائف: ادعاء تراكم بلا زخم حقيقي" });
  if (s.actionRate <= 0.1) out.push({ pattern: "PARALYSIS", reason: "شلل: لا تخصيص فعلي" });
  return out;
}

// --- Reference constants (economics + objectives + transfer paths) ---
export const ECONOMIC_LAWS = [
  { id: "EL-1", text: "رأس المال يتراكم أو يتحلل — لا ثبات" },
  { id: "EL-2", text: "التخصيص يتبع النية لا الموضة" },
  { id: "EL-3", text: "الاستمرارية تسبق العائد" },
] as const;

export const ALLOCATION_OBJECTIVES = [
  "AO-1", "AO-2", "AO-3", "AO-4", "AO-5", "AO-6", "AO-7", "AO-8", "AO-9",
] as const;

export const TRANSFER_PATHS = [
  "TP-1", "TP-2", "TP-3", "TP-4", "TP-5", "TP-6", "TP-7",
] as const;

// --- Integrated allocation decision ---
export interface AllocationRequest {
  apsScores: Partial<Record<ApsDimensionId, number>>;
  priorities: PriorityId[];
  signals: ModeSignals;
  state: AllocationState;
}

export interface AllocationDecision {
  aps: number;
  priority: PriorityId | null;
  mode: AllocationMode;
  failures: FailureFinding[];
  healthy: boolean;
}

export function allocate(req: AllocationRequest): AllocationDecision {
  const aps = computeAPS(req.apsScores);
  const priority = resolvePriority(req.priorities);
  const mode = selectMode(req.signals);
  const failures = detectFailures(req.state);
  // A continuity-risk request forces PRESERVATION regardless of other signals.
  return { aps, priority, mode, failures, healthy: failures.length === 0 };
}

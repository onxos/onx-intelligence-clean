// ============================================================
// IUC ENGINE — Intelligence Understanding Capital (I-M4)
// Faithful implementation of MED v2.0 §2.1–2.4:
//   - IURG: 16 object types (7 core causal chain + 2 constraint + 7 supporting)
//   - Understanding ladder R1→R6 (§2.2)
//   - IUC equation:  IUC(t) = Σ[U×C×M×V×Y×D(t)] − penalties + rewards (§2.3)
//   - 11 dashboard indicators TUC…FAS (§2.4)
//   - 7 validation gates VG (§2.3)
// Pure, dependency-free and deterministic → fully unit-testable.
// ============================================================

// --- IURG 16 object types (§2.1) ---
export const CORE_TYPES = [
  "PERCEPTION", "PATTERN", "UNDERSTANDING", "JUDGMENT", "DECISION", "EXECUTION", "OUTCOME",
] as const;
export const CONSTRAINT_TYPES = ["FOUNDER_INTENT", "CONSTITUTIONAL_CONSTRAINT"] as const;
export const SUPPORTING_TYPES = [
  "EVIDENCE", "REVIEW", "AMENDMENT", "CONFLICT", "OVERRIDE", "VALIDATION", "LEARNING_EVENT",
] as const;

export const IURG_TYPES = [...CORE_TYPES, ...CONSTRAINT_TYPES, ...SUPPORTING_TYPES] as const;
export type IurgObjectType = (typeof IURG_TYPES)[number];

export type Rank = 1 | 2 | 3 | 4 | 5 | 6;
export type VerificationLevel = "UNVERIFIED" | "POSSIBLE" | "PROBABLE" | "CONFIRMED" | "PROVEN";

// --- U: type weights (§2.3 — core per spec; others calibrated) ---
export const TYPE_WEIGHTS: Record<IurgObjectType, number> = {
  PERCEPTION: 1, PATTERN: 5, UNDERSTANDING: 20, JUDGMENT: 50, DECISION: 10, EXECUTION: 5, OUTCOME: 30,
  FOUNDER_INTENT: 40, CONSTITUTIONAL_CONSTRAINT: 60,
  EVIDENCE: 3, REVIEW: 2, AMENDMENT: 3, CONFLICT: 0, OVERRIDE: 0, VALIDATION: 4, LEARNING_EVENT: 8,
};

// --- M: maturity by rank R1=0.10 → R6=1.00, linear step 0.18 (§2.3) ---
export const MATURITY_BY_RANK: Record<Rank, number> = {
  1: 0.10, 2: 0.28, 3: 0.46, 4: 0.64, 5: 0.82, 6: 1.00,
};

// --- V: verification Unverified=0.10 → Proven=1.00 (§2.3) ---
export const VERIFICATION_VALUE: Record<VerificationLevel, number> = {
  UNVERIFIED: 0.10, POSSIBLE: 0.30, PROBABLE: 0.60, CONFIRMED: 0.85, PROVEN: 1.00,
};

// --- D(t): daily decay rate per type; CONSTITUTIONAL/FOUNDER = 0 (§2.3) ---
export const DECAY_RATE: Record<IurgObjectType, number> = {
  PERCEPTION: 0.10, PATTERN: 0.05, UNDERSTANDING: 0.02, JUDGMENT: 0.01, DECISION: 0.03,
  EXECUTION: 0.04, OUTCOME: 0.015, FOUNDER_INTENT: 0.0, CONSTITUTIONAL_CONSTRAINT: 0.0,
  EVIDENCE: 0.02, REVIEW: 0.03, AMENDMENT: 0.01, CONFLICT: 0.05, OVERRIDE: 0.05,
  VALIDATION: 0.02, LEARNING_EVENT: 0.02,
};
export const DECAY_FLOOR = 0.20; // §2.3 minimum retention D=0.20

// --- Accumulation constants (§2.3) ---
export const ACCUM = { alpha: 1.0, beta: 0.3, gamma: 0.05, delta: 0.8 } as const;

export interface IurgObjectInput {
  id?: string;
  type: IurgObjectType;
  rank?: Rank;
  verification?: VerificationLevel;
  contentText?: string;
  ageDays?: number;
  context?: number;          // C ∈ [0,1]
  yield?: number;            // Y ∈ [0,1]
  amanah?: number;           // ∈ [0,1]  → CAS
  founderAlignment?: number; // ∈ [0,1]  → FAS
  validated?: boolean;
  sources?: number;
  trust?: number;            // ∈ [0,1]
  transfer?: number;         // ∈ [0,1]
  overrides?: number;
  drift?: number;            // ∈ [0,1]
  catastrophe?: boolean;
}

interface NormalizedObject {
  type: IurgObjectType;
  rank: Rank;
  verification: VerificationLevel;
  ageDays: number;
  context: number;
  yield: number;
  amanah: number;
  founderAlignment: number;
  validated: boolean;
  sources: number;
  trust: number;
  transfer: number;
  overrides: number;
  drift: number;
  catastrophe: boolean;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function normalize(o: IurgObjectInput): NormalizedObject {
  return {
    type: o.type,
    rank: (o.rank ?? 1) as Rank,
    verification: o.verification ?? "UNVERIFIED",
    ageDays: Math.max(0, o.ageDays ?? 0),
    context: clamp01(o.context ?? 1),
    yield: clamp01(o.yield ?? 1),
    amanah: clamp01(o.amanah ?? 0.5),
    founderAlignment: clamp01(o.founderAlignment ?? 0.5),
    validated: o.validated ?? false,
    sources: Math.max(0, o.sources ?? 1),
    trust: clamp01(o.trust ?? 0.5),
    transfer: clamp01(o.transfer ?? 0.5),
    overrides: Math.max(0, o.overrides ?? 0),
    drift: clamp01(o.drift ?? 0),
    catastrophe: o.catastrophe ?? false,
  };
}

/** D(t): retention factor after age-based decay, floored at DECAY_FLOOR. */
export function decayFactor(type: IurgObjectType, ageDays: number): number {
  const rate = DECAY_RATE[type];
  if (rate === 0) return 1.0;
  return Math.max(DECAY_FLOOR, 1 - rate * Math.max(0, ageDays));
}

/** Per-object IUC contribution: U × C × M × V × Y × D(t). */
export function objectIUC(input: IurgObjectInput): number {
  const o = normalize(input);
  const U = TYPE_WEIGHTS[o.type];
  const C = o.context;
  const M = MATURITY_BY_RANK[o.rank];
  const V = VERIFICATION_VALUE[o.verification];
  const Y = o.yield;
  const D = decayFactor(o.type, o.ageDays);
  return U * C * M * V * Y * D;
}

function penaltyOf(o: NormalizedObject): number {
  let p = o.overrides * 5;
  if (o.type === "OVERRIDE") p += 10;
  if (o.catastrophe) p += TYPE_WEIGHTS[o.type] * 0.5;
  return p;
}

function rewardOf(o: NormalizedObject, contribution: number): number {
  // Stability reward: mature (R5+), zero-override, validated objects reinforce capital.
  if (o.rank >= 5 && o.overrides === 0 && o.validated) return contribution * 0.10;
  return 0;
}

export interface Indicator {
  key: string;
  label: string;
  value: number;
  target: number;
  direction: "min" | "max"; // min = value should be ≥ target; max = value should be ≤ target
  status: "GREEN" | "AMBER" | "RED";
  unit: "score" | "ratio" | "capital" | "rank";
}

function makeIndicator(
  key: string, label: string, value: number, target: number,
  direction: "min" | "max", unit: Indicator["unit"],
): Indicator {
  let status: Indicator["status"];
  if (direction === "min") {
    status = value >= target ? "GREEN" : value >= target * 0.8 ? "AMBER" : "RED";
  } else {
    status = value <= target ? "GREEN" : value <= target * 1.25 ? "AMBER" : "RED";
  }
  return { key, label, value: Math.round(value * 10000) / 10000, target, direction, status, unit };
}

export interface IUCSnapshot {
  tuc: number;
  capital: number;
  penalties: number;
  rewards: number;
  objectCount: number;
  indicators: Indicator[];
  computedAt: string;
}

export interface ComputeOptions {
  previousTUC?: number;
}

/** Compute the full IUC snapshot (TUC + 11 indicators) over a set of IURG objects. */
export function computeIUC(inputs: IurgObjectInput[], opts: ComputeOptions = {}): IUCSnapshot {
  const objs = inputs.map(normalize);
  const contributions = inputs.map(objectIUC);

  const capital = contributions.reduce((a, b) => a + b, 0);
  const penalties = objs.reduce((a, o) => a + penaltyOf(o), 0);
  const rewards = objs.reduce((a, o, i) => a + rewardOf(o, contributions[i]), 0);
  const tuc = Math.max(0, capital - penalties + rewards);

  const n = objs.length || 1;

  // Concentration (UC): Herfindahl index over type capital shares.
  const byType = new Map<IurgObjectType, number>();
  objs.forEach((o, i) => byType.set(o.type, (byType.get(o.type) ?? 0) + contributions[i]));
  const totalCap = capital || 1;
  let concentration = 0;
  for (const cap of byType.values()) {
    const share = cap / totalCap;
    concentration += share * share;
  }
  if (byType.size === 0) concentration = 0;

  // Coverage (UCV): distinct types present / 16.
  const coverage = new Set(objs.map((o) => o.type)).size / IURG_TYPES.length;

  // Yield (UY): U×M×V-weighted average of realized yield.
  let ySum = 0, yWeight = 0;
  objs.forEach((o) => {
    const w = TYPE_WEIGHTS[o.type] * MATURITY_BY_RANK[o.rank] * VERIFICATION_VALUE[o.verification];
    ySum += o.yield * w;
    yWeight += w;
  });
  const uy = yWeight > 0 ? ySum / yWeight : 0;

  // Risk (URS) = 0.25·decay + 0.25·concentration + 0.30·drift + 0.20·catastrophe.
  const decayComp = objs.reduce((a, o) => a + (1 - decayFactor(o.type, o.ageDays)), 0) / n;
  const driftComp = objs.reduce((a, o) => a + o.drift, 0) / n;
  const cataComp = objs.filter((o) => o.catastrophe).length / n;
  const urs = 0.25 * decayComp + 0.25 * concentration + 0.30 * driftComp + 0.20 * cataComp;

  const transferability = objs.reduce((a, o) => a + o.transfer, 0) / n;
  const maturityAvg = objs.reduce((a, o) => a + o.rank, 0) / n; // 1..6 scale
  const validationRate = objs.filter((o) => o.validated).length / n;
  const cas = objs.reduce((a, o) => a + o.amanah, 0) / n;
  const fas = objs.reduce((a, o) => a + o.founderAlignment, 0) / n;
  const ugr = opts.previousTUC && opts.previousTUC > 0 ? (tuc - opts.previousTUC) / opts.previousTUC : 0;

  const indicators: Indicator[] = [
    makeIndicator("TUC", "Total Understanding Capital", tuc, 0, "min", "capital"),
    makeIndicator("UGR", "Understanding Growth Rate", ugr, 0.03, "min", "ratio"),
    makeIndicator("UY", "Understanding Yield", uy, 0.60, "min", "score"),
    makeIndicator("URS", "Understanding Risk Score", urs, 0.30, "max", "score"),
    makeIndicator("UC", "Understanding Concentration", concentration, 0.40, "max", "score"),
    makeIndicator("UCV", "Understanding Coverage", coverage, 0.80, "min", "score"),
    makeIndicator("UT", "Understanding Transferability", transferability, 0.70, "min", "score"),
    makeIndicator("UM", "Understanding Maturity", maturityAvg, 3.0, "min", "rank"),
    makeIndicator("UVR", "Understanding Validation Rate", validationRate, 0.85, "min", "ratio"),
    makeIndicator("CAS", "Constitutional Alignment Score", cas, 0.95, "min", "score"),
    makeIndicator("FAS", "Founder Alignment Score", fas, 0.95, "min", "score"),
  ];

  return {
    tuc: Math.round(tuc * 10000) / 10000,
    capital: Math.round(capital * 10000) / 10000,
    penalties: Math.round(penalties * 10000) / 10000,
    rewards: Math.round(rewards * 10000) / 10000,
    objectCount: inputs.length,
    indicators,
    computedAt: new Date().toISOString(),
  };
}

// --- 7 Validation Gates (§2.3) ---
export interface GateResult { name: string; passed: boolean; detail: string; }
export interface ValidationResult { passed: boolean; gates: GateResult[]; }

export function validationGates(input: IurgObjectInput): ValidationResult {
  const o = normalize(input);
  const objRisk = (1 - decayFactor(o.type, o.ageDays)) * 0.4 + o.drift * 0.6;
  const gates: GateResult[] = [
    { name: "TRUST", passed: o.trust >= 0.60, detail: `trust ${o.trust.toFixed(2)} ≥ 0.60` },
    { name: "SOURCES", passed: o.sources >= 2, detail: `${o.sources} sources ≥ 2` },
    { name: "EVIDENCE", passed: VERIFICATION_VALUE[o.verification] >= 0.60, detail: `${o.verification} ≥ PROBABLE` },
    { name: "FIC", passed: o.amanah >= 0.50, detail: `amanah ${o.amanah.toFixed(2)} ≥ 0.50` },
    { name: "DECAY_CAP", passed: 1 - decayFactor(o.type, o.ageDays) <= 0.30, detail: `decay ≤ 0.30` },
    { name: "TRANSFER", passed: o.transfer >= 0.60, detail: `transfer ${o.transfer.toFixed(2)} ≥ 0.60` },
    { name: "RISK", passed: objRisk < 0.60, detail: `risk ${objRisk.toFixed(2)} < 0.60` },
  ];
  return { passed: gates.every((g) => g.passed), gates };
}

// --- Understanding ladder R1→R6 (§2.2) ---
export interface PromotionResult {
  currentRank: Rank;
  eligible: boolean;
  nextRank: Rank | null;
  gate: string;
  humanApprovalRequired: boolean;
  reason: string;
}

export function checkPromotion(input: IurgObjectInput): PromotionResult {
  const o = normalize(input);
  const r = o.rank;
  const base = (nextRank: Rank | null, eligible: boolean, gate: string, human: boolean, reason: string): PromotionResult =>
    ({ currentRank: r, eligible, nextRank, gate, humanApprovalRequired: human, reason });

  switch (r) {
    case 1:
      return base(2, o.trust >= 0.60 && o.sources >= 2, "AUTO", false,
        "R1→R2 pattern: 3 repetitions + 2 sources + trust ≥ 0.60");
    case 2:
      return base(3, o.trust >= 0.75, "AUTO", false,
        "R2→R3 understanding: causality + context + FIC + trust ≥ 0.75");
    case 3:
      return base(4, o.trust >= 0.85, "DG-09", true,
        "R3→R4 judgment: 2 branches + 2 time cycles + trust ≥ 0.85 (DG-09 ops manager)");
    case 4:
      return base(5, o.trust >= 0.92 && o.overrides === 0, "DG-10", true,
        "R4→R5 institutional rule: 1 year + 3 contexts + trust ≥ 0.92 + zero overrides 6mo (DG-10 founder)");
    case 5:
      return base(6, o.trust >= 0.95 && o.overrides === 0, "FOUNDER_CONSENSUS", true,
        "R5→R6 constitutional principle: 3 years + identity-core + trust ≥ 0.95 + lifetime zero overrides");
    default:
      return base(null, false, "NONE", false, "R6 is the constitutional ceiling");
  }
}

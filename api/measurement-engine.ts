// ============================================================
// D17 MEASUREMENT ENGINE — 6 Quality Indices (Track I / I-M5)
// Faithful to MED v2.0 §D17 / MED v1.0 M3.4-M3.5:
//   6 live quality indices computed from data (not constants):
//     OQI (Object Quality), ICI (Intelligence Coherence),
//     JQI (Judgment Quality), WQI (Wisdom Quality — Berlin 5 criteria),
//     UQI (Understanding Quality), IRS (Intelligence Risk Score)
//   + 3 progress states: ACCUMULATING / STABILIZING / DECLINING.
// Pure, dependency-free, deterministic → fully CI-testable.
// ============================================================
import {
  VERIFICATION_VALUE,
  MATURITY_BY_RANK,
  decayFactor,
  type IurgObjectType,
  type Rank,
  type VerificationLevel,
} from "./iuc-engine";

export type QualityIndexKey = "OQI" | "ICI" | "JQI" | "WQI" | "UQI" | "IRS";
export type ProgressState = "ACCUMULATING" | "STABILIZING" | "DECLINING";

/** Berlin wisdom model — 5 criteria, each in [0,1]. */
export interface BerlinCriteria {
  factualKnowledge?: number;
  proceduralKnowledge?: number;
  lifespanContext?: number;
  valueRelativism?: number;
  uncertaintyMgmt?: number;
}

export interface MeasurementObject extends BerlinCriteria {
  type: IurgObjectType;
  rank?: Rank;
  verification?: VerificationLevel;
  ageDays?: number;
  trust?: number;      // [0,1]
  amanah?: number;     // [0,1]
  drift?: number;      // [0,1]
  coherence?: number;  // [0,1] — alignment with the rest of the graph
  validated?: boolean;
  sources?: number;
  overrides?: number;
  yield?: number;      // [0,1]
}

export interface QualityIndex {
  key: QualityIndexKey;
  label: string;
  value: number;        // [0,1]
  target: number;
  direction: "min" | "max"; // min ⇒ value should be ≥ target; max ⇒ ≤ target
  status: "GREEN" | "AMBER" | "RED";
}

export interface MeasurementSnapshot {
  indices: QualityIndex[];
  objectCount: number;
  computedAt: string;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

interface Norm {
  type: IurgObjectType;
  rank: Rank;
  verification: VerificationLevel;
  ageDays: number;
  trust: number;
  amanah: number;
  drift: number;
  coherence: number;
  validated: boolean;
  sources: number;
  overrides: number;
  yield: number;
  berlin: Required<BerlinCriteria>;
}

function norm(o: MeasurementObject): Norm {
  const t = clamp01(o.trust ?? 0.5);
  return {
    type: o.type,
    rank: (o.rank ?? 1) as Rank,
    verification: o.verification ?? "UNVERIFIED",
    ageDays: Math.max(0, o.ageDays ?? 0),
    trust: t,
    amanah: clamp01(o.amanah ?? 0.5),
    drift: clamp01(o.drift ?? 0),
    coherence: clamp01(o.coherence ?? t),
    validated: o.validated ?? false,
    sources: Math.max(0, o.sources ?? 1),
    overrides: Math.max(0, o.overrides ?? 0),
    yield: clamp01(o.yield ?? 1),
    berlin: {
      factualKnowledge: clamp01(o.factualKnowledge ?? (o.verification === "PROVEN" ? 0.8 : 0.5)),
      proceduralKnowledge: clamp01(o.proceduralKnowledge ?? 0.5),
      lifespanContext: clamp01(o.lifespanContext ?? 0.5),
      valueRelativism: clamp01(o.valueRelativism ?? 0.5),
      uncertaintyMgmt: clamp01(o.uncertaintyMgmt ?? 0.5),
    },
  };
}

function statusFor(value: number, target: number, direction: "min" | "max"): QualityIndex["status"] {
  if (direction === "min") return value >= target ? "GREEN" : value >= target * 0.8 ? "AMBER" : "RED";
  return value <= target ? "GREEN" : value <= target * 1.25 ? "AMBER" : "RED";
}

// --- individual index computations (pure) ---

/** OQI — object-level integrity: verification × validation × source adequacy. */
export function oqi(objs: Norm[]): number {
  return mean(objs.map((o) =>
    VERIFICATION_VALUE[o.verification] * (o.validated ? 1 : 0.6) * Math.min(1, o.sources / 2)));
}

/** ICI — coherence across the graph, penalised by drift. */
export function ici(objs: Norm[]): number {
  return mean(objs.map((o) => clamp01(o.coherence * (1 - 0.5 * o.drift))));
}

/** JQI — judgment quality over JUDGMENT/DECISION objects (fallback: all). */
export function jqi(objs: Norm[]): number {
  const j = objs.filter((o) => o.type === "JUDGMENT" || o.type === "DECISION");
  const pool = j.length ? j : objs;
  return mean(pool.map((o) => o.trust * MATURITY_BY_RANK[o.rank] * VERIFICATION_VALUE[o.verification]));
}

/** WQI — Berlin 5-criteria wisdom, weighted toward mature objects. */
export function wqi(objs: Norm[]): number {
  if (!objs.length) return 0;
  let sum = 0, wsum = 0;
  for (const o of objs) {
    const b = o.berlin;
    const score = (b.factualKnowledge + b.proceduralKnowledge + b.lifespanContext + b.valueRelativism + b.uncertaintyMgmt) / 5;
    const w = MATURITY_BY_RANK[o.rank];
    sum += score * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}

/** UQI — understanding quality over UNDERSTANDING objects (fallback: all). */
export function uqi(objs: Norm[]): number {
  const u = objs.filter((o) => o.type === "UNDERSTANDING" || o.type === "PATTERN");
  const pool = u.length ? u : objs;
  return mean(pool.map((o) => o.trust * MATURITY_BY_RANK[o.rank] * o.coherence));
}

/** IRS — intelligence risk: drift + decay + unverified share + override pressure (higher = riskier). */
export function irs(objs: Norm[]): number {
  if (!objs.length) return 0;
  const driftComp = mean(objs.map((o) => o.drift));
  const decayComp = mean(objs.map((o) => 1 - decayFactor(o.type, o.ageDays)));
  const unverifiedComp = objs.filter((o) => VERIFICATION_VALUE[o.verification] < 0.6).length / objs.length;
  const overrideComp = clamp01(mean(objs.map((o) => Math.min(1, o.overrides / 3))));
  return clamp01(0.30 * driftComp + 0.25 * decayComp + 0.25 * unverifiedComp + 0.20 * overrideComp);
}

/** Compute all 6 D17 quality indices over a set of objects. */
export function computeIndices(inputs: MeasurementObject[]): MeasurementSnapshot {
  const objs = inputs.map(norm);
  const raw: Array<{ key: QualityIndexKey; label: string; value: number; target: number; direction: "min" | "max" }> = [
    { key: "OQI", label: "Object Quality Index", value: oqi(objs), target: 0.80, direction: "min" },
    { key: "ICI", label: "Intelligence Coherence Index", value: ici(objs), target: 0.75, direction: "min" },
    { key: "JQI", label: "Judgment Quality Index", value: jqi(objs), target: 0.70, direction: "min" },
    { key: "WQI", label: "Wisdom Quality Index (Berlin-5)", value: wqi(objs), target: 0.65, direction: "min" },
    { key: "UQI", label: "Understanding Quality Index", value: uqi(objs), target: 0.70, direction: "min" },
    { key: "IRS", label: "Intelligence Risk Score", value: irs(objs), target: 0.30, direction: "max" },
  ];
  const indices: QualityIndex[] = raw.map((r) => ({
    key: r.key, label: r.label, value: round4(r.value), target: r.target,
    direction: r.direction, status: statusFor(r.value, r.target, r.direction),
  }));
  return { indices, objectCount: inputs.length, computedAt: new Date().toISOString() };
}

/** Classify a domain's progress from its current vs previous index value. */
export function classifyProgress(current: number, previous: number | undefined, epsilon = 0.02): ProgressState {
  if (previous === undefined) return "STABILIZING";
  const delta = current - previous;
  if (delta > epsilon) return "ACCUMULATING";
  if (delta < -epsilon) return "DECLINING";
  return "STABILIZING";
}

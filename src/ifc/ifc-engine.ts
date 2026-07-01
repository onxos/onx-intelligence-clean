import { IFCRiskLevel, IFCSignalKind, IFCTrend } from '@prisma/client';
import {
  DEFAULT_DEGRADATION_DELTA,
  IFC_CONSTITUTIONAL_REF,
  RISK_THRESHOLDS,
  SCORE_WEIGHTS,
  TREND_EPSILON,
} from './ifc.constants';

/**
 * IFC scoring engine — pure, deterministic, side-effect free.
 * Persistence, audit and evidence live in the service layer.
 *
 * IFC measures institutional flourishing across weighted dimensions. It does
 * not reason, plan or decide — it derives a flourishing index, confidence,
 * trend, delta, risk and degradation flag from dimension scores.
 */

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ----------------------------------------------------------------------
// Part C — dimension scoring
// ----------------------------------------------------------------------

export type ScorableIndicator = {
  value: number;
  weight: number;
  confidence: number;
  status: 'ACTIVE' | 'INACTIVE' | 'DEGRADED';
};

export type DimensionScore = {
  score: number;
  confidence: number;
};

/**
 * Score a single dimension from its active indicators. The dimension score is
 * the weighted mean of indicator values; confidence is the weighted mean of
 * indicator confidences. With no active indicators the dimension scores 0.
 */
export function scoreDimension(indicators: ScorableIndicator[]): DimensionScore {
  const active = indicators.filter((i) => i.status === 'ACTIVE');
  if (!active.length) return { score: 0, confidence: 0 };
  const totalWeight = active.reduce((acc, i) => acc + Math.max(0, i.weight), 0);
  if (totalWeight <= 0) {
    const mean = active.reduce((acc, i) => acc + clamp01(i.value), 0) / active.length;
    const conf = active.reduce((acc, i) => acc + clamp01(i.confidence), 0) / active.length;
    return { score: clamp01(mean), confidence: clamp01(conf) };
  }
  const score =
    active.reduce((acc, i) => acc + clamp01(i.value) * Math.max(0, i.weight), 0) / totalWeight;
  const confidence =
    active.reduce((acc, i) => acc + clamp01(i.confidence) * Math.max(0, i.weight), 0) / totalWeight;
  return { score: clamp01(score), confidence: clamp01(confidence) };
}

// ----------------------------------------------------------------------
// Part C — weighted flourishing index, confidence, trend, delta, risk
// ----------------------------------------------------------------------

export type WeightedDimension = {
  kind: string;
  weight: number;
  score: number;
  confidence: number;
  status: 'ACTIVE' | 'INACTIVE' | 'DEGRADED';
};

export type FlourishingResult = {
  flourishingIndex: number;
  confidence: number;
  trend: IFCTrend;
  delta: number;
  risk: IFCRiskLevel;
  degraded: boolean;
  dimensionScores: { kind: string; score: number; confidence: number; weight: number }[];
  reason: string;
  constitutionalRef: string;
};

/** Map a flourishing index to a risk level. */
export function resolveRisk(index: number): IFCRiskLevel {
  const clamped = clamp01(index);
  for (const band of RISK_THRESHOLDS) {
    if (clamped >= band.min) return band.level;
  }
  return 'CRITICAL';
}

/** Resolve a trend from a signed delta against the stability epsilon. */
export function resolveTrend(delta: number): IFCTrend {
  if (delta > TREND_EPSILON) return 'RISING';
  if (delta < -TREND_EPSILON) return 'FALLING';
  return 'STABLE';
}

/**
 * Detect degradation: a flourishing drop steeper than the (negative)
 * degradation delta, or a fall into CRITICAL risk.
 */
export function detectDegradation(
  delta: number,
  risk: IFCRiskLevel,
  degradationDelta: number = DEFAULT_DEGRADATION_DELTA,
): boolean {
  return delta <= degradationDelta || risk === 'CRITICAL';
}

/**
 * Compute the institutional flourishing index from weighted dimensions.
 * The index is the weighted mean of active dimension scores; confidence is the
 * weighted mean of dimension confidences. Trend/delta are derived against the
 * previous index; risk and degradation follow from the result.
 */
export function computeFlourishing(input: {
  dimensions: WeightedDimension[];
  previousIndex?: number | null;
  degradationDelta?: number;
}): FlourishingResult {
  const active = input.dimensions.filter((d) => d.status !== 'INACTIVE');
  const totalWeight = active.reduce((acc, d) => acc + Math.max(0, d.weight), 0);

  const dimensionScores = input.dimensions.map((d) => ({
    kind: d.kind,
    score: clamp01(d.score),
    confidence: clamp01(d.confidence),
    weight: Math.max(0, d.weight),
  }));

  let flourishingIndex = 0;
  let confidence = 0;
  if (active.length && totalWeight > 0) {
    flourishingIndex =
      active.reduce((acc, d) => acc + clamp01(d.score) * Math.max(0, d.weight), 0) / totalWeight;
    confidence =
      active.reduce((acc, d) => acc + clamp01(d.confidence) * Math.max(0, d.weight), 0) /
      totalWeight;
  } else if (active.length) {
    flourishingIndex = active.reduce((acc, d) => acc + clamp01(d.score), 0) / active.length;
    confidence = active.reduce((acc, d) => acc + clamp01(d.confidence), 0) / active.length;
  }

  flourishingIndex = clamp01(
    flourishingIndex * SCORE_WEIGHTS.SCORE +
      confidence * flourishingIndex * SCORE_WEIGHTS.CONFIDENCE,
  );
  confidence = clamp01(confidence);

  const previous = typeof input.previousIndex === 'number' ? clamp01(input.previousIndex) : null;
  const delta = previous === null ? 0 : Number((flourishingIndex - previous).toFixed(6));
  const trend = previous === null ? 'STABLE' : resolveTrend(delta);
  const risk = resolveRisk(flourishingIndex);
  const degraded = detectDegradation(delta, risk, input.degradationDelta);

  return {
    flourishingIndex,
    confidence,
    trend,
    delta,
    risk,
    degraded,
    dimensionScores,
    reason: `index=${flourishingIndex.toFixed(3)} confidence=${confidence.toFixed(3)} risk=${risk}${
      degraded ? ' degraded' : ''
    }`,
    constitutionalRef: IFC_CONSTITUTIONAL_REF.SCORE,
  };
}

// ----------------------------------------------------------------------
// Part D — capitalization signal derivation
// ----------------------------------------------------------------------

export type CapitalizationSignal = {
  kind: IFCSignalKind;
  magnitude: number;
  confidence: number;
  reason: string;
  constitutionalRef: string;
};

/**
 * Derive a capitalization signal from a flourishing result. IFC never mutates
 * D13 — it emits a signal that Intelligence Capital may consume:
 *  - GROWTH   when flourishing is rising,
 *  - DECAY    when degrading/falling,
 *  - PRESERVATION when stable and healthy,
 *  - CONTRIBUTION otherwise (net-positive but not yet compounding).
 */
export function deriveCapitalizationSignal(input: {
  flourishingIndex: number;
  confidence: number;
  trend: IFCTrend;
  degraded: boolean;
}): CapitalizationSignal {
  const index = clamp01(input.flourishingIndex);
  const confidence = clamp01(input.confidence);
  let kind: IFCSignalKind;
  if (input.degraded || input.trend === 'FALLING') {
    kind = 'DECAY';
  } else if (input.trend === 'RISING') {
    kind = 'GROWTH';
  } else if (index >= 0.75) {
    kind = 'PRESERVATION';
  } else {
    kind = 'CONTRIBUTION';
  }
  const magnitude = clamp01(index * confidence);
  return {
    kind,
    magnitude,
    confidence,
    reason: `${kind} signal at index=${index.toFixed(3)} confidence=${confidence.toFixed(3)}`,
    constitutionalRef: IFC_CONSTITUTIONAL_REF.SIGNAL,
  };
}

/**
 * An allocation signal recommends whether flourishing capital should be
 * allocated — true only when the institution is healthy and confident. This is
 * a signal only; allocation execution remains D13's responsibility.
 */
export function shouldSignalAllocation(input: {
  flourishingIndex: number;
  confidence: number;
  degraded: boolean;
}): boolean {
  return (
    !input.degraded && clamp01(input.flourishingIndex) >= 0.6 && clamp01(input.confidence) >= 0.5
  );
}

// ----------------------------------------------------------------------
// Part E — founder alignment
// ----------------------------------------------------------------------

export type AlignmentResult = {
  aligned: boolean;
  alignmentScore: number;
  founderAuthorityValid: boolean;
  issues: string[];
  intentReferenceId: string | null;
  objectiveReference: string | null;
  constitutionalRef: string;
};

/**
 * Check founder alignment: the founder-alignment dimension score, presence of
 * an intent/objective reference (FIC/USFIP/D14) and overall flourishing health
 * are combined into an alignment score. Alignment requires founder authority
 * (a linked intent or objective reference) and a non-degraded profile.
 */
export function checkAlignment(input: {
  flourishingIndex: number;
  founderAlignmentScore: number;
  degraded: boolean;
  intentReferenceId?: string | null;
  objectiveReference?: string | null;
}): AlignmentResult {
  const issues: string[] = [];
  const founderAuthorityValid = Boolean(
    input.intentReferenceId?.trim() || input.objectiveReference?.trim(),
  );
  if (!founderAuthorityValid) {
    issues.push('No founder intent or strategic objective reference is linked');
  }
  if (input.degraded) {
    issues.push('Institutional flourishing is degraded');
  }
  const alignmentScore = clamp01(
    clamp01(input.founderAlignmentScore) * 0.6 + clamp01(input.flourishingIndex) * 0.4,
  );
  const aligned = founderAuthorityValid && !input.degraded && alignmentScore >= 0.5;
  return {
    aligned,
    alignmentScore,
    founderAuthorityValid,
    issues,
    intentReferenceId: input.intentReferenceId?.trim() || null,
    objectiveReference: input.objectiveReference?.trim() || null,
    constitutionalRef: IFC_CONSTITUTIONAL_REF.ALIGNMENT,
  };
}

// ----------------------------------------------------------------------
// Part F — governance validation
// ----------------------------------------------------------------------

export type IFCValidation = {
  valid: boolean;
  issues: string[];
  constitutionalRef: string;
};

/**
 * Validate a flourishing result against a governance policy. An overridden
 * profile is immutable and cannot be recalculated; index/confidence must meet
 * policy minimums; degradation is a policy violation.
 */
export function validateGovernance(input: {
  overridden: boolean;
  flourishingIndex: number;
  confidence: number;
  degraded: boolean;
  minIndex?: number;
  minConfidence?: number;
}): IFCValidation {
  const issues: string[] = [];
  if (input.overridden) {
    issues.push('Profile is under an immutable founder override');
  }
  if (typeof input.minIndex === 'number' && clamp01(input.flourishingIndex) < input.minIndex) {
    issues.push(`Flourishing index below policy minimum (${input.minIndex})`);
  }
  if (typeof input.minConfidence === 'number' && clamp01(input.confidence) < input.minConfidence) {
    issues.push(`Confidence below policy minimum (${input.minConfidence})`);
  }
  if (input.degraded) {
    issues.push('Institutional flourishing is degraded');
  }
  return {
    valid: issues.length === 0,
    issues,
    constitutionalRef: IFC_CONSTITUTIONAL_REF.PROFILE,
  };
}

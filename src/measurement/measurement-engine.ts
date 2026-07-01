import { MeasurementProgressState, MeasurementTrend } from '@prisma/client';
import {
  MEASUREMENT_COMPLETION_THRESHOLD,
  MEASUREMENT_LOW_CONFIDENCE_THRESHOLD,
  MEASUREMENT_PLATEAU_THRESHOLD,
  MEASUREMENT_VOLATILITY_THRESHOLD,
} from './measurement.constants';

/**
 * IW-08 — D17 Measurement scoring engine.
 *
 * A deterministic, side-effect-free calculation core. It is responsible for all
 * of Part B (scoring) and the numeric portions of Part C (progress tracking):
 *  - score calculation        (raw aggregate of weighted components)
 *  - weighted calculation     (profile-level weight applied)
 *  - confidence               (component confidence aggregate)
 *  - normalization            (map a raw score onto a 0-100 scale)
 *  - delta                    (change vs. the previous normalized score)
 *  - trend                    (rising / falling / stable / volatile)
 *  - benchmark                (comparison against a benchmark value)
 *  - aggregation              (combine many normalized scores)
 *  - progress state           (growth / regression / plateau / improvement / completion)
 */

export type MeasurementComponent = {
  key: string;
  value: number;
  weight?: number;
  confidence?: number;
};

export type ScoreInputs = {
  components: MeasurementComponent[];
  profileWeight?: number;
  normalizationMin?: number;
  normalizationMax?: number;
  previousNormalizedScore?: number | null;
  recentNormalizedScores?: number[];
  targetValue?: number;
};

export type ScoreResult = {
  rawScore: number;
  weightedScore: number;
  normalizedScore: number;
  confidence: number;
  delta: number;
  trend: MeasurementTrend;
  progressState: MeasurementProgressState;
};

function round(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Raw score = weighted mean of component values. */
export function calculateRawScore(components: MeasurementComponent[]): number {
  if (!components.length) {
    return 0;
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (const component of components) {
    const weight = component.weight ?? 1;
    weightedSum += component.value * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) {
    return 0;
  }
  return round(weightedSum / weightTotal);
}

/** Confidence = weighted mean of component confidences (defaults to 1 each). */
export function calculateConfidence(components: MeasurementComponent[]): number {
  if (!components.length) {
    return 0;
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (const component of components) {
    const weight = component.weight ?? 1;
    weightedSum += (component.confidence ?? 1) * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) {
    return 0;
  }
  return round(clamp(weightedSum / weightTotal, 0, 1));
}

/** Normalize a raw score into the 0-100 band defined by [min, max]. */
export function normalizeScore(rawScore: number, min = 0, max = 100): number {
  if (max <= min) {
    return clamp(rawScore, 0, 100);
  }
  const ratio = (rawScore - min) / (max - min);
  return round(clamp(ratio * 100, 0, 100));
}

/** Trend classification from the latest delta and recent volatility. */
export function classifyTrend(
  delta: number,
  recentNormalizedScores: number[] = [],
): MeasurementTrend {
  if (recentNormalizedScores.length >= 3) {
    const deltas: number[] = [];
    for (let i = 1; i < recentNormalizedScores.length; i += 1) {
      deltas.push(recentNormalizedScores[i] - recentNormalizedScores[i - 1]);
    }
    const mean = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
    const variance = deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / deltas.length;
    const stddev = Math.sqrt(variance);
    if (stddev > MEASUREMENT_VOLATILITY_THRESHOLD) {
      return 'VOLATILE';
    }
  }
  if (Math.abs(delta) < MEASUREMENT_PLATEAU_THRESHOLD) {
    return 'STABLE';
  }
  return delta > 0 ? 'RISING' : 'FALLING';
}

/** Progress state from the delta, prior state, and absolute normalized score. */
export function classifyProgressState(
  normalizedScore: number,
  delta: number,
  previousNormalizedScore: number | null | undefined,
): MeasurementProgressState {
  if (normalizedScore >= MEASUREMENT_COMPLETION_THRESHOLD) {
    return 'COMPLETION';
  }
  if (previousNormalizedScore === null || previousNormalizedScore === undefined) {
    return 'NASCENT';
  }
  if (Math.abs(delta) < MEASUREMENT_PLATEAU_THRESHOLD) {
    return 'PLATEAU';
  }
  if (delta < 0) {
    return 'REGRESSION';
  }
  // Positive movement: distinguish early GROWTH from sustained IMPROVEMENT.
  return previousNormalizedScore < 50 ? 'GROWTH' : 'IMPROVEMENT';
}

/** Full score computation pipeline. */
export function computeScore(inputs: ScoreInputs): ScoreResult {
  const rawScore = calculateRawScore(inputs.components);
  const profileWeight = inputs.profileWeight ?? 1;
  const weightedScore = round(rawScore * profileWeight);
  const normalizedScore = normalizeScore(
    rawScore,
    inputs.normalizationMin ?? 0,
    inputs.normalizationMax ?? 100,
  );
  const confidence = calculateConfidence(inputs.components);
  const previous = inputs.previousNormalizedScore ?? null;
  const delta = previous === null ? 0 : round(normalizedScore - previous);
  const trend = classifyTrend(delta, inputs.recentNormalizedScores ?? []);
  const progressState = classifyProgressState(normalizedScore, delta, previous);

  return {
    rawScore,
    weightedScore,
    normalizedScore,
    confidence,
    delta,
    trend,
    progressState,
  };
}

/** Benchmark comparison: signed difference and whether the benchmark is met. */
export function compareBenchmark(
  normalizedScore: number,
  benchmarkValue: number,
  comparator: 'GTE' | 'LTE' | 'EQ' = 'GTE',
): { benchmarkDelta: number; met: boolean } {
  const benchmarkDelta = round(normalizedScore - benchmarkValue);
  let met: boolean;
  switch (comparator) {
    case 'LTE':
      met = normalizedScore <= benchmarkValue;
      break;
    case 'EQ':
      met = Math.abs(benchmarkDelta) < MEASUREMENT_PLATEAU_THRESHOLD;
      break;
    case 'GTE':
    default:
      met = normalizedScore >= benchmarkValue;
      break;
  }
  return { benchmarkDelta, met };
}

/** Aggregate many normalized scores into a single composite score (0-100). */
export function aggregateScores(
  entries: Array<{ normalizedScore: number; weight?: number }>,
): number {
  if (!entries.length) {
    return 0;
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (const entry of entries) {
    const weight = entry.weight ?? 1;
    weightedSum += entry.normalizedScore * weight;
    weightTotal += weight;
  }
  if (weightTotal <= 0) {
    return 0;
  }
  return round(weightedSum / weightTotal);
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < MEASUREMENT_LOW_CONFIDENCE_THRESHOLD;
}

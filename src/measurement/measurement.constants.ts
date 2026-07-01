import { MeasurementIndexType, MeasurementProgressState } from '@prisma/client';

/**
 * IW-08 — D17 Intelligence Measurement constants.
 *
 * The six canonical measurement indices plus a CUSTOM escape hatch.
 *  - UQI  Understanding Quality Index
 *  - JQI  Judgement Quality Index
 *  - WQI  Workflow Quality Index
 *  - ICI  Intelligence Capital Index
 *  - OQI  Output Quality Index
 *  - IRS  Intelligence Reliability Score
 */
export const MEASUREMENT_INDEX_TYPES: MeasurementIndexType[] = [
  'UQI',
  'JQI',
  'WQI',
  'ICI',
  'OQI',
  'IRS',
  'CUSTOM',
];

/** Human-readable labels for the canonical indices (documentation/dashboards). */
export const MEASUREMENT_INDEX_LABELS: Record<MeasurementIndexType, string> = {
  UQI: 'Understanding Quality Index',
  JQI: 'Judgement Quality Index',
  WQI: 'Workflow Quality Index',
  ICI: 'Intelligence Capital Index',
  OQI: 'Output Quality Index',
  IRS: 'Intelligence Reliability Score',
  CUSTOM: 'Custom Index',
};

export const MEASUREMENT_PROGRESS_STATES: MeasurementProgressState[] = [
  'NASCENT',
  'GROWTH',
  'IMPROVEMENT',
  'PLATEAU',
  'REGRESSION',
  'STABLE',
  'COMPLETION',
];

/** Delta threshold (normalized points) below which movement is treated as a plateau. */
export const MEASUREMENT_PLATEAU_THRESHOLD = 1;

/** Normalized score (0-100) at or above which a profile is considered complete. */
export const MEASUREMENT_COMPLETION_THRESHOLD = 99;

/** Confidence (0-1) below which a measurement is flagged as low confidence. */
export const MEASUREMENT_LOW_CONFIDENCE_THRESHOLD = 0.4;

/** Volatility (stddev of recent normalized deltas) above which the trend is VOLATILE. */
export const MEASUREMENT_VOLATILITY_THRESHOLD = 20;

export const MEASUREMENT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'indexType',
  'currentScore',
  'progressState',
] as const;

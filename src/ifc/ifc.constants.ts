import { IFCDimensionKind, IFCRiskLevel, IFCTrend } from '@prisma/client';

/**
 * IFC — Institutional Flourishing Capital constants (Wave 11).
 *
 * IFC defines how institutional flourishing is represented, measured,
 * accumulated, protected and connected to Intelligence. It is NOT a reasoning,
 * planning or decision engine, NOT Platform, NOT FIAR and NOT D20. It reuses
 * existing constitutional runtimes by reference only.
 */

/** The eight canonical institutional flourishing dimensions (Part B). */
export const FLOURISHING_DIMENSIONS: {
  kind: IFCDimensionKind;
  name: string;
  weight: number;
  constitutionalRef: string;
}[] = [
  {
    kind: 'KNOWLEDGE',
    name: 'Knowledge flourishing',
    weight: 0.125,
    constitutionalRef: 'D16:intelligence-object',
  },
  {
    kind: 'EXECUTION',
    name: 'Execution flourishing',
    weight: 0.125,
    constitutionalRef: 'D18:runtime',
  },
  {
    kind: 'GOVERNANCE',
    name: 'Governance flourishing',
    weight: 0.125,
    constitutionalRef: 'D14:meta-orchestration',
  },
  {
    kind: 'LEARNING',
    name: 'Learning flourishing',
    weight: 0.125,
    constitutionalRef: 'D12:intelligence-learning',
  },
  {
    kind: 'CAPITAL',
    name: 'Capital flourishing',
    weight: 0.125,
    constitutionalRef: 'D13:intelligence-capital',
  },
  { kind: 'TRUST', name: 'Trust flourishing', weight: 0.125, constitutionalRef: 'D19:exchange' },
  {
    kind: 'CONTINUITY',
    name: 'Continuity flourishing',
    weight: 0.125,
    constitutionalRef: 'D18:runtime-continuity',
  },
  {
    kind: 'FOUNDER_ALIGNMENT',
    name: 'Founder alignment flourishing',
    weight: 0.125,
    constitutionalRef: 'FIC:founder-intent',
  },
];

/**
 * Constitutional runtimes IFC is permitted to reuse by reference (never
 * re-implemented). Flourishing is derived from — not a replacement for — these
 * domains.
 */
export const REUSED_RUNTIMES = [
  'D13', // Intelligence Capital — capitalization link
  'D14', // Meta-Intelligence Orchestration — governance substrate
  'D16', // Intelligence Object Foundation — knowledge
  'D17', // Measurement Architecture — scoring substrate
  'D18', // Runtime Architecture — execution/continuity
  'D19', // Exchange Architecture — trust
  'FIC', // Founder Intent Compiler — alignment source
  'IUC', // Understanding Capital Runtime
  'USFIP', // Universal Strategic Founder Intelligence Protocol
] as const;

/** Constitutional reference anchors for IFC governance surfaces. */
export const IFC_CONSTITUTIONAL_REF = {
  PROFILE: 'IFC:flourishing-profile',
  DIMENSION: 'IFC:flourishing-dimension',
  INDICATOR: 'IFC:flourishing-indicator',
  SCORE: 'IFC:flourishing-score',
  SIGNAL: 'IFC:capitalization-signal',
  CAPITAL: 'D13:intelligence-capital',
  ALIGNMENT: 'FIC:founder-intent',
  FOUNDER_AUTHORITY: 'IFC:founder-authority',
} as const;

/** Weighting used to blend dimension score into the flourishing index. */
export const SCORE_WEIGHTS = {
  SCORE: 0.7,
  CONFIDENCE: 0.3,
} as const;

/** Risk thresholds keyed off the flourishing index (0..1). */
export const RISK_THRESHOLDS: { level: IFCRiskLevel; min: number }[] = [
  { level: 'LOW', min: 0.75 },
  { level: 'MODERATE', min: 0.5 },
  { level: 'ELEVATED', min: 0.3 },
  { level: 'CRITICAL', min: 0 },
];

/** Delta magnitude under which a change is considered STABLE. */
export const TREND_EPSILON = 0.02;

/** Default degradation delta — a drop steeper than this flags degradation. */
export const DEFAULT_DEGRADATION_DELTA = -0.1;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Trend enum helpers. */
export const TREND: Record<'RISING' | 'STABLE' | 'FALLING', IFCTrend> = {
  RISING: 'RISING',
  STABLE: 'STABLE',
  FALLING: 'FALLING',
};

/** Audit action namespace for IFC. */
export const IFC_ACTIONS = {
  CREATE_PROFILE: 'IFC_CREATE_PROFILE',
  UPDATE_PROFILE: 'IFC_UPDATE_PROFILE',
  CREATE_DIMENSION: 'IFC_CREATE_DIMENSION',
  UPDATE_DIMENSION: 'IFC_UPDATE_DIMENSION',
  RECORD_INDICATOR: 'IFC_RECORD_INDICATOR',
  CALCULATE_SCORE: 'IFC_CALCULATE_SCORE',
  CAPITALIZATION_SIGNAL: 'IFC_CAPITALIZATION_SIGNAL',
  ALIGNMENT_CHECK: 'IFC_ALIGNMENT_CHECK',
  CREATE_POLICY: 'IFC_CREATE_POLICY',
  OVERRIDE: 'IFC_OVERRIDE',
} as const;

import {
  AuthorityLevel,
  ExchangeOwnershipClass,
  ExchangeStage,
  ExchangeVerificationState,
} from '@prisma/client';

/**
 * IW-10 — D19 Intelligence Exchange constants.
 *
 * Canonical exchange pipeline stages (Part B).
 */
export const EXCHANGE_STAGES: ExchangeStage[] = [
  'INTEND',
  'COMPREHEND',
  'VALIDATE',
  'TRANSFER',
  'VERIFY',
  'LINEAGE',
  'MEASURE',
  'CAPITALIZE',
  'COMPLETE',
  'FAILED',
];

/**
 * The linear "happy path" of the pipeline, excluding terminal COMPLETE/FAILED.
 * `nextExchangeStage` walks this sequence.
 */
export const EXCHANGE_PIPELINE_ORDER: ExchangeStage[] = [
  'INTEND',
  'COMPREHEND',
  'VALIDATE',
  'TRANSFER',
  'VERIFY',
  'LINEAGE',
  'MEASURE',
  'CAPITALIZE',
  'COMPLETE',
];

/**
 * Validated pipeline transitions. Each active stage may advance to the next
 * canonical stage or fail. COMPLETE and FAILED are terminal.
 */
export const EXCHANGE_STAGE_TRANSITIONS: Record<ExchangeStage, ExchangeStage[]> = {
  INTEND: ['COMPREHEND', 'FAILED'],
  COMPREHEND: ['VALIDATE', 'FAILED'],
  VALIDATE: ['TRANSFER', 'FAILED'],
  TRANSFER: ['VERIFY', 'FAILED'],
  VERIFY: ['LINEAGE', 'FAILED'],
  LINEAGE: ['MEASURE', 'FAILED'],
  MEASURE: ['CAPITALIZE', 'FAILED'],
  CAPITALIZE: ['COMPLETE', 'FAILED'],
  COMPLETE: [],
  FAILED: [],
};

/** Terminal pipeline stages. */
export const EXCHANGE_TERMINAL_STAGES: ExchangeStage[] = ['COMPLETE', 'FAILED'];

/** Canonical ownership classes (Part C). */
export const EXCHANGE_OWNERSHIP_CLASSES: ExchangeOwnershipClass[] = [
  'FOUNDER',
  'WORKSPACE',
  'AGENT',
  'RUNTIME',
  'KNOWLEDGE',
  'CAPITAL',
  'SHARED',
];

/** Trust validation dimensions (Part D / Part F). */
export const EXCHANGE_VALIDATION_DIMENSIONS = [
  'ownership',
  'authority',
  'workspace',
  'schema',
  'integrity',
  'lineage',
  'trust',
  'policy',
] as const;

export type ExchangeValidationDimension = (typeof EXCHANGE_VALIDATION_DIMENSIONS)[number];

/**
 * Relative weights used to compute a composite trust score (Part D). Weights sum
 * to 1 so the resulting trust score is normalised to the [0, 1] interval.
 */
export const EXCHANGE_TRUST_WEIGHTS = {
  authority: 0.2,
  confidence: 0.25,
  verification: 0.2,
  integrity: 0.15,
  provenance: 0.1,
  traceability: 0.1,
} as const;

/** Minimum composite trust score required for a transaction to be VERIFIED. */
export const EXCHANGE_TRUST_VERIFICATION_THRESHOLD = 0.6;

/** Authority levels mapped onto a normalised trust contribution. */
export const EXCHANGE_AUTHORITY_WEIGHT: Record<AuthorityLevel, number> = {
  OPERATIONAL: 0.5,
  SYSTEM: 0.6,
  INSTITUTIONAL: 0.8,
  SOVEREIGN: 1,
};

/** Verification states mapped onto a normalised trust contribution. */
export const EXCHANGE_VERIFICATION_WEIGHT: Record<ExchangeVerificationState, number> = {
  UNVERIFIED: 0,
  PENDING: 0.5,
  VERIFIED: 1,
  REJECTED: 0,
};

export const EXCHANGE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'intent',
  'stage',
  'status',
  'trustScore',
] as const;

export function isValidExchangeTransition(from: ExchangeStage, to: ExchangeStage): boolean {
  if (from === to) {
    return false;
  }
  return (EXCHANGE_STAGE_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalExchangeStage(stage: ExchangeStage): boolean {
  return EXCHANGE_TERMINAL_STAGES.includes(stage);
}

/** The next canonical stage in the happy path, or null when at/after COMPLETE. */
export function nextExchangeStage(stage: ExchangeStage): ExchangeStage | null {
  const index = EXCHANGE_PIPELINE_ORDER.indexOf(stage);
  if (index < 0 || index >= EXCHANGE_PIPELINE_ORDER.length - 1) {
    return null;
  }
  return EXCHANGE_PIPELINE_ORDER[index + 1];
}

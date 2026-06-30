import { FeedStage, SourceCategory, SourceStatus } from '@prisma/client';

/** D11 canonical source categories. */
export const D11_SOURCE_CATEGORIES: SourceCategory[] = [
  'INTERNAL',
  'EXTERNAL',
  'PARTNER',
  'SENSOR',
  'HUMAN',
  'SYSTEM',
  'DERIVED',
];

/** D11 source lifecycle statuses. */
export const D11_SOURCE_STATUSES: SourceStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'QUARANTINED',
];

/** D11 canonical feeding pipeline stages. */
export const D11_FEED_STAGES: FeedStage[] = [
  'RECEIVED',
  'NORMALIZED',
  'VALIDATED',
  'CLASSIFIED',
  'LINKED',
  'ACCEPTED',
  'REJECTED',
  'ARCHIVED',
];

/**
 * Allowed staged-ingestion transitions. Any transition not present here is
 * rejected by the pipeline transition validator.
 */
export const FEED_STAGE_TRANSITIONS: Record<FeedStage, FeedStage[]> = {
  RECEIVED: ['NORMALIZED', 'REJECTED', 'ARCHIVED'],
  NORMALIZED: ['VALIDATED', 'REJECTED', 'ARCHIVED'],
  VALIDATED: ['CLASSIFIED', 'REJECTED', 'ARCHIVED'],
  CLASSIFIED: ['LINKED', 'REJECTED', 'ARCHIVED'],
  LINKED: ['ACCEPTED', 'REJECTED', 'ARCHIVED'],
  ACCEPTED: ['ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isValidFeedStageTransition(from: FeedStage, to: FeedStage): boolean {
  if (from === to) {
    return false;
  }
  return (FEED_STAGE_TRANSITIONS[from] ?? []).includes(to);
}

/** Configurable validation gate rules applied when a feed enters VALIDATED. */
export const FEED_VALIDATION_RULES = [
  'schema',
  'authority',
  'provenance',
  'duplication',
  'trust',
  'ownership',
] as const;

export type FeedValidationRule = (typeof FEED_VALIDATION_RULES)[number];

/**
 * Trust model weights. The composite trust score is a weighted blend of
 * confidence, source authority, provenance and verification signals.
 */
export const TRUST_WEIGHTS = {
  confidence: 0.3,
  authority: 0.2,
  provenance: 0.25,
  verification: 0.25,
} as const;

/** Normalised authority weighting used by the trust model. */
export const AUTHORITY_TRUST_WEIGHT: Record<string, number> = {
  SYSTEM: 0.4,
  OPERATIONAL: 0.6,
  INSTITUTIONAL: 0.85,
  SOVEREIGN: 1.0,
};

/** Minimum composite trust required for a feed to pass the trust gate. */
export const MIN_TRUST_THRESHOLD = 0.3;

export const SOURCE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'identity',
  'category',
  'status',
  'trustScore',
] as const;

export const FEED_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'stage',
  'shadowMode',
  'trustScore',
] as const;

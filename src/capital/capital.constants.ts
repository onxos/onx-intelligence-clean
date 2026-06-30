import { CapitalAccumulationType, IntelligenceCapitalStatus } from '@prisma/client';

/**
 * IW-07 — D13 Intelligence Capital constants.
 *
 * Canonical status lifecycle for an Intelligence Capital entity. Any transition
 * not present in {@link CAPITAL_STATUS_TRANSITIONS} is rejected by the status
 * transition validator.
 */
export const CAPITAL_STATUSES: IntelligenceCapitalStatus[] = [
  'ACTIVE',
  'PRESERVED',
  'DECAYING',
  'DEPLETED',
  'RECOVERING',
  'ARCHIVED',
];

export const CAPITAL_STATUS_TRANSITIONS: Record<
  IntelligenceCapitalStatus,
  IntelligenceCapitalStatus[]
> = {
  ACTIVE: ['PRESERVED', 'DECAYING', 'DEPLETED', 'ARCHIVED'],
  PRESERVED: ['ACTIVE', 'DECAYING', 'ARCHIVED'],
  DECAYING: ['RECOVERING', 'DEPLETED', 'PRESERVED', 'ARCHIVED'],
  DEPLETED: ['RECOVERING', 'ARCHIVED'],
  RECOVERING: ['ACTIVE', 'DECAYING', 'ARCHIVED'],
  ARCHIVED: [],
};

export function isValidCapitalStatusTransition(
  from: IntelligenceCapitalStatus,
  to: IntelligenceCapitalStatus,
): boolean {
  if (from === to) {
    return false;
  }
  return (CAPITAL_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** Accumulation event types that increase capital value. */
export const CAPITAL_INCREASE_EVENTS: CapitalAccumulationType[] = [
  'CREATION',
  'GROWTH',
  'COMPOUNDING',
  'RECOVERY',
  'ROLLBACK',
];

/** Accumulation event types that decrease capital value. */
export const CAPITAL_DECREASE_EVENTS: CapitalAccumulationType[] = [
  'REDUCTION',
  'DECAY',
  'ALLOCATION',
];

export const CAPITAL_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'identity',
  'currentValue',
  'accumulatedValue',
  'status',
  'category',
] as const;

/** Default ceiling on the fraction of current value that a single allocation may draw. */
export const DEFAULT_MAX_ALLOCATION_RATIO = 0.8;

/** Authority levels permitted to perform a constitutional founder override. */
export const FOUNDER_OVERRIDE_AUTHORITIES = ['SOVEREIGN', 'FOUNDER', 'INSTITUTIONAL'] as const;

export const CAPITAL_AUTHORITY_RANK: Record<string, number> = {
  SYSTEM: 0,
  OPERATIONAL: 1,
  INSTITUTIONAL: 2,
  SOVEREIGN: 3,
};

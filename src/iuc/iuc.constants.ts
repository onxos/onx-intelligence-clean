import { UnderstandingStateType } from '@prisma/client';

/**
 * IW-07 — IUC (Intelligence Understanding Capital) runtime constants.
 *
 * Canonical understanding-state maturity ladder.
 */
export const UNDERSTANDING_STATES: UnderstandingStateType[] = [
  'NASCENT',
  'FORMING',
  'DEVELOPING',
  'ESTABLISHED',
  'INSTITUTIONALIZED',
  'EVOLVING',
  'DEPRECATED',
];

/**
 * Allowed understanding-state transitions. Understanding may advance through
 * maturity, branch into EVOLVING for refinement, and ultimately be DEPRECATED.
 */
export const UNDERSTANDING_STATE_TRANSITIONS: Record<
  UnderstandingStateType,
  UnderstandingStateType[]
> = {
  NASCENT: ['FORMING', 'DEPRECATED'],
  FORMING: ['DEVELOPING', 'NASCENT', 'DEPRECATED'],
  DEVELOPING: ['ESTABLISHED', 'FORMING', 'EVOLVING', 'DEPRECATED'],
  ESTABLISHED: ['INSTITUTIONALIZED', 'EVOLVING', 'DEPRECATED'],
  INSTITUTIONALIZED: ['EVOLVING', 'DEPRECATED'],
  EVOLVING: ['ESTABLISHED', 'INSTITUTIONALIZED', 'DEVELOPING', 'DEPRECATED'],
  DEPRECATED: [],
};

export function isValidUnderstandingTransition(
  from: UnderstandingStateType,
  to: UnderstandingStateType,
): boolean {
  if (from === to) {
    return false;
  }
  return (UNDERSTANDING_STATE_TRANSITIONS[from] ?? []).includes(to);
}

/** Minimum progress (0-1) required before an understanding may be ESTABLISHED. */
export const UNDERSTANDING_ESTABLISHED_MIN_PROGRESS = 0.6;

/** Minimum progress (0-1) required before an understanding may be INSTITUTIONALIZED. */
export const UNDERSTANDING_INSTITUTIONALIZED_MIN_PROGRESS = 0.85;

export const IUC_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'state',
  'progress',
  'confidence',
] as const;

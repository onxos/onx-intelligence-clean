import { LearningStateType, PatternType } from '@prisma/client';

/** D12 canonical learning states. */
export const D12_LEARNING_STATES: LearningStateType[] = [
  'OBSERVED',
  'UNDERSTOOD',
  'VERIFIED',
  'GENERALIZED',
  'CONNECTED',
  'REUSABLE',
  'CAPITALIZED',
  'EVOLVING',
  'DEPRECATED',
];

/**
 * Allowed learning-state transitions. Any transition not present here is
 * rejected by the learning transition validator.
 */
export const LEARNING_TRANSITIONS: Record<LearningStateType, LearningStateType[]> = {
  OBSERVED: ['UNDERSTOOD', 'DEPRECATED'],
  UNDERSTOOD: ['VERIFIED', 'OBSERVED', 'DEPRECATED'],
  VERIFIED: ['GENERALIZED', 'UNDERSTOOD', 'DEPRECATED'],
  GENERALIZED: ['CONNECTED', 'VERIFIED', 'DEPRECATED'],
  CONNECTED: ['REUSABLE', 'GENERALIZED', 'DEPRECATED'],
  REUSABLE: ['CAPITALIZED', 'EVOLVING', 'DEPRECATED'],
  CAPITALIZED: ['EVOLVING', 'DEPRECATED'],
  EVOLVING: ['REUSABLE', 'VERIFIED', 'DEPRECATED'],
  DEPRECATED: [],
};

export function isValidLearningTransition(from: LearningStateType, to: LearningStateType): boolean {
  if (from === to) {
    return false;
  }
  return (LEARNING_TRANSITIONS[from] ?? []).includes(to);
}

/** D12 pattern engine supported pattern types. */
export const D12_PATTERN_TYPES: PatternType[] = [
  'SIMILARITY',
  'CLUSTERING',
  'REPETITION',
  'CONTRADICTION',
  'REINFORCEMENT',
];

/**
 * Conditions under which a learning unit becomes eligible for capitalization.
 * A capitalization event is generated automatically when all are satisfied.
 */
export const CAPITALIZATION_CONDITIONS = {
  eligibleStates: ['REUSABLE', 'CAPITALIZED'] as LearningStateType[],
  minConfidence: 0.8,
  minReinforcement: 3,
};

export function meetsCapitalizationConditions(input: {
  state: LearningStateType;
  confidence: number;
  reinforcementCount: number;
}): boolean {
  return (
    CAPITALIZATION_CONDITIONS.eligibleStates.includes(input.state) &&
    input.confidence >= CAPITALIZATION_CONDITIONS.minConfidence &&
    input.reinforcementCount >= CAPITALIZATION_CONDITIONS.minReinforcement
  );
}

export const LEARNING_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'state',
  'confidence',
  'reinforcementCount',
] as const;

export const PATTERN_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'patternType',
  'strength',
  'occurrences',
] as const;

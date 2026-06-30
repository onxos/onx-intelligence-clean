import {
  FounderIntentConflictSeverity,
  FounderIntentLifecycle,
  FounderIntentRelationType,
  FounderIntentVersionType,
} from '@prisma/client';

/** FIC v0.2 canonical lifecycle states (ordered). */
export const FIC_LIFECYCLE_STATES: FounderIntentLifecycle[] = [
  'DRAFT',
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'ACTIVE',
  'SUPERSEDED',
  'DEPRECATED',
  'ARCHIVED',
];

/**
 * Allowed lifecycle transitions. Any transition not present here is rejected by
 * the lifecycle transition validator. Founder authority moves an intent forward
 * through review/approval and may retire or supersede it at defined points.
 */
export const FIC_LIFECYCLE_TRANSITIONS: Record<FounderIntentLifecycle, FounderIntentLifecycle[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['REVIEWED', 'DRAFT', 'ARCHIVED'],
  REVIEWED: ['APPROVED', 'DRAFT', 'ARCHIVED'],
  APPROVED: ['ACTIVE', 'DEPRECATED', 'ARCHIVED'],
  ACTIVE: ['SUPERSEDED', 'DEPRECATED', 'ARCHIVED'],
  SUPERSEDED: ['DEPRECATED', 'ARCHIVED'],
  DEPRECATED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isValidLifecycleTransition(
  from: FounderIntentLifecycle,
  to: FounderIntentLifecycle,
): boolean {
  if (from === to) {
    return false;
  }
  return (FIC_LIFECYCLE_TRANSITIONS[from] ?? []).includes(to);
}

/** FIC v0.2 supported relationship-graph edge types. */
export const FIC_RELATION_TYPES: FounderIntentRelationType[] = [
  'DEPENDS_ON',
  'BLOCKS',
  'SUPPORTS',
  'REFINES',
  'REPLACES',
  'INHERITS',
  'IMPLEMENTS',
  'GOVERNS',
];

/** Relationship edge types that participate in dependency-cycle detection. */
export const FIC_DEPENDENCY_RELATION_TYPES: FounderIntentRelationType[] = [
  'DEPENDS_ON',
  'BLOCKS',
  'INHERITS',
];

/** Version bump kinds (semantic-style major.minor.revision). */
export const FIC_VERSION_TYPES: FounderIntentVersionType[] = ['MAJOR', 'MINOR', 'REVISION'];

/** Conflict severity ordering for sorting and escalation. */
export const FIC_CONFLICT_SEVERITY_ORDER: Record<FounderIntentConflictSeverity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const FIC_INTENT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'lifecycle',
  'priority',
  'version',
] as const;

export const FIC_CONFLICT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'severity',
  'status',
  'conflictType',
] as const;

/**
 * Priority ranking used to detect priority conflicts between intents that share
 * an overlapping affected domain. Lower number = higher priority.
 */
export const FIC_PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Constitutional authority ranking. Higher number = greater authority. Used to
 * surface authority conflicts when a lower-authority intent attempts to govern
 * or replace a higher-authority intent.
 */
export const FIC_AUTHORITY_RANK: Record<string, number> = {
  SYSTEM: 0,
  OPERATIONAL: 1,
  INSTITUTIONAL: 2,
  SOVEREIGN: 3,
  FOUNDER: 4,
};

export function authorityRank(authority: string | null | undefined): number {
  if (!authority) {
    return -1;
  }
  return FIC_AUTHORITY_RANK[authority.trim().toUpperCase()] ?? -1;
}

import {
  AuthorityLevel,
  IntelligenceLifecycleState,
  IntelligenceObjectType,
  IntelligenceRelationshipType,
  ProvenanceVerificationStatus,
} from '@prisma/client';

/**
 * D16 canonical Intelligence Object types.
 * The Prisma `IntelligenceObjectType` enum also retains the legacy DIKW types
 * (SIGNAL/PATTERN/...); the D16 foundation operates on this canonical set.
 */
export const D16_OBJECT_TYPES: IntelligenceObjectType[] = [
  'INTENT',
  'KNOWLEDGE',
  'EVIDENCE',
  'SOURCE',
  'MODEL',
  'TOOL',
  'AGENT',
  'EVALUATION',
  'MEMORY',
  'DECISION',
  'MEASUREMENT',
  'CAPITAL',
];

/** D16 canonical lifecycle states. */
export const D16_LIFECYCLE_STATES: IntelligenceLifecycleState[] = [
  'DRAFT',
  'INGESTED',
  'VALIDATED',
  'ACTIVE',
  'LINKED',
  'MEASURED',
  'CAPITALIZED',
  'DEPRECATED',
  'ARCHIVED',
];

/** D16 canonical relationship types. */
export const D16_RELATIONSHIP_TYPES: IntelligenceRelationshipType[] = [
  'DERIVES_FROM',
  'SUPPORTS',
  'CONTRADICTS',
  'REFINES',
  'REPLACES',
  'DEPENDS_ON',
  'MEASURES',
  'GOVERNS',
  'CAPITALIZES',
  'BELONGS_TO',
];

/** D16 canonical provenance dimensions. */
export const D16_PROVENANCE_DIMENSIONS = [
  'sourceIdentity',
  'origin',
  'creator',
  'extractionMethod',
  'verificationStatus',
  'confidence',
  'recordedAt',
  'authorityLevel',
] as const;

export const AUTHORITY_LEVELS: AuthorityLevel[] = [
  'SYSTEM',
  'OPERATIONAL',
  'INSTITUTIONAL',
  'SOVEREIGN',
];

export const PROVENANCE_VERIFICATION_STATUSES: ProvenanceVerificationStatus[] = [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
];

/**
 * Allowed lifecycle transitions per D16. Any transition not present here is
 * rejected by the lifecycle transition validator.
 */
export const LIFECYCLE_TRANSITIONS: Record<
  IntelligenceLifecycleState,
  IntelligenceLifecycleState[]
> = {
  DRAFT: ['INGESTED', 'ARCHIVED'],
  INGESTED: ['VALIDATED', 'DRAFT', 'ARCHIVED'],
  VALIDATED: ['ACTIVE', 'INGESTED', 'ARCHIVED'],
  ACTIVE: ['LINKED', 'MEASURED', 'DEPRECATED', 'ARCHIVED'],
  LINKED: ['MEASURED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'],
  MEASURED: ['CAPITALIZED', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'],
  CAPITALIZED: ['ACTIVE', 'DEPRECATED', 'ARCHIVED'],
  DEPRECATED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function isValidLifecycleTransition(
  from: IntelligenceLifecycleState,
  to: IntelligenceLifecycleState,
): boolean {
  if (from === to) {
    return false;
  }
  return (LIFECYCLE_TRANSITIONS[from] ?? []).includes(to);
}

export const SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'objectType',
  'lifecycleState',
  'trustScore',
] as const;

/**
 * IW-31 — Continuity constants (HC-04 append-only + HC-03 evidence tiers).
 */

/** Protected intelligence object types that continuity guards. */
export const PROTECTED_OBJECT_TYPES = [
  'understanding',
  'judgment',
  'intent',
  'constraint',
  'evidence',
  'iurg',
] as const;
export type ProtectedObjectType = (typeof PROTECTED_OBJECT_TYPES)[number];

/** Append-only operations that are allowed. */
export const ALLOWED_OPERATIONS = ['CREATE', 'REVISE', 'SUPERSEDE', 'DEPRECATE'] as const;

/** Destructive operations that are forbidden (blocked + logged). */
export const FORBIDDEN_OPERATIONS = ['UPDATE', 'DELETE', 'OVERWRITE'] as const;

export type ContinuityOp =
  | 'CREATE'
  | 'REVISE'
  | 'SUPERSEDE'
  | 'DEPRECATE'
  | 'UPDATE'
  | 'DELETE'
  | 'OVERWRITE';

export function normalizeOperation(op: string): ContinuityOp {
  return op.trim().toUpperCase() as ContinuityOp;
}

export function isForbidden(op: ContinuityOp): boolean {
  return (FORBIDDEN_OPERATIONS as readonly string[]).includes(op);
}

export function isAllowed(op: ContinuityOp): boolean {
  return (ALLOWED_OPERATIONS as readonly string[]).includes(op);
}

// ---------------------------------------------------------------------------
// HC-03 — evidence tiers
// ---------------------------------------------------------------------------

export const EVIDENCE_TIERS = ['unverified', 'speculative', 'probable', 'proven'] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const TIER_RANK: Record<string, number> = {
  unverified: 0,
  speculative: 1,
  probable: 2,
  proven: 3,
};

/** The DG gate / authority required to *reach* each tier (HC-03). */
export const TIER_REQUIRED_AUTHORITY: Record<string, string> = {
  unverified: 'system',
  speculative: 'system',
  probable: 'DG-09',
  proven: 'DG-10',
};

/** Authority ranking for tier upgrades. Higher clears more tiers. */
export const AUTHORITY_RANK: Record<string, number> = {
  system: 0,
  'DG-09': 2,
  ops: 2,
  'operations-manager': 2,
  'DG-10': 3,
  founder: 3,
};

export function authorityRank(authority: string | undefined): number {
  if (!authority) {
    return 0;
  }
  return AUTHORITY_RANK[authority.trim().toLowerCase()] ?? AUTHORITY_RANK[authority.trim()] ?? 0;
}

export function tierRank(tier: string | undefined): number {
  if (!tier) {
    return -1;
  }
  return TIER_RANK[tier.trim().toLowerCase()] ?? -1;
}

/** DG required to reach a target tier (for audit relatedDg). */
export function dgForTier(tier: string): string | null {
  const req = TIER_REQUIRED_AUTHORITY[tier.trim().toLowerCase()];
  return req && req.startsWith('DG-') ? req : null;
}

export interface TierChangeDecision {
  isChange: boolean;
  isUpgrade: boolean;
  isDowngrade: boolean;
  allowed: boolean;
  requiredAuthority: string | null;
  reason: string;
}

/**
 * HC-03: a tier upgrade (e.g. speculative -> proven) requires the correct
 * approver authority; a downgrade is always allowed (safe, logged as a revise).
 */
export function evaluateTierChange(
  tierFrom: string | undefined,
  tierTo: string | undefined,
  approverAuthority: string | undefined,
): TierChangeDecision {
  if (!tierTo || tierRank(tierFrom) === tierRank(tierTo)) {
    return {
      isChange: false,
      isUpgrade: false,
      isDowngrade: false,
      allowed: true,
      requiredAuthority: null,
      reason: 'no tier change',
    };
  }
  const upgrade = tierRank(tierTo) > tierRank(tierFrom);
  if (!upgrade) {
    return {
      isChange: true,
      isUpgrade: false,
      isDowngrade: true,
      allowed: true,
      requiredAuthority: null,
      reason: 'downgrade always allowed (never deleted)',
    };
  }
  const required = TIER_REQUIRED_AUTHORITY[tierTo.trim().toLowerCase()] ?? 'system';
  const allowed = authorityRank(approverAuthority) >= authorityRank(required);
  return {
    isChange: true,
    isUpgrade: true,
    isDowngrade: false,
    allowed,
    requiredAuthority: required,
    reason: allowed
      ? `tier upgrade to ${tierTo} authorised by ${approverAuthority}`
      : `tier upgrade to ${tierTo} requires ${required} authority`,
  };
}

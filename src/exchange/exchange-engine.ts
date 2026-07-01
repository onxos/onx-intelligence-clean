import { createHash } from 'crypto';
import {
  AuthorityLevel,
  ExchangeAuditOutcome,
  ExchangeOwnershipClass,
  ExchangeStage,
  ExchangeVerificationState,
} from '@prisma/client';
import {
  EXCHANGE_AUTHORITY_WEIGHT,
  EXCHANGE_OWNERSHIP_CLASSES,
  EXCHANGE_TRUST_VERIFICATION_THRESHOLD,
  EXCHANGE_TRUST_WEIGHTS,
  EXCHANGE_VALIDATION_DIMENSIONS,
  EXCHANGE_VERIFICATION_WEIGHT,
  isValidExchangeTransition,
  nextExchangeStage,
  type ExchangeValidationDimension,
} from './exchange.constants';

/**
 * IW-10 — D19 Intelligence Exchange engine.
 *
 * A deterministic, side-effect-free core owning:
 *  - pipeline transition validation      (Part B)
 *  - ownership resolution                 (Part C)
 *  - trust scoring                        (Part D)
 *  - lineage derivation                   (Part E)
 *  - the validation engine                (Part F)
 *  - envelope integrity (checksum)        (Part A / integrity)
 */

/** Assert a pipeline transition, throwing a descriptive error if invalid. */
export function assertExchangeTransition(from: ExchangeStage, to: ExchangeStage): void {
  if (!isValidExchangeTransition(from, to)) {
    throw new Error(`Invalid exchange stage transition ${from} -> ${to}`);
  }
}

export type TrustInputs = {
  authority: AuthorityLevel;
  confidence: number;
  verification: ExchangeVerificationState;
  integrityVerified: boolean;
  hasProvenance: boolean;
  traceable: boolean;
};

/** Clamp a value into the [0, 1] interval. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Compute a normalised composite trust score in [0, 1] from the trust dimensions
 * (Part D). Each dimension contributes according to EXCHANGE_TRUST_WEIGHTS.
 */
export function computeTrustScore(inputs: TrustInputs): number {
  const authority = EXCHANGE_AUTHORITY_WEIGHT[inputs.authority] ?? 0;
  const confidence = clamp01(inputs.confidence);
  const verification = EXCHANGE_VERIFICATION_WEIGHT[inputs.verification] ?? 0;
  const integrity = inputs.integrityVerified ? 1 : 0;
  const provenance = inputs.hasProvenance ? 1 : 0;
  const traceability = inputs.traceable ? 1 : 0;

  const score =
    authority * EXCHANGE_TRUST_WEIGHTS.authority +
    confidence * EXCHANGE_TRUST_WEIGHTS.confidence +
    verification * EXCHANGE_TRUST_WEIGHTS.verification +
    integrity * EXCHANGE_TRUST_WEIGHTS.integrity +
    provenance * EXCHANGE_TRUST_WEIGHTS.provenance +
    traceability * EXCHANGE_TRUST_WEIGHTS.traceability;

  return Math.round(clamp01(score) * 1e4) / 1e4;
}

/** Whether a computed trust score is sufficient to consider a transaction verified. */
export function meetsTrustThreshold(trustScore: number): boolean {
  return trustScore >= EXCHANGE_TRUST_VERIFICATION_THRESHOLD;
}

/**
 * Resolve the verification state implied by an integrity check and trust score.
 * A failed integrity check rejects; otherwise the trust threshold gates.
 */
export function resolveVerificationState(
  integrityVerified: boolean,
  trustScore: number,
): ExchangeVerificationState {
  if (!integrityVerified) {
    return 'REJECTED';
  }
  return meetsTrustThreshold(trustScore) ? 'VERIFIED' : 'PENDING';
}

/** Deterministic integrity checksum over an envelope payload (Part A). */
export function computeChecksum(payload: unknown): string {
  const canonical = JSON.stringify(payload ?? {});
  return createHash('sha256').update(canonical).digest('hex');
}

/** Verify a payload against a previously computed checksum. */
export function verifyChecksum(payload: unknown, checksum: string): boolean {
  return computeChecksum(payload) === checksum;
}

export type OwnershipInputs = {
  requested?: ExchangeOwnershipClass | null;
  hasFounderAuthority?: boolean;
};

/**
 * Resolve the effective ownership class (Part C). A requested class is honoured
 * when valid; FOUNDER ownership requires constitutional/founder authority and
 * otherwise falls back to WORKSPACE.
 */
export function resolveOwnershipClass(inputs: OwnershipInputs): ExchangeOwnershipClass {
  const requested = inputs.requested ?? 'WORKSPACE';
  if (!EXCHANGE_OWNERSHIP_CLASSES.includes(requested)) {
    return 'WORKSPACE';
  }
  if (requested === 'FOUNDER' && !inputs.hasFounderAuthority) {
    return 'WORKSPACE';
  }
  return requested;
}

export type LineageInputs = {
  origin?: string | null;
  destination?: string | null;
  parentTransactionId?: string | null;
  parentDepth?: number | null;
  sourceObjectId?: string | null;
  sourceObjectType?: string | null;
  targetObjectId?: string | null;
  targetObjectType?: string | null;
  executionChain?: string[] | null;
};

export type LineageResult = {
  origin: string | null;
  destination: string | null;
  parentTransactionId: string | null;
  depth: number;
  executionChain: string[];
};

/**
 * Derive a lineage record for a transaction (Part E). The execution chain is
 * extended from the parent's chain and the depth increments along the lineage.
 */
export function deriveLineage(inputs: LineageInputs, selfId: string): LineageResult {
  const parentChain = Array.isArray(inputs.executionChain) ? inputs.executionChain : [];
  const executionChain = [...parentChain, selfId];
  return {
    origin: inputs.origin ?? null,
    destination: inputs.destination ?? null,
    parentTransactionId: inputs.parentTransactionId ?? null,
    depth: inputs.parentTransactionId ? (inputs.parentDepth ?? 0) + 1 : 0,
    executionChain,
  };
}

export type ValidationInputs = {
  ownershipClass: ExchangeOwnershipClass;
  authority: AuthorityLevel;
  actorWorkspaceId: string;
  transactionWorkspaceId: string;
  hasPayload: boolean;
  integrityVerified: boolean;
  hasLineage: boolean;
  trustScore: number;
  founderRequiresAuthority?: boolean;
  policyViolations?: string[];
};

export type ValidationCheck = {
  dimension: ExchangeValidationDimension;
  outcome: ExchangeAuditOutcome;
  detail: string;
  score?: number;
};

export type ValidationResult = {
  passed: boolean;
  checks: ValidationCheck[];
};

/**
 * The constitutional validation engine (Part F). Evaluates every validation
 * dimension and returns a per-dimension outcome plus an overall verdict. Any
 * FAIL fails the transaction; WARN is non-blocking.
 */
export function validateExchange(inputs: ValidationInputs): ValidationResult {
  const checks: ValidationCheck[] = [];

  // ownership
  checks.push(
    EXCHANGE_OWNERSHIP_CLASSES.includes(inputs.ownershipClass)
      ? { dimension: 'ownership', outcome: 'PASS', detail: `Ownership ${inputs.ownershipClass}` }
      : { dimension: 'ownership', outcome: 'FAIL', detail: 'Unknown ownership class' },
  );

  // authority — FOUNDER ownership demands elevated authority
  const founderOk =
    inputs.ownershipClass !== 'FOUNDER' ||
    inputs.authority === 'SOVEREIGN' ||
    inputs.authority === 'INSTITUTIONAL';
  checks.push(
    founderOk
      ? { dimension: 'authority', outcome: 'PASS', detail: `Authority ${inputs.authority}` }
      : {
          dimension: 'authority',
          outcome: 'FAIL',
          detail: 'Founder ownership requires institutional/sovereign authority',
        },
  );

  // workspace isolation
  checks.push(
    inputs.actorWorkspaceId === inputs.transactionWorkspaceId
      ? { dimension: 'workspace', outcome: 'PASS', detail: 'Workspace scope matches' }
      : { dimension: 'workspace', outcome: 'FAIL', detail: 'Cross-workspace exchange denied' },
  );

  // schema / payload presence
  checks.push(
    inputs.hasPayload
      ? { dimension: 'schema', outcome: 'PASS', detail: 'Payload present' }
      : { dimension: 'schema', outcome: 'FAIL', detail: 'Missing exchange payload' },
  );

  // integrity
  checks.push(
    inputs.integrityVerified
      ? { dimension: 'integrity', outcome: 'PASS', detail: 'Integrity checksum verified' }
      : { dimension: 'integrity', outcome: 'FAIL', detail: 'Integrity checksum mismatch' },
  );

  // lineage
  checks.push(
    inputs.hasLineage
      ? { dimension: 'lineage', outcome: 'PASS', detail: 'Lineage recorded' }
      : { dimension: 'lineage', outcome: 'WARN', detail: 'Lineage not yet recorded' },
  );

  // trust
  checks.push(
    meetsTrustThreshold(inputs.trustScore)
      ? {
          dimension: 'trust',
          outcome: 'PASS',
          detail: 'Trust threshold met',
          score: inputs.trustScore,
        }
      : {
          dimension: 'trust',
          outcome: 'WARN',
          detail: 'Trust below verification threshold',
          score: inputs.trustScore,
        },
  );

  // constitutional policy
  const violations = inputs.policyViolations ?? [];
  checks.push(
    violations.length === 0
      ? { dimension: 'policy', outcome: 'PASS', detail: 'No policy violations' }
      : {
          dimension: 'policy',
          outcome: 'FAIL',
          detail: `Policy violations: ${violations.join(', ')}`,
        },
  );

  const passed = checks.every((check) => check.outcome !== 'FAIL');
  return { passed, checks };
}

/** Convenience: does a completed validation cover every canonical dimension. */
export function coversAllDimensions(checks: ValidationCheck[]): boolean {
  return EXCHANGE_VALIDATION_DIMENSIONS.every((dimension) =>
    checks.some((check) => check.dimension === dimension),
  );
}

export { nextExchangeStage };

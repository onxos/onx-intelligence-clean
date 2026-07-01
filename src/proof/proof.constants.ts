import {
  CertificationGate,
  CertificationOutcome,
  ContradictionType,
  FailureInjectionType,
  ProofScenarioGroup,
} from '@prisma/client';

/**
 * IW-11 — D15 Proof & Stress constants.
 *
 * The constitutional verification and resilience layer. These constants define
 * the canonical certification gates (Part C), failure injections (Part D),
 * contradiction types (Part E), and stress scenario groups (Part F).
 */

/** The ten constitutional certification gates (Part C). */
export const CERTIFICATION_GATES: CertificationGate[] = [
  'KNOWLEDGE_INTEGRITY',
  'MEMORY_INTEGRITY',
  'RUNTIME_INTEGRITY',
  'EXCHANGE_INTEGRITY',
  'CAPITAL_INTEGRITY',
  'MEASUREMENT_INTEGRITY',
  'GOVERNANCE_INTEGRITY',
  'AUDIT_INTEGRITY',
  'EVIDENCE_INTEGRITY',
  'SECURITY_INTEGRITY',
];

/** Certification outcomes, ordered best → worst (Part G). */
export const CERTIFICATION_OUTCOMES: CertificationOutcome[] = [
  'PASS',
  'WARNING',
  'FAIL',
  'CRITICAL',
];

/** Ordinal rank of each outcome; higher = more severe. */
export const OUTCOME_RANK: Record<CertificationOutcome, number> = {
  PASS: 0,
  WARNING: 1,
  FAIL: 2,
  CRITICAL: 3,
};

/** The ten controlled failure injections (Part D). */
export const FAILURE_INJECTION_TYPES: FailureInjectionType[] = [
  'MISSING_KNOWLEDGE',
  'CORRUPTED_MEMORY',
  'INVALID_EXCHANGE',
  'AUTHORITY_VIOLATION',
  'TRUST_FAILURE',
  'EVIDENCE_LOSS',
  'RUNTIME_INTERRUPTION',
  'RECOVERY_FAILURE',
  'STATE_CORRUPTION',
  'MEASUREMENT_INCONSISTENCY',
];

/** The six contradiction types the contradiction engine detects (Part E). */
export const CONTRADICTION_TYPES: ContradictionType[] = [
  'KNOWLEDGE',
  'INTENT',
  'CAPITAL',
  'MEASUREMENT',
  'RUNTIME',
  'GOVERNANCE',
];

/** The nine stress scenario groups (Part F). */
export const STRESS_SCENARIO_GROUPS: ProofScenarioGroup[] = [
  'KNOWLEDGE',
  'LEARNING',
  'RUNTIME',
  'EXCHANGE',
  'CAPITAL',
  'MEASUREMENT',
  'GOVERNANCE',
  'SECURITY',
  'RECOVERY',
];

/**
 * Which certification gate each failure-injection type most directly stresses.
 * Used to attribute an injection's outcome back to a constitutional gate.
 */
export const INJECTION_GATE_MAP: Record<FailureInjectionType, CertificationGate> = {
  MISSING_KNOWLEDGE: 'KNOWLEDGE_INTEGRITY',
  CORRUPTED_MEMORY: 'MEMORY_INTEGRITY',
  INVALID_EXCHANGE: 'EXCHANGE_INTEGRITY',
  AUTHORITY_VIOLATION: 'GOVERNANCE_INTEGRITY',
  TRUST_FAILURE: 'SECURITY_INTEGRITY',
  EVIDENCE_LOSS: 'EVIDENCE_INTEGRITY',
  RUNTIME_INTERRUPTION: 'RUNTIME_INTEGRITY',
  RECOVERY_FAILURE: 'RUNTIME_INTEGRITY',
  STATE_CORRUPTION: 'RUNTIME_INTEGRITY',
  MEASUREMENT_INCONSISTENCY: 'MEASUREMENT_INTEGRITY',
};

/** Constitutional references cited by gate for findings and certifications. */
export const GATE_CONSTITUTIONAL_REFS: Record<CertificationGate, string[]> = {
  KNOWLEDGE_INTEGRITY: ['D11', 'D12', 'D16'],
  MEMORY_INTEGRITY: ['MemoryGovernance'],
  RUNTIME_INTEGRITY: ['D18'],
  EXCHANGE_INTEGRITY: ['D19'],
  CAPITAL_INTEGRITY: ['D13', 'D13.5', 'IUC'],
  MEASUREMENT_INTEGRITY: ['D17'],
  GOVERNANCE_INTEGRITY: ['FIC', 'Governance'],
  AUDIT_INTEGRITY: ['AuditTrail'],
  EVIDENCE_INTEGRITY: ['EvidenceService'],
  SECURITY_INTEGRITY: ['Sovereignty', 'Security'],
};

/** Constitutional references cited by contradiction type. */
export const CONTRADICTION_CONSTITUTIONAL_REFS: Record<ContradictionType, string[]> = {
  KNOWLEDGE: ['D11', 'D12', 'D16'],
  INTENT: ['FIC'],
  CAPITAL: ['D13', 'IUC'],
  MEASUREMENT: ['D17'],
  RUNTIME: ['D18'],
  GOVERNANCE: ['Governance', 'FIC'],
};

/**
 * Thresholds that translate an observed violation count into an outcome for a
 * gate. Absent observations pass (nothing to disprove).
 */
export const GATE_WARNING_THRESHOLD = 1;
export const GATE_FAIL_THRESHOLD = 3;
export const GATE_CRITICAL_THRESHOLD = 6;

/** Minimum aggregate certification score required to certify a proof session. */
export const CERTIFICATION_PASS_SCORE = 0.7;

/** Minimum resilience score required for a stress campaign to be resilient. */
export const RESILIENCE_PASS_SCORE = 0.7;

export const PROOF_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'state'] as const;
export const STRESS_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'state'] as const;

/** Map a certification outcome to a proof finding severity. */
export function severityForOutcome(
  outcome: CertificationOutcome,
): 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  switch (outcome) {
    case 'PASS':
      return 'INFO';
    case 'WARNING':
      return 'MEDIUM';
    case 'FAIL':
      return 'HIGH';
    case 'CRITICAL':
      return 'CRITICAL';
    default:
      return 'INFO';
  }
}

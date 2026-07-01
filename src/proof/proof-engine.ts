import {
  CertificationGate,
  CertificationOutcome,
  ContradictionSeverity,
  ContradictionType,
  FailureInjectionStatus,
  FailureInjectionType,
} from '@prisma/client';
import {
  CERTIFICATION_GATES,
  CERTIFICATION_PASS_SCORE,
  CONTRADICTION_CONSTITUTIONAL_REFS,
  GATE_CONSTITUTIONAL_REFS,
  GATE_CRITICAL_THRESHOLD,
  GATE_FAIL_THRESHOLD,
  GATE_WARNING_THRESHOLD,
  INJECTION_GATE_MAP,
  OUTCOME_RANK,
  RESILIENCE_PASS_SCORE,
} from './proof.constants';

/**
 * IW-11 — D15 Proof & Stress engine.
 *
 * A deterministic, side-effect-free core owning:
 *  - certification gate evaluation        (Part C)
 *  - certification aggregation            (Part G)
 *  - controlled failure injection outcome (Part D)
 *  - resilience scoring                   (Part B)
 *  - contradiction detection              (Part E)
 */

/** Clamp a value into the [0, 1] interval. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Observed signals fed to the certification gates. Each gate reads the number
 * of items it governs plus the number of detected violations. Absent numbers
 * mean "no observations" and therefore nothing to disprove.
 */
export type GateSignals = {
  knowledgeObjects?: number;
  knowledgeViolations?: number;
  memoryEntries?: number;
  memoryViolations?: number;
  runtimeSessions?: number;
  runtimeViolations?: number;
  exchangeTransactions?: number;
  exchangeViolations?: number;
  capitalAllocations?: number;
  capitalViolations?: number;
  measurements?: number;
  measurementViolations?: number;
  governancePolicies?: number;
  governanceViolations?: number;
  auditRecords?: number;
  auditViolations?: number;
  evidenceRecords?: number;
  evidenceViolations?: number;
  securityControls?: number;
  securityViolations?: number;
};

export type GateResult = {
  gate: CertificationGate;
  outcome: CertificationOutcome;
  score: number;
  observed: number;
  violations: number;
  detail: string;
  constitutionalRefs: string[];
};

/** Translate an observed/violation pair into an outcome + normalised score. */
function outcomeForViolations(
  observed: number,
  violations: number,
): { outcome: CertificationOutcome; score: number } {
  const safeObserved = Math.max(0, observed);
  const safeViolations = Math.max(0, violations);
  if (safeViolations >= GATE_CRITICAL_THRESHOLD) {
    return { outcome: 'CRITICAL', score: 0 };
  }
  if (safeViolations >= GATE_FAIL_THRESHOLD) {
    return { outcome: 'FAIL', score: clamp01(0.4 - safeViolations * 0.05) };
  }
  if (safeViolations >= GATE_WARNING_THRESHOLD) {
    return { outcome: 'WARNING', score: clamp01(0.75 - safeViolations * 0.05) };
  }
  // No violations. A clean gate is healthy regardless of how much was
  // observed; more observations lend marginally more confidence.
  const denom = safeObserved + 1;
  return { outcome: 'PASS', score: clamp01(0.9 + 0.1 * (safeObserved / denom)) };
}

const GATE_SIGNAL_KEYS: Record<
  CertificationGate,
  { observed: keyof GateSignals; violations: keyof GateSignals; label: string }
> = {
  KNOWLEDGE_INTEGRITY: {
    observed: 'knowledgeObjects',
    violations: 'knowledgeViolations',
    label: 'knowledge objects',
  },
  MEMORY_INTEGRITY: {
    observed: 'memoryEntries',
    violations: 'memoryViolations',
    label: 'memory entries',
  },
  RUNTIME_INTEGRITY: {
    observed: 'runtimeSessions',
    violations: 'runtimeViolations',
    label: 'runtime sessions',
  },
  EXCHANGE_INTEGRITY: {
    observed: 'exchangeTransactions',
    violations: 'exchangeViolations',
    label: 'exchange transactions',
  },
  CAPITAL_INTEGRITY: {
    observed: 'capitalAllocations',
    violations: 'capitalViolations',
    label: 'capital allocations',
  },
  MEASUREMENT_INTEGRITY: {
    observed: 'measurements',
    violations: 'measurementViolations',
    label: 'measurements',
  },
  GOVERNANCE_INTEGRITY: {
    observed: 'governancePolicies',
    violations: 'governanceViolations',
    label: 'governance policies',
  },
  AUDIT_INTEGRITY: {
    observed: 'auditRecords',
    violations: 'auditViolations',
    label: 'audit records',
  },
  EVIDENCE_INTEGRITY: {
    observed: 'evidenceRecords',
    violations: 'evidenceViolations',
    label: 'evidence records',
  },
  SECURITY_INTEGRITY: {
    observed: 'securityControls',
    violations: 'securityViolations',
    label: 'security controls',
  },
};

/** Evaluate a single constitutional certification gate (Part C). */
export function evaluateGate(gate: CertificationGate, signals: GateSignals): GateResult {
  const keys = GATE_SIGNAL_KEYS[gate];
  const observed = Number(signals[keys.observed] ?? 0);
  const violations = Number(signals[keys.violations] ?? 0);
  const { outcome, score } = outcomeForViolations(observed, violations);
  const detail =
    violations > 0
      ? `${violations} violation(s) detected across ${observed} ${keys.label}`
      : `No violations across ${observed} ${keys.label}`;
  return {
    gate,
    outcome,
    score: Math.round(score * 1e4) / 1e4,
    observed,
    violations,
    detail,
    constitutionalRefs: GATE_CONSTITUTIONAL_REFS[gate],
  };
}

/** Evaluate every certification gate (Part C). */
export function evaluateAllGates(signals: GateSignals): GateResult[] {
  return CERTIFICATION_GATES.map((gate) => evaluateGate(gate, signals));
}

export type CertificationSummary = {
  outcome: CertificationOutcome;
  score: number;
  passed: boolean;
  gatesPassed: number;
  gatesTotal: number;
};

/**
 * Aggregate gate results into an overall certification (Part G). The overall
 * outcome is the worst gate outcome; the score is the mean gate score.
 */
export function aggregateCertification(results: GateResult[]): CertificationSummary {
  if (results.length === 0) {
    return { outcome: 'PASS', score: 1, passed: true, gatesPassed: 0, gatesTotal: 0 };
  }
  let worst: CertificationOutcome = 'PASS';
  let total = 0;
  let gatesPassed = 0;
  for (const result of results) {
    if (OUTCOME_RANK[result.outcome] > OUTCOME_RANK[worst]) {
      worst = result.outcome;
    }
    total += result.score;
    if (result.outcome === 'PASS') {
      gatesPassed += 1;
    }
  }
  const score = Math.round((total / results.length) * 1e4) / 1e4;
  const passed = worst !== 'FAIL' && worst !== 'CRITICAL' && score >= CERTIFICATION_PASS_SCORE;
  return { outcome: worst, score, passed, gatesPassed, gatesTotal: results.length };
}

export type InjectionDefenses = {
  /** Whether the system can detect this class of failure. */
  canDetect?: boolean;
  /** Whether the system can contain the failure once detected. */
  canContain?: boolean;
  /** Whether the system can recover to a healthy posture. */
  canRecover?: boolean;
};

export type InjectionResult = {
  injectionType: FailureInjectionType;
  gate: CertificationGate;
  detected: boolean;
  contained: boolean;
  recovered: boolean;
  status: FailureInjectionStatus;
  outcome: CertificationOutcome;
  detail: string;
};

/**
 * Simulate the outcome of a controlled failure injection (Part D). Defenses
 * default to enabled — a healthy constitutional system detects, contains and
 * recovers. Explicitly disabling a defense models a resilience gap.
 */
export function simulateInjection(
  injectionType: FailureInjectionType,
  defenses: InjectionDefenses = {},
): InjectionResult {
  const detected = defenses.canDetect ?? true;
  const contained = detected && (defenses.canContain ?? true);
  const recovered = contained && (defenses.canRecover ?? true);

  let status: FailureInjectionStatus;
  let outcome: CertificationOutcome;
  if (recovered) {
    status = 'RECOVERED';
    outcome = 'PASS';
  } else if (contained) {
    status = 'CONTAINED';
    outcome = 'WARNING';
  } else if (detected) {
    status = 'DETECTED';
    outcome = 'FAIL';
  } else {
    status = 'UNRECOVERED';
    outcome = 'CRITICAL';
  }

  return {
    injectionType,
    gate: INJECTION_GATE_MAP[injectionType],
    detected,
    contained,
    recovered,
    status,
    outcome,
    detail: `${injectionType}: detected=${detected}, contained=${contained}, recovered=${recovered}`,
  };
}

/**
 * Compute a resilience score in [0, 1] from a set of injection results
 * (Part B). Recovered injections contribute fully, contained partially.
 */
export function computeResilienceScore(results: InjectionResult[]): number {
  if (results.length === 0) {
    return 1;
  }
  const total = results.reduce((sum, r) => {
    if (r.recovered) return sum + 1;
    if (r.contained) return sum + 0.5;
    if (r.detected) return sum + 0.25;
    return sum;
  }, 0);
  return Math.round((total / results.length) * 1e4) / 1e4;
}

/** Whether a resilience score clears the campaign pass bar. */
export function meetsResilienceThreshold(score: number): boolean {
  return score >= RESILIENCE_PASS_SCORE;
}

/** Map a set of injection results to an overall stress outcome (Part G). */
export function stressOutcome(results: InjectionResult[]): CertificationOutcome {
  if (results.length === 0) {
    return 'PASS';
  }
  let worst: CertificationOutcome = 'PASS';
  for (const r of results) {
    if (OUTCOME_RANK[r.outcome] > OUTCOME_RANK[worst]) {
      worst = r.outcome;
    }
  }
  return worst;
}

export type ContradictionCandidate = {
  type: ContradictionType;
  leftReferenceId?: string | null;
  leftReferenceType?: string | null;
  leftValue: unknown;
  rightReferenceId?: string | null;
  rightReferenceType?: string | null;
  rightValue: unknown;
};

export type DetectedContradiction = {
  type: ContradictionType;
  severity: ContradictionSeverity;
  impact: string;
  recommendedAction: string;
  constitutionalRefs: string[];
  leftReferenceId: string | null;
  leftReferenceType: string | null;
  rightReferenceId: string | null;
  rightReferenceType: string | null;
  detail: string;
};

const CONTRADICTION_SEVERITY: Record<ContradictionType, ContradictionSeverity> = {
  KNOWLEDGE: 'HIGH',
  INTENT: 'CRITICAL',
  CAPITAL: 'HIGH',
  MEASUREMENT: 'MEDIUM',
  RUNTIME: 'HIGH',
  GOVERNANCE: 'CRITICAL',
};

const CONTRADICTION_ACTION: Record<ContradictionType, string> = {
  KNOWLEDGE: 'Reconcile conflicting knowledge objects and re-run learning capitalization',
  INTENT: 'Escalate to Founder Intent Compiler for intent reconciliation',
  CAPITAL: 'Freeze capital allocation and re-validate IUC constraints',
  MEASUREMENT: 'Re-baseline measurement profile and recompute scores',
  RUNTIME: 'Checkpoint and recover the affected runtime session',
  GOVERNANCE: 'Halt and require constitutional governance review',
};

/**
 * Detect whether a candidate pair is contradictory (Part E). A contradiction
 * exists when the two sides disagree on a value that must be consistent.
 */
export function detectContradiction(
  candidate: ContradictionCandidate,
): DetectedContradiction | null {
  const conflicting = !valuesAgree(candidate.leftValue, candidate.rightValue);
  if (!conflicting) {
    return null;
  }
  return {
    type: candidate.type,
    severity: CONTRADICTION_SEVERITY[candidate.type],
    impact: `Conflicting ${candidate.type.toLowerCase()} state detected between two sources`,
    recommendedAction: CONTRADICTION_ACTION[candidate.type],
    constitutionalRefs: CONTRADICTION_CONSTITUTIONAL_REFS[candidate.type],
    leftReferenceId: candidate.leftReferenceId ?? null,
    leftReferenceType: candidate.leftReferenceType ?? null,
    rightReferenceId: candidate.rightReferenceId ?? null,
    rightReferenceType: candidate.rightReferenceType ?? null,
    detail: `left=${JSON.stringify(candidate.leftValue)} != right=${JSON.stringify(
      candidate.rightValue,
    )}`,
  };
}

/** Detect all contradictions across a set of candidate pairs. */
export function detectContradictions(
  candidates: ContradictionCandidate[],
): DetectedContradiction[] {
  return candidates
    .map((candidate) => detectContradiction(candidate))
    .filter((c): c is DetectedContradiction => c !== null);
}

/** Structural value equality used by the contradiction engine. */
function valuesAgree(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * SECH-FIC Runtime Enforcement Engine (IW-23)
 * -------------------------------------------
 * Pure, side-effect-free evaluation of a proposed decision against the
 * constitutional constraint registry (fic-enforcement.constants.ts).
 *
 * Implements the 13-step SECH-FIC check sequence:
 *   1  IDENTIFY_SCOPE        4  DETECT_CONFLICTS     7  AUTO_BLOCK
 *   2  QUERY_INTENTS         5  APPLY_HIERARCHY      8  REJECT_HC
 *   3  ASSEMBLE_PAYLOAD      6  EVALUATE_CONSTRAINTS 9  FLAG_SC
 *   10 REQUIRE_GATE          11 ASSEMBLE_RESPONSE    12/13 persistence (service)
 *
 * The service layer (fic-enforcement.service.ts) performs steps 12/13 by
 * persisting the enforcement + violation events (IURG binding) and returning
 * the result to the caller. This engine produces the deterministic decision.
 */

import {
  ALL_CONSTRAINTS,
  CONFLICT_RESOLUTION_CLASSES,
  CONSTRAINTS_BY_ID,
  FOUNDER_INTENT_CORPUS,
  FicCheckDecision,
  FicConflictClass,
  FicConstraintDef,
  FicConstraintKind,
  FicEvaluationOutcome,
  PRIORITY_HIERARCHY,
  SECH_FIC_CHECK_STEPS,
  constraintAppliesToDomains,
  constraintIdsForPlaybooks,
} from './fic-enforcement.constants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Boolean/numeric signals describing the proposed decision. Every constraint
 * with a `signal` key is evaluated against the matching field here. Unknown or
 * absent signals are treated as "not triggered".
 */
export type FicDecisionSignals = Record<string, boolean | number | undefined>;

export interface FicCheckInput {
  /** Playbooks affected by the proposed decision (e.g. ['clinic_operations']). */
  playbooks?: string[];
  /** Domains affected (e.g. ['clinical','commercial']). */
  domains?: string[];
  /** Signals describing the proposed action. */
  signals?: FicDecisionSignals;
  /** Free-text description of the decision (for traceability only). */
  decisionContext?: string;
}

export interface FicConstraintEvaluation {
  constraintId: string;
  kind: FicConstraintKind;
  title: string;
  outcome: FicEvaluationOutcome;
  triggered: boolean;
  reason: string;
}

export interface FicConflictFinding {
  classId: string;
  name: string;
  description: string;
  /** Priority level (1-8) that resolves the conflict per the hierarchy. */
  resolvedByLevel: number;
  resolvedByName: string;
  autoResolvable: boolean;
}

export interface FicStepLog {
  step: number;
  name: string;
  detail: string;
}

export interface FicCheckResult {
  decision: FicCheckDecision;
  reason: string;
  /** Ordered log of the 13-step sequence. */
  steps: FicStepLog[];
  /** Constraint IDs assembled into the evaluation payload (Step 3). */
  applicableConstraintIds: string[];
  /** Applicable intent IDs (Step 2). */
  applicableIntentIds: string[];
  evaluations: FicConstraintEvaluation[];
  conflicts: FicConflictFinding[];
  /** EB blocks triggered (Step 7). */
  executionBlocks: string[];
  /** HC violations (Step 8). */
  hardViolations: string[];
  /** SC flags (Step 9). */
  softFlags: string[];
  /** DG gates requiring human approval (Step 10). */
  requiredGates: string[];
  /** OR override rules active. */
  activeOverrides: string[];
  /** Highest priority level engaged (1-8), or null if none. */
  priorityLevel: number | null;
  /** Whether human approval is required before the decision can proceed. */
  requiresHumanApproval: boolean;
  /** Counter-proposal text when REJECTED. */
  counterProposal: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truthy(signal: boolean | number | undefined): boolean {
  if (typeof signal === 'number') {
    return signal > 0;
  }
  return signal === true;
}

/** Normalize domain / playbook lists to lowercase, de-duplicated, trimmed. */
function normalizeList(values: string[] = []): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)));
}

// ---------------------------------------------------------------------------
// Step 1-3 — scope, intents, payload
// ---------------------------------------------------------------------------

/** Step 2: applicable Founder Intent corpus objects for the given domains. */
export function resolveApplicableIntents(domains: string[]): string[] {
  const wanted = new Set(normalizeList(domains).map((d) => d.toLowerCase()));
  return FOUNDER_INTENT_CORPUS.filter((intent) => {
    const ad = intent.affectedDomains ?? [];
    if (ad.includes('all')) {
      return true;
    }
    if (wanted.size === 0) {
      return false;
    }
    return ad.some((d) => wanted.has(d.toLowerCase()));
  }).map((i) => i.intentId);
}

/**
 * Step 3: assemble the constraint payload. Constraints are selected when they
 * apply to any affected domain OR are mapped to any affected playbook. Advisory
 * constraints are always included as advisory context.
 */
export function resolveApplicableConstraints(
  domains: string[],
  playbooks: string[],
): FicConstraintDef[] {
  const playbookConstraintIds = new Set(constraintIdsForPlaybooks(normalizeList(playbooks)));
  const seen = new Set<string>();
  const result: FicConstraintDef[] = [];
  for (const constraint of ALL_CONSTRAINTS) {
    const byDomain = constraintAppliesToDomains(constraint, domains);
    const byPlaybook = playbookConstraintIds.has(constraint.id);
    if (byDomain || byPlaybook) {
      if (!seen.has(constraint.id)) {
        seen.add(constraint.id);
        result.push(constraint);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Step 4-5 — conflict detection + priority hierarchy
// ---------------------------------------------------------------------------

/**
 * Step 5: resolve which priority-hierarchy level governs the decision, given
 * the active signals. Returns the highest-priority (lowest number) engaged
 * level, or null when nothing above advisory is engaged.
 */
export function applyPriorityHierarchy(signals: FicDecisionSignals): number | null {
  // Level 1 EMERGENCY/SAFETY
  if (truthy(signals.emergencyMedical) || truthy(signals.animalWelfareAtRisk)) {
    return 1;
  }
  // Level 2 LEGAL COMPLIANCE
  if (truthy(signals.legalConflict)) {
    return 2;
  }
  // Level 3 CONSTITUTIONAL PILLAR (HC-08 pillars)
  if (
    truthy(signals.profitOverCare) ||
    truthy(signals.corpusMissing) ||
    truthy(signals.destructiveOverwrite)
  ) {
    return 3;
  }
  // Level 4 NON-NEGOTIABLE (FI-0036..0038)
  if (truthy(signals.reducesClinicalStaffForRevenue) || truthy(signals.zeroStart)) {
    return 4;
  }
  // Level 5 ACTIVE FOUNDER INTENT
  if (truthy(signals.founderSelfOverride) || truthy(signals.activeFounderIntent)) {
    return 5;
  }
  // Level 6 INSTITUTIONAL JUDGMENT
  if (truthy(signals.institutionalJudgment)) {
    return 6;
  }
  // Level 7 EXPERIMENTAL INTENT
  if (truthy(signals.experimentalIntent)) {
    return 7;
  }
  // Level 8 ADVISORY CONSTRAINT
  if (truthy(signals.advisoryOnly)) {
    return 8;
  }
  return null;
}

/**
 * Step 4: detect active conflict classes from the signals, then annotate each
 * with the priority-hierarchy level that resolves it (Step 5).
 */
export function detectConflicts(signals: FicDecisionSignals): FicConflictFinding[] {
  const level = applyPriorityHierarchy(signals);
  const resolving = level ? PRIORITY_HIERARCHY.find((p) => p.level === level) : undefined;
  const findings: FicConflictFinding[] = [];
  for (const klass of CONFLICT_RESOLUTION_CLASSES as readonly FicConflictClass[]) {
    if (!truthy(signals[klass.signal])) {
      continue;
    }
    findings.push({
      classId: klass.id,
      name: klass.name,
      description: klass.description,
      resolvedByLevel: resolving?.level ?? 0,
      resolvedByName: resolving?.name ?? 'UNRESOLVED',
      // A conflict is auto-resolvable when a concrete hierarchy level governs it.
      autoResolvable: Boolean(resolving),
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Step 6 — evaluate constraints against the proposed action
// ---------------------------------------------------------------------------

/** Evaluate a single constraint against the signals. */
export function evaluateConstraint(
  constraint: FicConstraintDef,
  signals: FicDecisionSignals,
): FicConstraintEvaluation {
  const base = {
    constraintId: constraint.id,
    kind: constraint.kind,
    title: constraint.title,
  };

  // Advisory constraints never bind; they are surfaced as guidance.
  if (constraint.kind === 'AC') {
    return {
      ...base,
      outcome: 'ADVISORY',
      triggered: false,
      reason: 'Advisory guidance (non-binding).',
    };
  }

  // Outcome validation + override rules are post-execution / conditional; they
  // are informational within a pre-execution check unless their signal fires.
  const signalKey = constraint.signal;
  const triggered = signalKey ? truthy(signals[signalKey]) : false;

  if (constraint.kind === 'OVR') {
    return {
      ...base,
      outcome: 'NOT_APPLICABLE',
      triggered: false,
      reason: 'Post-execution validation rule; scheduled, not evaluated at decision time.',
    };
  }

  if (constraint.kind === 'OR') {
    return triggered
      ? {
          ...base,
          outcome: 'PASS',
          triggered: true,
          reason: `Override rule active: ${constraint.overrideCondition ?? ''}`.trim(),
        }
      : {
          ...base,
          outcome: 'NOT_APPLICABLE',
          triggered: false,
          reason: 'Override condition not present.',
        };
  }

  if (!triggered) {
    return {
      ...base,
      outcome: 'PASS',
      triggered: false,
      reason: 'Constraint condition not triggered.',
    };
  }

  switch (constraint.kind) {
    case 'EB':
      return {
        ...base,
        outcome: 'BLOCKED',
        triggered: true,
        reason: `Execution block: ${constraint.statement}`,
      };
    case 'HC':
      return {
        ...base,
        outcome: 'VIOLATED',
        triggered: true,
        reason: `Hard constraint violated: ${constraint.statement}`,
      };
    case 'SC':
      return {
        ...base,
        outcome: 'FLAGGED',
        triggered: true,
        reason: `Soft constraint requires justification: ${constraint.statement}`,
      };
    case 'DG':
      return {
        ...base,
        outcome: 'GATE_REQUIRED',
        triggered: true,
        reason: `Human approval required (${constraint.approver ?? 'authority'}): ${constraint.trigger ?? constraint.statement}`,
      };
    default:
      return { ...base, outcome: 'PASS', triggered: false, reason: 'No enforcement action.' };
  }
}

// ---------------------------------------------------------------------------
// Steps 1-11 orchestration
// ---------------------------------------------------------------------------

function stepDetail(step: number): string {
  return SECH_FIC_CHECK_STEPS.find((s) => s.step === step)?.description ?? '';
}

export function runFicCheck(input: FicCheckInput): FicCheckResult {
  const domains = normalizeList(input.domains);
  const playbooks = normalizeList(input.playbooks);
  const signals = input.signals ?? {};
  const steps: FicStepLog[] = [];

  // Step 1 — identify scope
  steps.push({
    step: 1,
    name: 'IDENTIFY_SCOPE',
    detail: `${stepDetail(1)} playbooks=[${playbooks.join(', ')}] domains=[${domains.join(', ')}]`,
  });

  // Step 2 — query applicable intents
  const applicableIntentIds = resolveApplicableIntents(domains);
  steps.push({
    step: 2,
    name: 'QUERY_INTENTS',
    detail: `${stepDetail(2)} -> ${applicableIntentIds.length} intents`,
  });

  // Step 3 — assemble constraint payload
  const applicable = resolveApplicableConstraints(domains, playbooks);
  const applicableConstraintIds = applicable.map((c) => c.id);
  steps.push({
    step: 3,
    name: 'ASSEMBLE_PAYLOAD',
    detail: `${stepDetail(3)} -> ${applicable.length} constraints`,
  });

  // Step 4 — detect conflicts
  const conflicts = detectConflicts(signals);
  steps.push({
    step: 4,
    name: 'DETECT_CONFLICTS',
    detail: `${stepDetail(4)} -> ${conflicts.length} conflicts`,
  });

  // Step 5 — apply priority hierarchy
  const priorityLevel = applyPriorityHierarchy(signals);
  steps.push({
    step: 5,
    name: 'APPLY_HIERARCHY',
    detail: priorityLevel
      ? `${stepDetail(5)} governing level ${priorityLevel}`
      : `${stepDetail(5)} no hierarchy level engaged`,
  });

  // Step 6 — evaluate constraints
  const evaluations = applicable.map((c) => evaluateConstraint(c, signals));
  steps.push({
    step: 6,
    name: 'EVALUATE_CONSTRAINTS',
    detail: `${stepDetail(6)} -> ${evaluations.length} evaluated`,
  });

  const executionBlocks = evaluations
    .filter((e) => e.outcome === 'BLOCKED')
    .map((e) => e.constraintId);
  const hardViolations = evaluations
    .filter((e) => e.outcome === 'VIOLATED')
    .map((e) => e.constraintId);
  const softFlags = evaluations.filter((e) => e.outcome === 'FLAGGED').map((e) => e.constraintId);
  const requiredGates = evaluations
    .filter((e) => e.outcome === 'GATE_REQUIRED')
    .map((e) => e.constraintId);
  const activeOverrides = evaluations
    .filter((e) => e.kind === 'OR' && e.triggered)
    .map((e) => e.constraintId);

  // Step 7 — auto-block on EB
  steps.push({
    step: 7,
    name: 'AUTO_BLOCK',
    detail: `${stepDetail(7)} -> ${executionBlocks.length} blocks`,
  });
  // Step 8 — reject on HC
  steps.push({
    step: 8,
    name: 'REJECT_HC',
    detail: `${stepDetail(8)} -> ${hardViolations.length} violations`,
  });
  // Step 9 — flag SC
  steps.push({ step: 9, name: 'FLAG_SC', detail: `${stepDetail(9)} -> ${softFlags.length} flags` });
  // Step 10 — require gate
  steps.push({
    step: 10,
    name: 'REQUIRE_GATE',
    detail: `${stepDetail(10)} -> ${requiredGates.length} gates`,
  });

  // Determine decision. Precedence: OVERRIDE > REJECTED > CONFLICT > APPROVED.
  let decision: FicCheckDecision;
  let reason: string;
  let counterProposal: string | null = null;
  let requiresHumanApproval = false;

  const overrideActive =
    activeOverrides.length > 0 &&
    (truthy(signals.emergencyMedical) ||
      truthy(signals.legalConflict) ||
      truthy(signals.founderSelfOverride) ||
      truthy(signals.constitutionalAmendment) ||
      truthy(signals.catastrophicEvent));

  if (overrideActive) {
    decision = 'OVERRIDE';
    reason = `Override rule(s) active: ${activeOverrides.join(', ')}. Emergency protocol; full audit trail required.`;
    requiresHumanApproval = true;
  } else if (executionBlocks.length > 0 || hardViolations.length > 0) {
    decision = 'REJECTED';
    const blocked = [...executionBlocks, ...hardViolations];
    reason = `Rejected: ${blocked.join(', ')} triggered.`;
    counterProposal = buildCounterProposal(blocked);
  } else if (conflicts.some((c) => !c.autoResolvable) || requiredGates.length > 0) {
    decision = 'CONFLICT';
    const parts: string[] = [];
    if (requiredGates.length > 0) {
      parts.push(`gates require human approval: ${requiredGates.join(', ')}`);
    }
    const unresolved = conflicts.filter((c) => !c.autoResolvable).map((c) => c.classId);
    if (unresolved.length > 0) {
      parts.push(`unresolved conflicts: ${unresolved.join(', ')}`);
    }
    reason = `Paused for human escalation — ${parts.join('; ')}.`;
    requiresHumanApproval = true;
  } else {
    decision = 'APPROVED';
    reason =
      softFlags.length > 0
        ? `Approved with ${softFlags.length} soft-constraint flag(s) requiring documentation.`
        : 'Approved — no binding constraint triggered.';
  }

  // Step 11 — assemble response
  steps.push({
    step: 11,
    name: 'ASSEMBLE_RESPONSE',
    detail: `${stepDetail(11)} decision=${decision}`,
  });

  return {
    decision,
    reason,
    steps,
    applicableConstraintIds,
    applicableIntentIds,
    evaluations,
    conflicts,
    executionBlocks,
    hardViolations,
    softFlags,
    requiredGates,
    activeOverrides,
    priorityLevel,
    requiresHumanApproval,
    counterProposal,
  };
}

/** Produce a human-readable counter-proposal for the rejected constraints. */
export function buildCounterProposal(constraintIds: string[]): string {
  const parts = constraintIds.map((id) => {
    const c = CONSTRAINTS_BY_ID.get(id);
    if (!c) {
      return `${id}: revise the proposal to comply with this constraint.`;
    }
    if (c.kind === 'EB') {
      return `${id} (${c.title}): ${c.autoUnblock ?? 'requires human unblock'}.`;
    }
    return `${id} (${c.title}): ${c.statement}`;
  });
  return `Revise the decision to satisfy: ${parts.join(' | ')}`;
}

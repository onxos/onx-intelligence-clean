import { StrategicHorizon, StrategicPriority } from '@prisma/client';
import {
  STRATEGIC_HORIZON_ORDER,
  STRATEGIC_PRIORITY_ORDER,
  USFIP_CONSTITUTIONAL_REF,
} from './usfip.constants';

/**
 * USFIP protocol engine — pure, deterministic, side-effect free.
 * Persistence, audit and evidence live in the service layer.
 */

// ----------------------------------------------------------------------
// Part B — strategic interpretation
// ----------------------------------------------------------------------

export type StrategicInterpretation = {
  founderDirective: string;
  strategicObjective: string;
  strategicPriority: StrategicPriority;
  strategicHorizon: StrategicHorizon;
  strategicOutcome: string;
  constitutionalRef: string;
};

/**
 * Interpret a founder directive into a normalized strategic interpretation.
 * Priority/horizon default sensibly and are clamped to the enum domain.
 */
export function interpretDirective(input: {
  founderDirective: string;
  strategicObjective?: string | null;
  strategicPriority?: StrategicPriority | null;
  strategicHorizon?: StrategicHorizon | null;
  strategicOutcome?: string | null;
}): StrategicInterpretation {
  const directive = input.founderDirective.trim();
  return {
    founderDirective: directive,
    strategicObjective: input.strategicObjective?.trim() || directive,
    strategicPriority: input.strategicPriority ?? 'MEDIUM',
    strategicHorizon: input.strategicHorizon ?? 'MEDIUM',
    strategicOutcome: input.strategicOutcome?.trim() || `Strategic realization of: ${directive}`,
    constitutionalRef: USFIP_CONSTITUTIONAL_REF.INTENT,
  };
}

// ----------------------------------------------------------------------
// Part C — protocol engine
// ----------------------------------------------------------------------

export type EvaluableRule = {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  ordering: number;
  weight: number;
};

export type EvaluablePolicy = {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  priority: number;
  strategicPriority: StrategicPriority;
};

export type ProtocolEvaluation = {
  selectedPolicyId: string | null;
  selectedRuleIds: string[];
  executionPath: string[];
  score: number;
  reason: string;
  constitutionalRef: string;
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Select the winning policy for a protocol execution. Active policies are
 * ordered by strategic priority, then by explicit priority. Returns null when
 * no active policy exists (conflict prevention — nothing is force-selected).
 */
export function selectPolicy(policies: EvaluablePolicy[]): EvaluablePolicy | null {
  const active = policies.filter((p) => p.status === 'ACTIVE');
  if (!active.length) return null;
  const sorted = [...active].sort((a, b) => {
    const byStrategic =
      STRATEGIC_PRIORITY_ORDER[b.strategicPriority] - STRATEGIC_PRIORITY_ORDER[a.strategicPriority];
    if (byStrategic !== 0) return byStrategic;
    return b.priority - a.priority;
  });
  return sorted[0];
}

/**
 * Order active rules deterministically by ordering then weight — this is the
 * priority ordering surface and prevents rule-execution conflicts by producing
 * a single stable sequence.
 */
export function orderRules(rules: EvaluableRule[]): EvaluableRule[] {
  return rules
    .filter((r) => r.status === 'ACTIVE')
    .sort((a, b) => {
      if (a.ordering !== b.ordering) return a.ordering - b.ordering;
      return b.weight - a.weight;
    });
}

/**
 * Evaluate a protocol: select a policy, order the rules and derive a governed
 * execution path with a strategic score. No planning or reasoning is performed
 * — this is deterministic protocol selection only.
 */
export function evaluateProtocol(input: {
  priority: StrategicPriority;
  horizon: StrategicHorizon;
  rules: EvaluableRule[];
  policies: EvaluablePolicy[];
}): ProtocolEvaluation {
  const policy = selectPolicy(input.policies);
  const orderedRules = orderRules(input.rules);
  const ruleIds = orderedRules.map((r) => r.id);

  const priorityWeight = STRATEGIC_PRIORITY_ORDER[input.priority] / 4;
  const horizonWeight = STRATEGIC_HORIZON_ORDER[input.horizon] / 4;
  const ruleWeight = orderedRules.length
    ? orderedRules.reduce((acc, r) => acc + clamp01(r.weight), 0) / orderedRules.length
    : 0;
  const policyWeight = policy ? 1 : 0;
  const score = clamp01(
    priorityWeight * 0.3 + horizonWeight * 0.2 + ruleWeight * 0.3 + policyWeight * 0.2,
  );

  const executionPath = [
    'INTERPRET',
    policy ? `POLICY:${policy.id}` : 'POLICY:none',
    ...ruleIds.map((id) => `RULE:${id}`),
    'EXECUTE',
  ];

  return {
    selectedPolicyId: policy?.id ?? null,
    selectedRuleIds: ruleIds,
    executionPath,
    score,
    reason: policy
      ? `Policy ${policy.id} selected with ${ruleIds.length} ordered rules`
      : `No active policy — executing ${ruleIds.length} rules under default governance`,
    constitutionalRef: USFIP_CONSTITUTIONAL_REF.EXECUTION,
  };
}

// ----------------------------------------------------------------------
// Part D — constitutional governance
// ----------------------------------------------------------------------

export type GovernanceValidation = {
  valid: boolean;
  founderAuthorityValid: boolean;
  issues: string[];
  constitutionalRef: string;
};

/**
 * Validate a protocol against constitutional governance: a founder directive
 * must be present (founder authority), at least one active rule or policy must
 * exist, and an overridden session cannot be executed.
 */
export function validateGovernance(input: {
  founderDirective?: string | null;
  overridden: boolean;
  activeRuleCount: number;
  activePolicyCount: number;
}): GovernanceValidation {
  const issues: string[] = [];
  const founderAuthorityValid = Boolean(input.founderDirective?.trim());
  if (!founderAuthorityValid) {
    issues.push('Founder directive is required to establish founder authority');
  }
  if (input.overridden) {
    issues.push('Session is under an immutable founder override');
  }
  if (input.activeRuleCount === 0 && input.activePolicyCount === 0) {
    issues.push('Protocol has no active rules or policies to enforce');
  }
  return {
    valid: issues.length === 0,
    founderAuthorityValid,
    issues,
    constitutionalRef: USFIP_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
  };
}

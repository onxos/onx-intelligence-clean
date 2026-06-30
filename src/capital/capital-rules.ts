import { IntelligenceCapital } from '@prisma/client';
import {
  CAPITAL_AUTHORITY_RANK,
  DEFAULT_MAX_ALLOCATION_RATIO,
  FOUNDER_OVERRIDE_AUTHORITIES,
} from './capital.constants';

/**
 * IW-07 — D13.5 Capital Allocation rules engine.
 *
 * A deterministic, side-effect-free evaluator that governs whether capital may
 * be drawn down for an allocation. It enforces (in order):
 *  1. Constitutional validation — value can never go negative; capital must be
 *     in an allocatable status; authority must be recognised.
 *  2. Dependency validation — capital must not be DEPLETED/ARCHIVED and any
 *     declared dependency floors must be respected.
 *  3. Minimum capital rule — post-allocation value must remain at or above the
 *     configured minimum reserve.
 *  4. Maximum allocation rule — a single allocation may not exceed the allowed
 *     fraction of current value.
 *  5. Capital preservation rule — the preservation score must not be breached.
 *
 * A founder override (SOVEREIGN/FOUNDER/INSTITUTIONAL authority) may waive the
 * non-constitutional rules but may never waive the constitutional floor.
 */

export type CapitalRuleViolation = {
  rule:
    | 'CONSTITUTIONAL'
    | 'DEPENDENCY'
    | 'MINIMUM_CAPITAL'
    | 'MAXIMUM_ALLOCATION'
    | 'CAPITAL_PRESERVATION';
  message: string;
  constitutional: boolean;
};

export type CapitalRuleEvaluation = {
  allowed: boolean;
  violations: CapitalRuleViolation[];
  overrideApplied: boolean;
  projectedValue: number;
  maxAllocatable: number;
};

export type AllocationRuleOptions = {
  amount: number;
  maxAllocationRatio?: number;
  founderOverride?: boolean;
  overrideAuthority?: string | null;
  dependencyFloor?: number;
};

function authorityAllowsOverride(authority: string | null | undefined): boolean {
  if (!authority) {
    return false;
  }
  return (FOUNDER_OVERRIDE_AUTHORITIES as readonly string[]).includes(authority);
}

export function evaluateAllocationRules(
  capital: Pick<
    IntelligenceCapital,
    'currentValue' | 'minimumValue' | 'preservationScore' | 'status' | 'authority'
  >,
  options: AllocationRuleOptions,
): CapitalRuleEvaluation {
  const violations: CapitalRuleViolation[] = [];
  const amount = options.amount;
  const currentValue = capital.currentValue;
  const minimumValue = capital.minimumValue ?? 0;
  const ratio = options.maxAllocationRatio ?? DEFAULT_MAX_ALLOCATION_RATIO;
  const projectedValue = currentValue - amount;
  const maxAllocatable = Math.max(0, currentValue * ratio);

  const overrideRequested = Boolean(options.founderOverride);
  const overrideAuthorised =
    overrideRequested && authorityAllowsOverride(options.overrideAuthority ?? capital.authority);
  const overrideApplied = overrideRequested && overrideAuthorised;

  // 1. Constitutional validation — never waivable.
  if (!Number.isFinite(amount) || amount <= 0) {
    violations.push({
      rule: 'CONSTITUTIONAL',
      message: 'Allocation amount must be a positive, finite number.',
      constitutional: true,
    });
  }
  if (projectedValue < 0) {
    violations.push({
      rule: 'CONSTITUTIONAL',
      message: 'Allocation would drive capital value below zero, which is forbidden.',
      constitutional: true,
    });
  }
  if (capital.status === 'ARCHIVED') {
    violations.push({
      rule: 'CONSTITUTIONAL',
      message: 'Archived capital cannot be allocated.',
      constitutional: true,
    });
  }
  if (CAPITAL_AUTHORITY_RANK[capital.authority] === undefined) {
    violations.push({
      rule: 'CONSTITUTIONAL',
      message: `Unrecognised capital authority: ${capital.authority}.`,
      constitutional: true,
    });
  }

  // 2. Dependency validation.
  if (capital.status === 'DEPLETED') {
    violations.push({
      rule: 'DEPENDENCY',
      message: 'Depleted capital must recover before it can support new allocations.',
      constitutional: false,
    });
  }
  if (options.dependencyFloor !== undefined && projectedValue < options.dependencyFloor) {
    violations.push({
      rule: 'DEPENDENCY',
      message: `Allocation breaches a dependency floor of ${options.dependencyFloor}.`,
      constitutional: false,
    });
  }

  // 3. Minimum capital rule.
  if (projectedValue < minimumValue) {
    violations.push({
      rule: 'MINIMUM_CAPITAL',
      message: `Allocation would reduce capital below its minimum reserve of ${minimumValue}.`,
      constitutional: false,
    });
  }

  // 4. Maximum allocation rule.
  if (amount > maxAllocatable) {
    violations.push({
      rule: 'MAXIMUM_ALLOCATION',
      message: `Allocation exceeds the maximum allowable draw of ${maxAllocatable.toFixed(2)} (${
        ratio * 100
      }% of current value).`,
      constitutional: false,
    });
  }

  // 5. Capital preservation rule.
  const preservationFloor = minimumValue + currentValue * (1 - (capital.preservationScore ?? 1));
  if (capital.preservationScore < 1 && projectedValue < preservationFloor) {
    violations.push({
      rule: 'CAPITAL_PRESERVATION',
      message: `Allocation breaches the preservation floor of ${preservationFloor.toFixed(2)}.`,
      constitutional: false,
    });
  }

  // Apply override: waive non-constitutional violations only.
  const effectiveViolations = overrideApplied
    ? violations.filter((violation) => violation.constitutional)
    : violations;

  return {
    allowed: effectiveViolations.length === 0,
    violations: effectiveViolations,
    overrideApplied,
    projectedValue,
    maxAllocatable,
  };
}

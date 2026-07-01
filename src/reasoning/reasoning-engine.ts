import { ReasoningMode, ReasoningStepKind, ReasoningVerdict } from '@prisma/client';
import {
  MAX_ALTERNATIVE_PATHS,
  REASONING_MODE_PROFILES,
  REASONING_STAGES,
  VALIDATION_THRESHOLDS,
  VERDICT_THRESHOLDS,
  type ModeProfile,
} from './reasoning.constants';

/**
 * Reasoning engine — pure, deterministic, side-effect free.
 *
 * The engine loads context, constructs the reasoning chain, aggregates
 * evidence, evaluates constraints, scores confidence, derives alternative
 * paths and produces a reasoning trace. Persistence, audit and evidence live
 * in the service layer. It never plans and never decides.
 */

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// ----------------------------------------------------------------------
// Signal shapes (all sourced from existing runtimes by reference)
// ----------------------------------------------------------------------

export type ContextSignal = {
  runtime: string;
  role: string;
  weight?: number;
  confidence?: number;
  referenceId?: string | null;
  referenceType?: string | null;
  summary?: string | null;
};

export type EvidenceSignal = {
  summary?: string | null;
  confidence?: number;
  runtime?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
};

export type ConstraintSignal = {
  name: string;
  satisfied: boolean;
  weight?: number;
  required?: boolean;
};

// ----------------------------------------------------------------------
// Part B — mode profiles
// ----------------------------------------------------------------------

/** Resolve the weight profile for a reasoning mode. */
export function resolveModeProfile(mode: ReasoningMode): ModeProfile {
  return REASONING_MODE_PROFILES[mode];
}

// ----------------------------------------------------------------------
// Part C — context loading + evidence aggregation
// ----------------------------------------------------------------------

export type ContextAggregate = {
  confidence: number;
  count: number;
  runtimes: string[];
  hasKnowledge: boolean;
};

const KNOWLEDGE_RUNTIMES = new Set(['D16', 'KNOWLEDGE', 'D11', 'D12']);

/** Aggregate the loaded context into a single weighted confidence. */
export function aggregateContext(contexts: ContextSignal[]): ContextAggregate {
  if (!contexts.length) {
    return { confidence: 0, count: 0, runtimes: [], hasKnowledge: false };
  }
  let weightSum = 0;
  let weighted = 0;
  const runtimes = new Set<string>();
  let hasKnowledge = false;
  for (const c of contexts) {
    const w = Number.isFinite(c.weight) && (c.weight ?? 0) > 0 ? (c.weight as number) : 1;
    const conf = clamp01(c.confidence ?? 1);
    weightSum += w;
    weighted += w * conf;
    runtimes.add(c.runtime);
    if (KNOWLEDGE_RUNTIMES.has(c.runtime.toUpperCase())) {
      hasKnowledge = true;
    }
  }
  const confidence = weightSum > 0 ? clamp01(weighted / weightSum) : 0;
  return { confidence, count: contexts.length, runtimes: Array.from(runtimes), hasKnowledge };
}

export type EvidenceAggregate = {
  confidence: number;
  count: number;
};

/** Aggregate evidence items into a single mean confidence. */
export function aggregateEvidence(evidence: EvidenceSignal[]): EvidenceAggregate {
  if (!evidence.length) {
    return { confidence: 0, count: 0 };
  }
  const total = evidence.reduce((acc, e) => acc + clamp01(e.confidence ?? 1), 0);
  return { confidence: clamp01(total / evidence.length), count: evidence.length };
}

// ----------------------------------------------------------------------
// Part C — constraint evaluation
// ----------------------------------------------------------------------

export type ConstraintEvaluation = {
  ratio: number;
  total: number;
  satisfiedCount: number;
  constraintsSatisfied: boolean;
  violations: string[];
};

/**
 * Evaluate the constraint set. When no constraints are supplied the set is
 * vacuously satisfied (ratio 1). Required-but-unsatisfied constraints mark the
 * whole evaluation as unsatisfied.
 */
export function evaluateConstraints(constraints: ConstraintSignal[]): ConstraintEvaluation {
  if (!constraints.length) {
    return { ratio: 1, total: 0, satisfiedCount: 0, constraintsSatisfied: true, violations: [] };
  }
  let satisfiedCount = 0;
  const violations: string[] = [];
  let requiredViolation = false;
  for (const c of constraints) {
    if (c.satisfied) {
      satisfiedCount += 1;
    } else {
      violations.push(c.name);
      if (c.required !== false) {
        requiredViolation = true;
      }
    }
  }
  return {
    ratio: clamp01(satisfiedCount / constraints.length),
    total: constraints.length,
    satisfiedCount,
    constraintsSatisfied: !requiredViolation,
    violations,
  };
}

// ----------------------------------------------------------------------
// Part C — confidence scoring + verdict
// ----------------------------------------------------------------------

export type ConfidenceInput = {
  mode: ReasoningMode;
  contextConfidence: number;
  evidenceConfidence: number;
  constraintRatio: number;
  founderPresent?: boolean;
};

/** Blend the sub-signals into a single confidence score via the mode profile. */
export function scoreConfidence(input: ConfidenceInput): number {
  const profile = resolveModeProfile(input.mode);
  let score =
    profile.evidenceWeight * clamp01(input.evidenceConfidence) +
    profile.constraintWeight * clamp01(input.constraintRatio) +
    profile.contextWeight * clamp01(input.contextConfidence);
  if (profile.founderWeight > 0) {
    score += profile.founderWeight * (input.founderPresent ? 1 : 0);
  }
  return clamp01(score);
}

/** Resolve the verdict from confidence + constraint satisfaction (Part C). */
export function resolveVerdict(
  confidence: number,
  constraintsSatisfied: boolean,
): ReasoningVerdict {
  if (!constraintsSatisfied) return 'CONTESTED';
  if (confidence >= VERDICT_THRESHOLDS.CONCLUSIVE) return 'CONCLUSIVE';
  if (confidence >= VERDICT_THRESHOLDS.PLAUSIBLE) return 'PLAUSIBLE';
  return 'INCONCLUSIVE';
}

// ----------------------------------------------------------------------
// Part C — alternative paths
// ----------------------------------------------------------------------

export type AlternativePath = {
  mode: ReasoningMode;
  confidence: number;
  rationale: string;
};

/**
 * Derive alternative reasoning paths by re-scoring the same signals under every
 * other mode, ranked by confidence. Bounded to MAX_ALTERNATIVE_PATHS.
 */
export function deriveAlternativePaths(
  primaryMode: ReasoningMode,
  signals: {
    contextConfidence: number;
    evidenceConfidence: number;
    constraintRatio: number;
    founderPresent?: boolean;
  },
): AlternativePath[] {
  const modes = Object.keys(REASONING_MODE_PROFILES) as ReasoningMode[];
  return modes
    .filter((m) => m !== primaryMode)
    .map((mode) => ({
      mode,
      confidence: scoreConfidence({ mode, ...signals }),
      rationale: `${REASONING_MODE_PROFILES[mode].name} re-scoring of the same evidence and constraints`,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_ALTERNATIVE_PATHS);
}

// ----------------------------------------------------------------------
// Part C — chain construction + reasoning trace
// ----------------------------------------------------------------------

export type StepDescriptor = {
  kind: ReasoningStepKind;
  sequence: number;
  summary: string;
  confidence: number;
  output: Record<string, unknown>;
};

export type ReasoningTrace = {
  stages: { kind: ReasoningStepKind; summary: string; confidence: number }[];
  summary: string;
};

/** Build the ordered reasoning trace from the constructed steps (Part C). */
export function buildReasoningTrace(steps: StepDescriptor[]): ReasoningTrace {
  return {
    stages: steps.map((s) => ({ kind: s.kind, summary: s.summary, confidence: s.confidence })),
    summary: steps.map((s) => s.kind).join(' -> '),
  };
}

// ----------------------------------------------------------------------
// Full reasoning run (orchestrates Part C end to end)
// ----------------------------------------------------------------------

export type ReasoningInput = {
  mode: ReasoningMode;
  question: string;
  contexts: ContextSignal[];
  evidence: EvidenceSignal[];
  constraints: ConstraintSignal[];
  founderPresent?: boolean;
};

export type ReasoningOutcome = {
  mode: ReasoningMode;
  contextConfidence: number;
  evidenceConfidence: number;
  constraintRatio: number;
  constraintsSatisfied: boolean;
  violations: string[];
  confidence: number;
  verdict: ReasoningVerdict;
  conclusion: string;
  steps: StepDescriptor[];
  alternatives: AlternativePath[];
  trace: ReasoningTrace;
  hasKnowledge: boolean;
  contextCount: number;
  evidenceCount: number;
};

/**
 * Run the full reasoning pipeline: context loading, chain construction,
 * evidence aggregation, constraint evaluation, confidence scoring, alternative
 * paths and reasoning trace. Deterministic and side-effect free.
 */
export function runReasoning(input: ReasoningInput): ReasoningOutcome {
  const context = aggregateContext(input.contexts);
  const evidence = aggregateEvidence(input.evidence);
  const constraint = evaluateConstraints(input.constraints);

  const confidence = scoreConfidence({
    mode: input.mode,
    contextConfidence: context.confidence,
    evidenceConfidence: evidence.confidence,
    constraintRatio: constraint.ratio,
    founderPresent: input.founderPresent,
  });
  const verdict = resolveVerdict(confidence, constraint.constraintsSatisfied);
  const alternatives = deriveAlternativePaths(input.mode, {
    contextConfidence: context.confidence,
    evidenceConfidence: evidence.confidence,
    constraintRatio: constraint.ratio,
    founderPresent: input.founderPresent,
  });

  const steps: StepDescriptor[] = [
    {
      kind: 'CONTEXT_LOADING',
      sequence: 0,
      summary: `Loaded ${context.count} context reference(s)`,
      confidence: context.confidence,
      output: { count: context.count, runtimes: context.runtimes, confidence: context.confidence },
    },
    {
      kind: 'CHAIN_CONSTRUCTION',
      sequence: 1,
      summary: `Constructed ${input.mode} reasoning chain`,
      confidence: context.confidence,
      output: { mode: input.mode, stages: REASONING_STAGES.length },
    },
    {
      kind: 'EVIDENCE_AGGREGATION',
      sequence: 2,
      summary: `Aggregated ${evidence.count} evidence item(s)`,
      confidence: evidence.confidence,
      output: { count: evidence.count, confidence: evidence.confidence },
    },
    {
      kind: 'CONSTRAINT_EVALUATION',
      sequence: 3,
      summary: `Evaluated ${constraint.total} constraint(s)`,
      confidence: constraint.ratio,
      output: {
        ratio: constraint.ratio,
        satisfied: constraint.constraintsSatisfied,
        violations: constraint.violations,
      },
    },
    {
      kind: 'CONFIDENCE_SCORING',
      sequence: 4,
      summary: `Scored confidence at ${confidence.toFixed(2)}`,
      confidence,
      output: { confidence },
    },
    {
      kind: 'ALTERNATIVE_PATHS',
      sequence: 5,
      summary: `Derived ${alternatives.length} alternative path(s)`,
      confidence,
      output: { alternatives },
    },
    {
      kind: 'REASONING_TRACE',
      sequence: 6,
      summary: 'Assembled reasoning trace',
      confidence,
      output: {},
    },
  ];
  const trace = buildReasoningTrace(steps);
  steps[steps.length - 1].output = { trace };

  const conclusion = `Reasoning ${verdict.toLowerCase()} (confidence ${confidence.toFixed(
    2,
  )}) for "${input.question}" under ${input.mode} mode.`;

  return {
    mode: input.mode,
    contextConfidence: context.confidence,
    evidenceConfidence: evidence.confidence,
    constraintRatio: constraint.ratio,
    constraintsSatisfied: constraint.constraintsSatisfied,
    violations: constraint.violations,
    confidence,
    verdict,
    conclusion,
    steps,
    alternatives,
    trace,
    hasKnowledge: context.hasKnowledge,
    contextCount: context.count,
    evidenceCount: evidence.count,
  };
}

// ----------------------------------------------------------------------
// Part D — reasoning validation
// ----------------------------------------------------------------------

export type ValidationInput = {
  mode: ReasoningMode;
  contextConfidence: number;
  evidenceConfidence: number;
  evidenceCount: number;
  hasKnowledge: boolean;
  constraintsSatisfied: boolean;
  hasConstitutionalRef: boolean;
  founderAuthorityValid: boolean;
};

export type ValidationCheck = {
  kind: 'CONSTITUTIONAL' | 'TRUST' | 'EVIDENCE' | 'KNOWLEDGE' | 'CONSISTENCY';
  valid: boolean;
  issue: string | null;
};

export type ReasoningValidationResult = {
  valid: boolean;
  checks: ValidationCheck[];
  issues: string[];
};

/**
 * Validate a reasoning outcome across the five constitutional dimensions
 * (Part D): constitutional, trust, evidence, knowledge and consistency.
 */
export function validateReasoning(input: ValidationInput): ReasoningValidationResult {
  const founderModes: ReasoningMode[] = ['CONSTITUTIONAL', 'FOUNDER_GUIDED'];
  const constitutionalValid =
    input.hasConstitutionalRef &&
    (!founderModes.includes(input.mode) || input.founderAuthorityValid);
  const trustValid = input.contextConfidence >= VALIDATION_THRESHOLDS.TRUST;
  const evidenceValid =
    input.evidenceCount > 0 && input.evidenceConfidence >= VALIDATION_THRESHOLDS.EVIDENCE;
  const knowledgeValid = input.hasKnowledge;
  const consistencyValid = input.constraintsSatisfied;

  const checks: ValidationCheck[] = [
    {
      kind: 'CONSTITUTIONAL',
      valid: constitutionalValid,
      issue: constitutionalValid
        ? null
        : 'Missing constitutional reference or founder authority for this mode',
    },
    {
      kind: 'TRUST',
      valid: trustValid,
      issue: trustValid ? null : 'Context trust below the minimum threshold',
    },
    {
      kind: 'EVIDENCE',
      valid: evidenceValid,
      issue: evidenceValid ? null : 'Insufficient or low-confidence evidence',
    },
    {
      kind: 'KNOWLEDGE',
      valid: knowledgeValid,
      issue: knowledgeValid ? null : 'No knowledge-bearing context reference (D16/D11/D12)',
    },
    {
      kind: 'CONSISTENCY',
      valid: consistencyValid,
      issue: consistencyValid ? null : 'Required constraints are not satisfied',
    },
  ];

  const issues = checks.filter((c) => !c.valid).map((c) => c.issue as string);
  return { valid: issues.length === 0, checks, issues };
}

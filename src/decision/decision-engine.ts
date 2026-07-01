import { DecisionMode, DecisionRiskLevel, DecisionVerdictKind } from '@prisma/client';
import {
  DECISION_MODE_PROFILES,
  DECISION_STAGES,
  MAX_ALTERNATIVES,
  NEUTRAL_SIGNAL,
  RISK_THRESHOLDS,
  VALIDATION_THRESHOLDS,
  VERDICT_THRESHOLDS,
  type DecisionModeProfile,
} from './decision.constants';

/**
 * Decision engine — pure, deterministic, side-effect free.
 *
 * The engine generates candidates, scores them against the mode profile,
 * applies constitutional filtering and constraint evaluation, evaluates risk,
 * scores confidence, selects the winner, ranks alternatives and builds a
 * decision trace. Persistence, audit and evidence live in the service layer.
 * It determines the constitutionally valid decision only — it never executes.
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

export type CandidateSignal = {
  label: string;
  description?: string | null;
  weight?: number;
  benefit?: number;
  cost?: number;
  admissible?: boolean;
  reasoningConfidence?: number | null;
  planningReadiness?: number | null;
  capitalSupport?: number | null;
  constraintsSatisfied?: boolean;
  referenceId?: string | null;
  referenceType?: string | null;
};

export type ConstraintSignal = {
  name: string;
  satisfied: boolean;
  weight?: number;
  required?: boolean;
  category?: string | null;
};

export type ContextSignal = {
  runtime: string;
  role: string;
  weight?: number;
  confidence?: number;
  referenceId?: string | null;
  referenceType?: string | null;
  summary?: string | null;
};

// ----------------------------------------------------------------------
// Part B — mode profiles
// ----------------------------------------------------------------------

/** Resolve the weight profile for a decision mode. */
export function resolveDecisionProfile(mode: DecisionMode): DecisionModeProfile {
  return DECISION_MODE_PROFILES[mode];
}

// ----------------------------------------------------------------------
// Part C — context loading
// ----------------------------------------------------------------------

export type ContextAggregate = {
  confidence: number;
  count: number;
  runtimes: string[];
  hasReasoning: boolean;
  hasPlanning: boolean;
  hasKnowledge: boolean;
  hasCapital: boolean;
  capitalSupport: number;
};

const KNOWLEDGE_RUNTIMES = new Set(['D16', 'KNOWLEDGE', 'D11', 'D12']);
const CAPITAL_RUNTIMES = new Set(['CAPITAL', 'D13', 'IUC', 'IFC']);

/** Aggregate the loaded context into a single weighted confidence. */
export function aggregateContext(contexts: ContextSignal[]): ContextAggregate {
  if (!contexts.length) {
    return {
      confidence: 0,
      count: 0,
      runtimes: [],
      hasReasoning: false,
      hasPlanning: false,
      hasKnowledge: false,
      hasCapital: false,
      capitalSupport: 0,
    };
  }
  let weightSum = 0;
  let weighted = 0;
  let capitalWeightSum = 0;
  let capitalWeighted = 0;
  const runtimes = new Set<string>();
  let hasReasoning = false;
  let hasPlanning = false;
  let hasKnowledge = false;
  let hasCapital = false;
  for (const c of contexts) {
    const w = Number.isFinite(c.weight) && (c.weight ?? 0) > 0 ? (c.weight as number) : 1;
    const conf = clamp01(c.confidence ?? 1);
    weightSum += w;
    weighted += w * conf;
    const runtime = c.runtime.toUpperCase();
    runtimes.add(c.runtime);
    if (runtime === 'REASONING') hasReasoning = true;
    if (runtime === 'PLANNING') hasPlanning = true;
    if (KNOWLEDGE_RUNTIMES.has(runtime)) hasKnowledge = true;
    if (CAPITAL_RUNTIMES.has(runtime)) {
      hasCapital = true;
      capitalWeightSum += w;
      capitalWeighted += w * conf;
    }
  }
  const confidence = weightSum > 0 ? clamp01(weighted / weightSum) : 0;
  const capitalSupport = capitalWeightSum > 0 ? clamp01(capitalWeighted / capitalWeightSum) : 0;
  return {
    confidence,
    count: contexts.length,
    runtimes: Array.from(runtimes),
    hasReasoning,
    hasPlanning,
    hasKnowledge,
    hasCapital,
    capitalSupport,
  };
}

// ----------------------------------------------------------------------
// Part C — constraint evaluation (session level)
// ----------------------------------------------------------------------

export type ConstraintAnalysis = {
  ratio: number;
  total: number;
  satisfiedCount: number;
  constraintsSatisfied: boolean;
  violations: string[];
};

/**
 * Evaluate the session-level constraint set. When no constraints are supplied
 * the set is vacuously satisfied (ratio 1). Required-but-unsatisfied
 * constraints mark the whole analysis as unsatisfied.
 */
export function analyzeConstraints(constraints: ConstraintSignal[]): ConstraintAnalysis {
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
      if (c.required !== false) requiredViolation = true;
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
// Part C — candidate generation + scoring + constitutional filtering + risk
// ----------------------------------------------------------------------

export type ScoredCandidate = {
  label: string;
  description: string | null;
  index: number;
  weight: number;
  benefit: number;
  cost: number;
  admissible: boolean;
  reasoningConfidence: number;
  planningReadiness: number;
  capitalSupport: number;
  constraintsSatisfied: boolean;
  score: number;
  benefitScore: number;
  riskScore: number;
  riskLevel: DecisionRiskLevel;
  constitutionalPass: boolean;
  constraintPass: boolean;
  selected: boolean;
  status: 'FILTERED' | 'EVALUATED' | 'SELECTED' | 'REJECTED';
  rationale: string;
  referenceId: string | null;
  referenceType: string | null;
};

export type CandidateScoreInput = {
  mode: DecisionMode;
  contextConfidence: number;
  fallbackCapitalSupport: number;
  founderPresent: boolean;
};

/**
 * Score a single candidate against the mode profile (candidate scoring). All
 * sub-signals are clamped to [0,1]; missing reasoning / planning / capital
 * signals fall back to a neutral prior.
 */
export function scoreCandidate(candidate: CandidateSignal, input: CandidateScoreInput): number {
  const profile = resolveDecisionProfile(input.mode);
  const benefit = clamp01(candidate.benefit ?? NEUTRAL_SIGNAL);
  const reasoning = clamp01(candidate.reasoningConfidence ?? NEUTRAL_SIGNAL);
  const planning = clamp01(candidate.planningReadiness ?? NEUTRAL_SIGNAL);
  const capital = clamp01(
    candidate.capitalSupport ?? input.fallbackCapitalSupport ?? NEUTRAL_SIGNAL,
  );
  const constraintPass = candidate.constraintsSatisfied !== false ? 1 : 0;
  let score =
    profile.benefitWeight * benefit +
    profile.reasoningWeight * reasoning +
    profile.planningWeight * planning +
    profile.capitalWeight * capital +
    profile.constraintWeight * constraintPass +
    profile.contextWeight * clamp01(input.contextConfidence);
  if (profile.founderWeight > 0) {
    score += profile.founderWeight * (input.founderPresent ? 1 : 0);
  }
  return clamp01(score);
}

/** Estimate a candidate's risk. Higher score means higher risk. */
export function estimateCandidateRisk(candidate: CandidateSignal): {
  riskScore: number;
  riskLevel: DecisionRiskLevel;
} {
  const benefit = clamp01(candidate.benefit ?? NEUTRAL_SIGNAL);
  const cost = clamp01(candidate.cost ?? 0);
  const constraintPenalty = candidate.constraintsSatisfied === false ? 0.3 : 0;
  const riskScore = clamp01((1 - benefit) * 0.35 + cost * 0.35 + constraintPenalty);
  return { riskScore, riskLevel: resolveRiskLevel(riskScore) };
}

/** Map a risk score onto a risk band. */
export function resolveRiskLevel(riskScore: number): DecisionRiskLevel {
  if (riskScore <= RISK_THRESHOLDS.LOW) return 'LOW';
  if (riskScore <= RISK_THRESHOLDS.MODERATE) return 'MODERATE';
  if (riskScore <= RISK_THRESHOLDS.ELEVATED) return 'ELEVATED';
  return 'CRITICAL';
}

export type CandidateEvaluation = {
  candidates: ScoredCandidate[];
  admissibleCount: number;
  filteredCount: number;
  winner: ScoredCandidate | null;
};

/**
 * Generate, score, constitutionally filter and rank the candidate set
 * (candidate generation, candidate scoring, constitutional filtering,
 * constraint evaluation, risk evaluation, winner selection, alternative
 * ranking). Inadmissible candidates are filtered out of winner selection.
 */
export function evaluateCandidates(
  candidates: CandidateSignal[],
  input: CandidateScoreInput,
): CandidateEvaluation {
  const scored: ScoredCandidate[] = candidates.map((candidate, index) => {
    const admissible = candidate.admissible !== false;
    const constraintPass = candidate.constraintsSatisfied !== false;
    const score = scoreCandidate(candidate, input);
    const risk = estimateCandidateRisk(candidate);
    return {
      label: candidate.label,
      description: candidate.description ?? null,
      index,
      weight:
        Number.isFinite(candidate.weight) && (candidate.weight ?? 0) > 0
          ? (candidate.weight as number)
          : 1,
      benefit: clamp01(candidate.benefit ?? NEUTRAL_SIGNAL),
      cost: clamp01(candidate.cost ?? 0),
      admissible,
      reasoningConfidence: clamp01(candidate.reasoningConfidence ?? NEUTRAL_SIGNAL),
      planningReadiness: clamp01(candidate.planningReadiness ?? NEUTRAL_SIGNAL),
      capitalSupport: clamp01(
        candidate.capitalSupport ?? input.fallbackCapitalSupport ?? NEUTRAL_SIGNAL,
      ),
      constraintsSatisfied: constraintPass,
      score,
      benefitScore: clamp01(candidate.benefit ?? NEUTRAL_SIGNAL),
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      constitutionalPass: admissible,
      constraintPass,
      selected: false,
      status: admissible ? 'EVALUATED' : 'FILTERED',
      rationale: admissible
        ? `Scored ${score.toFixed(2)} under ${input.mode} mode (risk ${risk.riskLevel.toLowerCase()})`
        : 'Filtered: candidate is not constitutionally admissible',
      referenceId: candidate.referenceId ?? null,
      referenceType: candidate.referenceType ?? null,
    };
  });

  const admissible = scored.filter((c) => c.admissible);
  admissible.sort((a, b) => b.score - a.score || a.riskScore - b.riskScore || a.index - b.index);

  const winner = admissible.length ? admissible[0] : null;
  if (winner) {
    winner.selected = true;
    winner.status = 'SELECTED';
    for (const c of admissible.slice(1)) c.status = 'REJECTED';
  }

  return {
    candidates: scored,
    admissibleCount: admissible.length,
    filteredCount: scored.length - admissible.length,
    winner,
  };
}

// ----------------------------------------------------------------------
// Part C — verdict resolution
// ----------------------------------------------------------------------

/**
 * Resolve the decision verdict from the winner, session constraint
 * satisfaction and winner risk. With no admissible candidate the decision is
 * blocked; critical risk defers; unsatisfied required constraints contest.
 */
export function resolveVerdict(
  winner: ScoredCandidate | null,
  constraintsSatisfied: boolean,
  admissibleCount: number,
): DecisionVerdictKind {
  if (!winner || admissibleCount === 0) return 'BLOCKED';
  if (winner.riskLevel === 'CRITICAL') return 'DEFERRED';
  if (!constraintsSatisfied) return 'CONTESTED';
  if (winner.score >= VERDICT_THRESHOLDS.SELECTED) return 'SELECTED';
  if (winner.score >= VERDICT_THRESHOLDS.CONTESTED) return 'CONTESTED';
  return 'DEFERRED';
}

// ----------------------------------------------------------------------
// Part C — alternative ranking
// ----------------------------------------------------------------------

export type RankedAlternative = {
  label: string;
  score: number;
  riskLevel: DecisionRiskLevel;
  rationale: string;
};

/** Rank the admissible non-winning candidates, bounded to MAX_ALTERNATIVES. */
export function rankAlternatives(evaluation: CandidateEvaluation): RankedAlternative[] {
  return evaluation.candidates
    .filter((c) => c.admissible && !c.selected)
    .sort((a, b) => b.score - a.score || a.riskScore - b.riskScore)
    .slice(0, MAX_ALTERNATIVES)
    .map((c) => ({
      label: c.label,
      score: c.score,
      riskLevel: c.riskLevel,
      rationale: c.rationale,
    }));
}

// ----------------------------------------------------------------------
// Full decision run (orchestrates Part C end to end)
// ----------------------------------------------------------------------

export type DecisionTrace = {
  stages: string[];
  summary: string;
};

export type DecisionInput = {
  mode: DecisionMode;
  objective: string;
  candidates: CandidateSignal[];
  constraints: ConstraintSignal[];
  contexts: ContextSignal[];
  founderPresent?: boolean;
};

export type DecisionOutcome = {
  mode: DecisionMode;
  verdict: DecisionVerdictKind;
  confidence: number;
  riskScore: number;
  riskLevel: DecisionRiskLevel;
  constraintRatio: number;
  constraintsSatisfied: boolean;
  contextConfidence: number;
  capitalSupport: number;
  hasReasoning: boolean;
  hasPlanning: boolean;
  hasKnowledge: boolean;
  hasCapital: boolean;
  candidateCount: number;
  admissibleCount: number;
  filteredCount: number;
  candidates: ScoredCandidate[];
  winner: ScoredCandidate | null;
  alternatives: RankedAlternative[];
  trace: DecisionTrace;
  violations: string[];
  summary: string;
};

/**
 * Run the full decision pipeline: candidate generation, candidate scoring,
 * constitutional filtering, constraint evaluation, risk evaluation, confidence
 * scoring, winner selection, alternative ranking and decision trace.
 * Deterministic and side-effect free. It decides — it never executes.
 */
export function runDecision(input: DecisionInput): DecisionOutcome {
  const context = aggregateContext(input.contexts);
  const constraint = analyzeConstraints(input.constraints);
  const founderPresent = Boolean(input.founderPresent);

  const evaluation = evaluateCandidates(input.candidates, {
    mode: input.mode,
    contextConfidence: context.confidence,
    fallbackCapitalSupport: context.capitalSupport,
    founderPresent,
  });

  const verdict = resolveVerdict(
    evaluation.winner,
    constraint.constraintsSatisfied,
    evaluation.admissibleCount,
  );
  const alternatives = rankAlternatives(evaluation);

  const winner = evaluation.winner;
  const confidence = winner ? winner.score : 0;
  const riskScore = winner ? winner.riskScore : 1;
  const riskLevel = winner ? winner.riskLevel : 'CRITICAL';

  const trace: DecisionTrace = {
    stages: [...DECISION_STAGES],
    summary: DECISION_STAGES.join(' -> '),
  };

  const summary = winner
    ? `Verdict ${verdict.toLowerCase()} — "${winner.label}" selected (confidence ${confidence.toFixed(
        2,
      )}, risk ${riskLevel.toLowerCase()}) for "${input.objective}" under ${input.mode} mode.`
    : `Verdict ${verdict.toLowerCase()} — no constitutionally admissible candidate for "${input.objective}" under ${input.mode} mode.`;

  return {
    mode: input.mode,
    verdict,
    confidence,
    riskScore,
    riskLevel,
    constraintRatio: constraint.ratio,
    constraintsSatisfied: constraint.constraintsSatisfied,
    contextConfidence: context.confidence,
    capitalSupport: context.capitalSupport,
    hasReasoning: context.hasReasoning,
    hasPlanning: context.hasPlanning,
    hasKnowledge: context.hasKnowledge,
    hasCapital: context.hasCapital,
    candidateCount: input.candidates.length,
    admissibleCount: evaluation.admissibleCount,
    filteredCount: evaluation.filteredCount,
    candidates: evaluation.candidates,
    winner,
    alternatives,
    trace,
    violations: constraint.violations,
    summary,
  };
}

// ----------------------------------------------------------------------
// Part D — decision validation
// ----------------------------------------------------------------------

export type ValidationInput = {
  mode: DecisionMode;
  hasConstitutionalRef: boolean;
  founderAuthorityValid: boolean;
  admissibleCount: number;
  evidencePresent: boolean;
  contextConfidence: number;
  hasReasoning: boolean;
  hasPlanning: boolean;
  capitalSupport: number;
};

export type ValidationCheck = {
  kind: 'CONSTITUTIONAL' | 'FOUNDER' | 'EVIDENCE' | 'REASONING' | 'PLANNING' | 'CAPITAL';
  valid: boolean;
  issue: string | null;
};

export type DecisionValidationResult = {
  valid: boolean;
  checks: ValidationCheck[];
  issues: string[];
};

/**
 * Validate a decision outcome across the six constitutional dimensions
 * (Part D): constitutional, founder alignment, evidence, reasoning, planning
 * and capital.
 */
export function validateDecision(input: ValidationInput): DecisionValidationResult {
  const founderModes: DecisionMode[] = ['FOUNDER', 'CONSTITUTIONAL'];
  const founderMode = founderModes.includes(input.mode);
  const constitutionalValid =
    input.hasConstitutionalRef &&
    input.admissibleCount > 0 &&
    (!founderMode || input.founderAuthorityValid);
  const founderValid = !founderMode || input.founderAuthorityValid;
  const evidenceValid =
    input.evidencePresent || input.contextConfidence >= VALIDATION_THRESHOLDS.EVIDENCE;
  const reasoningValid = input.hasReasoning;
  const planningValid = input.hasPlanning;
  const capitalValid = input.capitalSupport >= VALIDATION_THRESHOLDS.CAPITAL;

  const checks: ValidationCheck[] = [
    {
      kind: 'CONSTITUTIONAL',
      valid: constitutionalValid,
      issue: constitutionalValid
        ? null
        : 'Missing constitutional reference, admissible candidate, or founder authority for this mode',
    },
    {
      kind: 'FOUNDER',
      valid: founderValid,
      issue: founderValid ? null : 'Founder authority is required but not present for this mode',
    },
    {
      kind: 'EVIDENCE',
      valid: evidenceValid,
      issue: evidenceValid ? null : 'No supporting evidence and context confidence below threshold',
    },
    {
      kind: 'REASONING',
      valid: reasoningValid,
      issue: reasoningValid ? null : 'No reasoning context was supplied to the decision',
    },
    {
      kind: 'PLANNING',
      valid: planningValid,
      issue: planningValid ? null : 'No planning context was supplied to the decision',
    },
    {
      kind: 'CAPITAL',
      valid: capitalValid,
      issue: capitalValid ? null : 'Capital support below the minimum threshold',
    },
  ];

  const issues = checks.filter((c) => !c.valid).map((c) => c.issue as string);
  return { valid: issues.length === 0, checks, issues };
}

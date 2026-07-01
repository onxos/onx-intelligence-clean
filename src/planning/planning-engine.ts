import { PlanningMode, PlanningReadiness, PlanningRiskLevel } from '@prisma/client';
import {
  DEFAULT_STEP_DURATION,
  MAX_ALTERNATIVE_PLANS,
  PLANNING_MODE_PROFILES,
  PLANNING_STAGES,
  READINESS_THRESHOLDS,
  RISK_THRESHOLDS,
  STEPS_PER_GOAL,
  VALIDATION_THRESHOLDS,
  type PlanningModeProfile,
} from './planning.constants';

/**
 * Planning engine — pure, deterministic, side-effect free.
 *
 * The engine decomposes goals, analyses constraints, generates a strategy,
 * constructs a dependency graph of executable steps, estimates resources and
 * timeline, generates milestones, estimates risk, scores confidence and
 * derives alternative plans. Persistence, audit and evidence live in the
 * service layer. It prepares plans only — it never decides.
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

export type GoalSignal = {
  title: string;
  description?: string | null;
  priority?: number;
  weight?: number;
  measurable?: boolean;
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

export type ResourceSignal = {
  name: string;
  required?: boolean;
  available?: boolean;
  demand?: number;
  capacity?: number;
};

// ----------------------------------------------------------------------
// Part B — mode profiles
// ----------------------------------------------------------------------

/** Resolve the weight profile for a planning mode. */
export function resolvePlanningProfile(mode: PlanningMode): PlanningModeProfile {
  return PLANNING_MODE_PROFILES[mode];
}

// ----------------------------------------------------------------------
// Part C — context loading
// ----------------------------------------------------------------------

export type ContextAggregate = {
  confidence: number;
  count: number;
  runtimes: string[];
  hasKnowledge: boolean;
  hasReasoning: boolean;
};

const KNOWLEDGE_RUNTIMES = new Set(['D16', 'KNOWLEDGE', 'D11', 'D12']);

/** Aggregate the loaded context into a single weighted confidence. */
export function aggregateContext(contexts: ContextSignal[]): ContextAggregate {
  if (!contexts.length) {
    return { confidence: 0, count: 0, runtimes: [], hasKnowledge: false, hasReasoning: false };
  }
  let weightSum = 0;
  let weighted = 0;
  const runtimes = new Set<string>();
  let hasKnowledge = false;
  let hasReasoning = false;
  for (const c of contexts) {
    const w = Number.isFinite(c.weight) && (c.weight ?? 0) > 0 ? (c.weight as number) : 1;
    const conf = clamp01(c.confidence ?? 1);
    weightSum += w;
    weighted += w * conf;
    const runtime = c.runtime.toUpperCase();
    runtimes.add(c.runtime);
    if (KNOWLEDGE_RUNTIMES.has(runtime)) hasKnowledge = true;
    if (runtime === 'REASONING') hasReasoning = true;
  }
  const confidence = weightSum > 0 ? clamp01(weighted / weightSum) : 0;
  return {
    confidence,
    count: contexts.length,
    runtimes: Array.from(runtimes),
    hasKnowledge,
    hasReasoning,
  };
}

// ----------------------------------------------------------------------
// Part C — goal decomposition
// ----------------------------------------------------------------------

export type DecomposedStep = {
  title: string;
  description: string;
  goalReference: string;
  sequence: number;
  durationEstimate: number;
  resourceEstimate: number;
  confidence: number;
};

export type DecomposedGoal = {
  title: string;
  priority: number;
  weight: number;
  measurable: boolean;
  clarity: number;
  stepCount: number;
  referenceId?: string | null;
  referenceType?: string | null;
};

export type GoalDecomposition = {
  goals: DecomposedGoal[];
  steps: DecomposedStep[];
  goalConfidence: number;
  count: number;
};

const STEP_VERBS = ['Prepare', 'Execute', 'Verify', 'Consolidate'];

/**
 * Decompose the requested goals into ordered executable steps. Higher-priority
 * goals are sequenced first. Goal clarity blends description presence and
 * measurability into a per-goal confidence, weighted by goal weight.
 */
export function decomposeGoals(goals: GoalSignal[]): GoalDecomposition {
  if (!goals.length) {
    return { goals: [], steps: [], goalConfidence: 0, count: 0 };
  }
  const ordered = goals
    .map((g, index) => ({ g, index }))
    .sort((a, b) => (b.g.priority ?? 0) - (a.g.priority ?? 0) || a.index - b.index);

  const decomposedGoals: DecomposedGoal[] = [];
  const steps: DecomposedStep[] = [];
  let weightSum = 0;
  let weightedClarity = 0;
  let sequence = 0;

  for (const { g } of ordered) {
    const weight = Number.isFinite(g.weight) && (g.weight ?? 0) > 0 ? (g.weight as number) : 1;
    const clarity = clamp01(0.6 + (g.description?.trim() ? 0.2 : 0) + (g.measurable ? 0.2 : 0));
    weightSum += weight;
    weightedClarity += weight * clarity;

    for (let i = 0; i < STEPS_PER_GOAL; i += 1) {
      const verb = STEP_VERBS[i] ?? `Advance-${i + 1}`;
      steps.push({
        title: `${verb}: ${g.title}`,
        description: `${verb} phase for goal "${g.title}"`,
        goalReference: g.title,
        sequence,
        durationEstimate: DEFAULT_STEP_DURATION,
        resourceEstimate: clamp01(weight),
        confidence: clarity,
      });
      sequence += 1;
    }

    decomposedGoals.push({
      title: g.title,
      priority: g.priority ?? 0,
      weight,
      measurable: Boolean(g.measurable),
      clarity,
      stepCount: STEPS_PER_GOAL,
      referenceId: g.referenceId ?? null,
      referenceType: g.referenceType ?? null,
    });
  }

  const goalConfidence = weightSum > 0 ? clamp01(weightedClarity / weightSum) : 0;
  return { goals: decomposedGoals, steps, goalConfidence, count: goals.length };
}

// ----------------------------------------------------------------------
// Part C — constraint analysis
// ----------------------------------------------------------------------

export type ConstraintAnalysis = {
  ratio: number;
  total: number;
  satisfiedCount: number;
  constraintsSatisfied: boolean;
  violations: string[];
};

/**
 * Analyse the constraint set. When no constraints are supplied the set is
 * vacuously satisfied (ratio 1). Required-but-unsatisfied constraints mark the
 * whole analysis as unsatisfied and block the plan.
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
// Part C — resource estimation
// ----------------------------------------------------------------------

export type ResourceEstimation = {
  feasibility: number;
  total: number;
  satisfiedCount: number;
  shortfalls: string[];
};

/**
 * Estimate resource feasibility. When no resources are supplied feasibility is
 * vacuously 1. A resource is feasible when it is available and, if demand and
 * capacity are supplied, capacity covers demand.
 */
export function estimateResources(resources: ResourceSignal[]): ResourceEstimation {
  if (!resources.length) {
    return { feasibility: 1, total: 0, satisfiedCount: 0, shortfalls: [] };
  }
  let satisfiedCount = 0;
  const shortfalls: string[] = [];
  for (const r of resources) {
    const available = r.available !== false;
    const covered =
      r.demand == null || r.capacity == null ? true : (r.capacity ?? 0) >= (r.demand ?? 0);
    if (available && covered) {
      satisfiedCount += 1;
    } else {
      shortfalls.push(r.name);
    }
  }
  return {
    feasibility: clamp01(satisfiedCount / resources.length),
    total: resources.length,
    satisfiedCount,
    shortfalls,
  };
}

// ----------------------------------------------------------------------
// Part C — dependency graph
// ----------------------------------------------------------------------

export type DependencyEdge = { from: number; to: number };

export type DependencyGraph = {
  nodes: number;
  edges: DependencyEdge[];
  depth: number;
  cyclic: boolean;
};

/**
 * Build a linear dependency graph over the ordered steps: each step depends on
 * its predecessor. The result is always acyclic; depth equals the step count.
 */
export function buildDependencyGraph(steps: DecomposedStep[]): DependencyGraph {
  const edges: DependencyEdge[] = [];
  for (let i = 1; i < steps.length; i += 1) {
    edges.push({ from: i - 1, to: i });
  }
  return { nodes: steps.length, edges, depth: steps.length, cyclic: false };
}

// ----------------------------------------------------------------------
// Part C — timeline generation
// ----------------------------------------------------------------------

export type Timeline = {
  totalDuration: number;
  phases: { sequence: number; title: string; startOffset: number; endOffset: number }[];
};

/**
 * Generate a serial timeline from the ordered steps. Each step starts when its
 * predecessor completes; the total duration is the sum of step durations.
 */
export function generateTimeline(steps: DecomposedStep[]): Timeline {
  let cursor = 0;
  const phases = steps.map((step) => {
    const startOffset = cursor;
    cursor += step.durationEstimate;
    return { sequence: step.sequence, title: step.title, startOffset, endOffset: cursor };
  });
  return { totalDuration: cursor, phases };
}

// ----------------------------------------------------------------------
// Part C — milestone generation
// ----------------------------------------------------------------------

export type Milestone = {
  sequence: number;
  title: string;
  criteria: string;
  targetOffset: number;
};

/**
 * Generate one milestone per decomposed goal, positioned at the cumulative
 * duration of that goal's steps.
 */
export function generateMilestones(goals: DecomposedGoal[], timeline: Timeline): Milestone[] {
  const milestones: Milestone[] = [];
  let stepCursor = 0;
  let sequence = 0;
  for (const goal of goals) {
    stepCursor += goal.stepCount;
    const phase = timeline.phases[Math.min(stepCursor, timeline.phases.length) - 1];
    milestones.push({
      sequence,
      title: `Milestone: ${goal.title}`,
      criteria: `Goal "${goal.title}" completed and verified`,
      targetOffset: phase ? phase.endOffset : 0,
    });
    sequence += 1;
  }
  return milestones;
}

// ----------------------------------------------------------------------
// Part C — risk estimation
// ----------------------------------------------------------------------

export type RiskInput = {
  constraintRatio: number;
  resourceFeasibility: number;
  contextConfidence: number;
  hasKnowledge: boolean;
};

export type RiskEstimate = {
  riskScore: number;
  riskLevel: PlanningRiskLevel;
};

/** Estimate the aggregate plan risk. Higher score means higher risk. */
export function estimateRisk(input: RiskInput): RiskEstimate {
  let risk =
    (1 - clamp01(input.constraintRatio)) * 0.4 +
    (1 - clamp01(input.resourceFeasibility)) * 0.35 +
    (1 - clamp01(input.contextConfidence)) * 0.25;
  if (!input.hasKnowledge) risk += 0.1;
  const riskScore = clamp01(risk);
  return { riskScore, riskLevel: resolveRiskLevel(riskScore) };
}

/** Map a risk score onto a risk band. */
export function resolveRiskLevel(riskScore: number): PlanningRiskLevel {
  if (riskScore <= RISK_THRESHOLDS.LOW) return 'LOW';
  if (riskScore <= RISK_THRESHOLDS.MODERATE) return 'MODERATE';
  if (riskScore <= RISK_THRESHOLDS.ELEVATED) return 'ELEVATED';
  return 'CRITICAL';
}

// ----------------------------------------------------------------------
// Part C — confidence scoring + readiness
// ----------------------------------------------------------------------

export type ConfidenceInput = {
  mode: PlanningMode;
  goalConfidence: number;
  constraintRatio: number;
  resourceFeasibility: number;
  riskScore: number;
  contextConfidence: number;
  founderPresent?: boolean;
};

/** Blend the sub-signals into a single plan confidence via the mode profile. */
export function scorePlanConfidence(input: ConfidenceInput): number {
  const profile = resolvePlanningProfile(input.mode);
  let score =
    profile.goalWeight * clamp01(input.goalConfidence) +
    profile.constraintWeight * clamp01(input.constraintRatio) +
    profile.resourceWeight * clamp01(input.resourceFeasibility) +
    profile.riskWeight * (1 - clamp01(input.riskScore)) +
    profile.contextWeight * clamp01(input.contextConfidence);
  if (profile.founderWeight > 0) {
    score += profile.founderWeight * (input.founderPresent ? 1 : 0);
  }
  return clamp01(score);
}

/**
 * Resolve plan readiness from confidence + constraint satisfaction + risk.
 * A plan is blocked when required constraints fail or risk is critical.
 */
export function resolveReadiness(
  confidence: number,
  constraintsSatisfied: boolean,
  riskLevel: PlanningRiskLevel,
): PlanningReadiness {
  if (!constraintsSatisfied || riskLevel === 'CRITICAL') return 'BLOCKED';
  if (confidence >= READINESS_THRESHOLDS.EXECUTABLE) return 'EXECUTABLE';
  if (confidence >= READINESS_THRESHOLDS.CONDITIONAL) return 'CONDITIONAL';
  return 'BLOCKED';
}

// ----------------------------------------------------------------------
// Part C — alternative plans
// ----------------------------------------------------------------------

export type AlternativePlan = {
  mode: PlanningMode;
  confidence: number;
  readiness: PlanningReadiness;
  rationale: string;
};

/**
 * Derive alternative plans by re-scoring the same signals under every other
 * mode, ranked by confidence. Bounded to MAX_ALTERNATIVE_PLANS.
 */
export function deriveAlternativePlans(
  primaryMode: PlanningMode,
  signals: {
    goalConfidence: number;
    constraintRatio: number;
    resourceFeasibility: number;
    riskScore: number;
    contextConfidence: number;
    founderPresent?: boolean;
  },
  constraintsSatisfied: boolean,
  riskLevel: PlanningRiskLevel,
): AlternativePlan[] {
  const modes = Object.keys(PLANNING_MODE_PROFILES) as PlanningMode[];
  return modes
    .filter((m) => m !== primaryMode)
    .map((mode) => {
      const confidence = scorePlanConfidence({ mode, ...signals });
      return {
        mode,
        confidence,
        readiness: resolveReadiness(confidence, constraintsSatisfied, riskLevel),
        rationale: `${PLANNING_MODE_PROFILES[mode].name} re-planning of the same goals and constraints`,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_ALTERNATIVE_PLANS);
}

// ----------------------------------------------------------------------
// Full planning run (orchestrates Part C end to end)
// ----------------------------------------------------------------------

export type StrategyDescriptor = {
  mode: PlanningMode;
  name: string;
  rationale: string;
  confidence: number;
};

export type PlanningTrace = {
  stages: string[];
  summary: string;
};

export type PlanningInput = {
  mode: PlanningMode;
  objective: string;
  goals: GoalSignal[];
  constraints: ConstraintSignal[];
  contexts: ContextSignal[];
  resources: ResourceSignal[];
  founderPresent?: boolean;
};

export type PlanningOutcome = {
  mode: PlanningMode;
  goalConfidence: number;
  constraintRatio: number;
  constraintsSatisfied: boolean;
  resourceFeasibility: number;
  contextConfidence: number;
  riskScore: number;
  riskLevel: PlanningRiskLevel;
  confidence: number;
  readiness: PlanningReadiness;
  summary: string;
  goals: DecomposedGoal[];
  steps: DecomposedStep[];
  dependencyGraph: DependencyGraph;
  timeline: Timeline;
  milestones: Milestone[];
  strategy: StrategyDescriptor;
  alternatives: AlternativePlan[];
  trace: PlanningTrace;
  violations: string[];
  shortfalls: string[];
  hasKnowledge: boolean;
  hasReasoning: boolean;
  goalCount: number;
  contextCount: number;
};

/**
 * Run the full planning pipeline: goal decomposition, constraint analysis,
 * strategy generation, dependency graph, resource estimation, timeline,
 * milestones, risk estimation, confidence scoring and alternative plans.
 * Deterministic and side-effect free. It prepares a plan — it never decides.
 */
export function runPlanning(input: PlanningInput): PlanningOutcome {
  const context = aggregateContext(input.contexts);
  const decomposition = decomposeGoals(input.goals);
  const constraint = analyzeConstraints(input.constraints);
  const resource = estimateResources(input.resources);
  const dependencyGraph = buildDependencyGraph(decomposition.steps);
  const timeline = generateTimeline(decomposition.steps);
  const milestones = generateMilestones(decomposition.goals, timeline);
  const risk = estimateRisk({
    constraintRatio: constraint.ratio,
    resourceFeasibility: resource.feasibility,
    contextConfidence: context.confidence,
    hasKnowledge: context.hasKnowledge,
  });

  const confidence = scorePlanConfidence({
    mode: input.mode,
    goalConfidence: decomposition.goalConfidence,
    constraintRatio: constraint.ratio,
    resourceFeasibility: resource.feasibility,
    riskScore: risk.riskScore,
    contextConfidence: context.confidence,
    founderPresent: input.founderPresent,
  });
  const readiness = resolveReadiness(confidence, constraint.constraintsSatisfied, risk.riskLevel);

  const strategy: StrategyDescriptor = {
    mode: input.mode,
    name: `${resolvePlanningProfile(input.mode).name} strategy`,
    rationale: `Strategy generated for "${input.objective}" across ${decomposition.count} goal(s) under ${input.mode} mode.`,
    confidence,
  };

  const alternatives = deriveAlternativePlans(
    input.mode,
    {
      goalConfidence: decomposition.goalConfidence,
      constraintRatio: constraint.ratio,
      resourceFeasibility: resource.feasibility,
      riskScore: risk.riskScore,
      contextConfidence: context.confidence,
      founderPresent: input.founderPresent,
    },
    constraint.constraintsSatisfied,
    risk.riskLevel,
  );

  const trace: PlanningTrace = {
    stages: [...PLANNING_STAGES],
    summary: PLANNING_STAGES.join(' -> '),
  };

  const summary = `Plan ${readiness.toLowerCase()} (confidence ${confidence.toFixed(
    2,
  )}, risk ${risk.riskLevel.toLowerCase()}) for "${input.objective}" under ${input.mode} mode.`;

  return {
    mode: input.mode,
    goalConfidence: decomposition.goalConfidence,
    constraintRatio: constraint.ratio,
    constraintsSatisfied: constraint.constraintsSatisfied,
    resourceFeasibility: resource.feasibility,
    contextConfidence: context.confidence,
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    confidence,
    readiness,
    summary,
    goals: decomposition.goals,
    steps: decomposition.steps,
    dependencyGraph,
    timeline,
    milestones,
    strategy,
    alternatives,
    trace,
    violations: constraint.violations,
    shortfalls: resource.shortfalls,
    hasKnowledge: context.hasKnowledge,
    hasReasoning: context.hasReasoning,
    goalCount: decomposition.count,
    contextCount: context.count,
  };
}

// ----------------------------------------------------------------------
// Part D — planning validation
// ----------------------------------------------------------------------

export type ValidationInput = {
  mode: PlanningMode;
  goalConfidence: number;
  goalCount: number;
  resourceFeasibility: number;
  constraintsSatisfied: boolean;
  dependencyCyclic: boolean;
  hasReasoning: boolean;
  riskLevel: PlanningRiskLevel;
  hasConstitutionalRef: boolean;
  founderAuthorityValid: boolean;
};

export type ValidationCheck = {
  kind: 'CONSTITUTIONAL' | 'RESOURCE' | 'DEPENDENCY' | 'GOAL' | 'RISK' | 'CONSISTENCY';
  valid: boolean;
  issue: string | null;
};

export type PlanningValidationResult = {
  valid: boolean;
  checks: ValidationCheck[];
  issues: string[];
};

/**
 * Validate a planning outcome across the six constitutional dimensions
 * (Part D): constitutional, resource, dependency, goal, risk and consistency.
 */
export function validatePlanning(input: ValidationInput): PlanningValidationResult {
  const founderModes: PlanningMode[] = ['FOUNDER', 'CONSTITUTIONAL'];
  const constitutionalValid =
    input.hasConstitutionalRef &&
    (!founderModes.includes(input.mode) || input.founderAuthorityValid);
  const resourceValid = input.resourceFeasibility >= VALIDATION_THRESHOLDS.RESOURCE;
  const dependencyValid = !input.dependencyCyclic;
  const goalValid = input.goalCount > 0 && input.goalConfidence >= VALIDATION_THRESHOLDS.GOAL;
  const riskValid = input.riskLevel !== 'CRITICAL';
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
      kind: 'RESOURCE',
      valid: resourceValid,
      issue: resourceValid ? null : 'Resource feasibility below the minimum threshold',
    },
    {
      kind: 'DEPENDENCY',
      valid: dependencyValid,
      issue: dependencyValid ? null : 'Dependency graph contains a cycle',
    },
    {
      kind: 'GOAL',
      valid: goalValid,
      issue: goalValid ? null : 'No goals or goal clarity below the minimum threshold',
    },
    {
      kind: 'RISK',
      valid: riskValid,
      issue: riskValid ? null : 'Plan risk is critical',
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

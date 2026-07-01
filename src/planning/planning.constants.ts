import { PlanningMode } from '@prisma/client';

/**
 * Planning Engine constants (Wave 14).
 *
 * The Planning Engine consumes existing constitutional runtimes — Reasoning,
 * Knowledge, Measurement, Exchange, Runtime, Objects, Capital, USFIP, IFC,
 * FIAR and FIC — by reference only. It never re-stores their data or
 * re-implements their logic, and it prepares executable strategic plans only:
 * it NEVER decides.
 */

/**
 * Weight profile for each planning mode (Part B). The weights blend goal
 * clarity, constraint satisfaction, resource feasibility, safety (inverse
 * risk), context confidence and founder authority into a single plan
 * confidence score. Weights always sum to 1.
 */
export type PlanningModeProfile = {
  mode: PlanningMode;
  name: string;
  goalWeight: number;
  constraintWeight: number;
  resourceWeight: number;
  riskWeight: number;
  contextWeight: number;
  founderWeight: number;
};

/** Canonical planning mode profiles (Part B). */
export const PLANNING_MODE_PROFILES: Record<PlanningMode, PlanningModeProfile> = {
  OPERATIONAL: {
    mode: 'OPERATIONAL',
    name: 'Operational planning',
    goalWeight: 0.25,
    constraintWeight: 0.2,
    resourceWeight: 0.3,
    riskWeight: 0.15,
    contextWeight: 0.1,
    founderWeight: 0,
  },
  STRATEGIC: {
    mode: 'STRATEGIC',
    name: 'Strategic planning',
    goalWeight: 0.3,
    constraintWeight: 0.2,
    resourceWeight: 0.15,
    riskWeight: 0.15,
    contextWeight: 0.2,
    founderWeight: 0,
  },
  FOUNDER: {
    mode: 'FOUNDER',
    name: 'Founder planning',
    goalWeight: 0.2,
    constraintWeight: 0.15,
    resourceWeight: 0.15,
    riskWeight: 0.1,
    contextWeight: 0.15,
    founderWeight: 0.25,
  },
  ADAPTIVE: {
    mode: 'ADAPTIVE',
    name: 'Adaptive planning',
    goalWeight: 0.2,
    constraintWeight: 0.2,
    resourceWeight: 0.2,
    riskWeight: 0.25,
    contextWeight: 0.15,
    founderWeight: 0,
  },
  CONSTITUTIONAL: {
    mode: 'CONSTITUTIONAL',
    name: 'Constitutional planning',
    goalWeight: 0.2,
    constraintWeight: 0.35,
    resourceWeight: 0.15,
    riskWeight: 0.15,
    contextWeight: 0.15,
    founderWeight: 0,
  },
  SCENARIO: {
    mode: 'SCENARIO',
    name: 'Scenario planning',
    goalWeight: 0.25,
    constraintWeight: 0.15,
    resourceWeight: 0.2,
    riskWeight: 0.25,
    contextWeight: 0.15,
    founderWeight: 0,
  },
  RECOVERY: {
    mode: 'RECOVERY',
    name: 'Recovery planning',
    goalWeight: 0.15,
    constraintWeight: 0.2,
    resourceWeight: 0.25,
    riskWeight: 0.3,
    contextWeight: 0.1,
    founderWeight: 0,
  },
  OPTIMIZATION: {
    mode: 'OPTIMIZATION',
    name: 'Optimization planning',
    goalWeight: 0.3,
    constraintWeight: 0.2,
    resourceWeight: 0.3,
    riskWeight: 0.1,
    contextWeight: 0.1,
    founderWeight: 0,
  },
};

/** Modes that require founder authority for constitutional validation (Part D). */
export const FOUNDER_PLANNING_MODES: PlanningMode[] = ['FOUNDER', 'CONSTITUTIONAL'];

/** Ordered Part C planning stages, recorded in the plan trace. */
export const PLANNING_STAGES = [
  'GOAL_DECOMPOSITION',
  'CONSTRAINT_ANALYSIS',
  'STRATEGY_GENERATION',
  'DEPENDENCY_GRAPH',
  'RESOURCE_ESTIMATION',
  'TIMELINE_GENERATION',
  'MILESTONE_GENERATION',
  'RISK_ESTIMATION',
  'CONFIDENCE_SCORING',
  'ALTERNATIVE_PLANS',
] as const;

/**
 * Constitutional runtimes the Planning Engine is permitted to consume by
 * reference (never duplicated).
 */
export const REUSED_RUNTIMES = [
  'REASONING', // Reasoning Engine
  'D11', // Intelligence Feeding
  'D12', // Intelligence Learning
  'D14', // Meta-Orchestration
  'D16', // Intelligence Object Foundation — knowledge
  'D17', // Measurement Architecture
  'D18', // Runtime Architecture
  'D19', // Exchange Architecture
  'FIC', // Founder Intent Compiler
  'USFIP', // Universal Strategic Founder Intelligence Protocol
  'IFC', // Institutional Flourishing Capital
  'FIAR', // Frontier Intelligence Asset Registry
  'IUC', // Understanding Capital Runtime
] as const;

/** Constitutional reference anchors for planning governance surfaces. */
export const PLANNING_CONSTITUTIONAL_REF = {
  SESSION: 'PLANNING:session',
  CONTEXT: 'PLANNING:context',
  GOAL: 'PLANNING:goal',
  CONSTRAINT: 'PLANNING:constraint',
  STRATEGY: 'PLANNING:strategy',
  PLAN: 'PLANNING:plan',
  STEP: 'PLANNING:step',
  MILESTONE: 'PLANNING:milestone',
  EVIDENCE: 'PLANNING:evidence',
  VALIDATION: 'PLANNING:validation',
  TRACE: 'PLANNING:trace',
  FOUNDER_AUTHORITY: 'PLANNING:founder-authority',
} as const;

/** Readiness thresholds applied to the final plan confidence (Part C). */
export const READINESS_THRESHOLDS = {
  EXECUTABLE: 0.7,
  CONDITIONAL: 0.45,
} as const;

/** Risk-band thresholds applied to the aggregate risk score (Part C). */
export const RISK_THRESHOLDS = {
  LOW: 0.25,
  MODERATE: 0.5,
  ELEVATED: 0.75,
} as const;

/** Resource / goal validation thresholds (Part D). */
export const VALIDATION_THRESHOLDS = {
  RESOURCE: 0.5,
  GOAL: 0.4,
} as const;

/** Maximum number of alternative plans the engine derives. */
export const MAX_ALTERNATIVE_PLANS = 3;

/** Number of executable steps produced per decomposed goal. */
export const STEPS_PER_GOAL = 2;

/** Default duration (abstract units) assigned to a decomposed step. */
export const DEFAULT_STEP_DURATION = 1;

/** Max depth / breadth guard for dependency graph construction. */
export const MAX_GRAPH_DEPTH = 256;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action namespace for the Planning Engine. */
export const PLANNING_ACTIONS = {
  START_PLANNING: 'PLANNING_START',
  GENERATE_PLAN: 'PLANNING_GENERATE',
  VALIDATE: 'PLANNING_VALIDATE',
  OVERRIDE: 'PLANNING_OVERRIDE',
} as const;

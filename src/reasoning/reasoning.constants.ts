import { ReasoningMode, ReasoningStepKind } from '@prisma/client';

/**
 * Reasoning Engine constants (Wave 13).
 *
 * The Reasoning Engine consumes existing constitutional runtimes — Objects,
 * Knowledge, Learning, Measurement, Exchange, Meta-Orchestration, USFIP, IFC,
 * FIAR and FIC — by reference only. It never re-stores their data or
 * re-implements their logic, and it does NOT plan or decide.
 */

/**
 * Weight profile for each reasoning mode (Part B). The three weights blend the
 * evidence, constraint-satisfaction and context signals into a single
 * confidence score. Weights always sum to 1.
 */
export type ModeProfile = {
  mode: ReasoningMode;
  name: string;
  evidenceWeight: number;
  constraintWeight: number;
  contextWeight: number;
  founderWeight: number;
};

/** Canonical mode profiles (Part B). */
export const REASONING_MODE_PROFILES: Record<ReasoningMode, ModeProfile> = {
  DEDUCTIVE: {
    mode: 'DEDUCTIVE',
    name: 'Deductive reasoning',
    evidenceWeight: 0.3,
    constraintWeight: 0.5,
    contextWeight: 0.2,
    founderWeight: 0,
  },
  INDUCTIVE: {
    mode: 'INDUCTIVE',
    name: 'Inductive reasoning',
    evidenceWeight: 0.55,
    constraintWeight: 0.2,
    contextWeight: 0.25,
    founderWeight: 0,
  },
  ABDUCTIVE: {
    mode: 'ABDUCTIVE',
    name: 'Abductive reasoning',
    evidenceWeight: 0.45,
    constraintWeight: 0.25,
    contextWeight: 0.3,
    founderWeight: 0,
  },
  ANALOGICAL: {
    mode: 'ANALOGICAL',
    name: 'Analogical reasoning',
    evidenceWeight: 0.35,
    constraintWeight: 0.2,
    contextWeight: 0.45,
    founderWeight: 0,
  },
  CONSTRAINT: {
    mode: 'CONSTRAINT',
    name: 'Constraint reasoning',
    evidenceWeight: 0.2,
    constraintWeight: 0.65,
    contextWeight: 0.15,
    founderWeight: 0,
  },
  STRATEGIC: {
    mode: 'STRATEGIC',
    name: 'Strategic reasoning',
    evidenceWeight: 0.35,
    constraintWeight: 0.35,
    contextWeight: 0.3,
    founderWeight: 0,
  },
  CONSTITUTIONAL: {
    mode: 'CONSTITUTIONAL',
    name: 'Constitutional reasoning',
    evidenceWeight: 0.3,
    constraintWeight: 0.45,
    contextWeight: 0.25,
    founderWeight: 0,
  },
  FOUNDER_GUIDED: {
    mode: 'FOUNDER_GUIDED',
    name: 'Founder-guided reasoning',
    evidenceWeight: 0.25,
    constraintWeight: 0.25,
    contextWeight: 0.2,
    founderWeight: 0.3,
  },
};

/** Ordered Part C reasoning stages, materialised as chain steps. */
export const REASONING_STAGES: ReasoningStepKind[] = [
  'CONTEXT_LOADING',
  'CHAIN_CONSTRUCTION',
  'EVIDENCE_AGGREGATION',
  'CONSTRAINT_EVALUATION',
  'CONFIDENCE_SCORING',
  'ALTERNATIVE_PATHS',
  'REASONING_TRACE',
];

/**
 * Constitutional runtimes the Reasoning Engine is permitted to consume by
 * reference (never duplicated).
 */
export const REUSED_RUNTIMES = [
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

/** Constitutional reference anchors for reasoning governance surfaces. */
export const REASONING_CONSTITUTIONAL_REF = {
  SESSION: 'REASONING:session',
  CONTEXT: 'REASONING:context',
  CHAIN: 'REASONING:chain',
  STEP: 'REASONING:step',
  RESULT: 'REASONING:result',
  EVIDENCE: 'REASONING:evidence',
  VALIDATION: 'REASONING:validation',
  TRACE: 'REASONING:trace',
  FOUNDER_AUTHORITY: 'REASONING:founder-authority',
} as const;

/** Verdict thresholds applied to the final confidence score (Part C). */
export const VERDICT_THRESHOLDS = {
  CONCLUSIVE: 0.75,
  PLAUSIBLE: 0.5,
} as const;

/** Trust / evidence / knowledge validation thresholds (Part D). */
export const VALIDATION_THRESHOLDS = {
  TRUST: 0.5,
  EVIDENCE: 0.4,
} as const;

/** Maximum number of alternative reasoning paths the engine derives. */
export const MAX_ALTERNATIVE_PATHS = 3;

/** Max depth / breadth guard for chain construction. */
export const MAX_CHAIN_STEPS = 64;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action namespace for the Reasoning Engine. */
export const REASONING_ACTIONS = {
  START_REASONING: 'REASONING_START',
  VALIDATE: 'REASONING_VALIDATE',
  OVERRIDE: 'REASONING_OVERRIDE',
} as const;

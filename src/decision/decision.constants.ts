import { DecisionMode } from '@prisma/client';

/**
 * Decision Engine constants (Wave 15).
 *
 * The Decision Engine consumes existing constitutional runtimes — Reasoning,
 * Planning, Measurement, Capital, Runtime, Objects, USFIP, IFC, FIAR and FIC —
 * by reference only. It never re-stores their data or re-implements their
 * logic, and it determines the constitutionally valid decision only: it NEVER
 * executes actions.
 */

/**
 * Weight profile for each decision mode (Part B). The weights blend a
 * candidate's benefit, reasoning confidence, planning readiness, capital
 * support, constraint satisfaction, context confidence and founder authority
 * into a single candidate score. Weights always sum to 1.
 */
export type DecisionModeProfile = {
  mode: DecisionMode;
  name: string;
  benefitWeight: number;
  reasoningWeight: number;
  planningWeight: number;
  capitalWeight: number;
  constraintWeight: number;
  contextWeight: number;
  founderWeight: number;
};

/** Canonical decision mode profiles (Part B). */
export const DECISION_MODE_PROFILES: Record<DecisionMode, DecisionModeProfile> = {
  OPERATIONAL: {
    mode: 'OPERATIONAL',
    name: 'Operational decision',
    benefitWeight: 0.3,
    reasoningWeight: 0.2,
    planningWeight: 0.25,
    capitalWeight: 0.1,
    constraintWeight: 0.1,
    contextWeight: 0.05,
    founderWeight: 0,
  },
  STRATEGIC: {
    mode: 'STRATEGIC',
    name: 'Strategic decision',
    benefitWeight: 0.25,
    reasoningWeight: 0.25,
    planningWeight: 0.2,
    capitalWeight: 0.15,
    constraintWeight: 0.1,
    contextWeight: 0.05,
    founderWeight: 0,
  },
  FOUNDER: {
    mode: 'FOUNDER',
    name: 'Founder decision',
    benefitWeight: 0.2,
    reasoningWeight: 0.15,
    planningWeight: 0.15,
    capitalWeight: 0.1,
    constraintWeight: 0.1,
    contextWeight: 0.05,
    founderWeight: 0.25,
  },
  CONSTITUTIONAL: {
    mode: 'CONSTITUTIONAL',
    name: 'Constitutional decision',
    benefitWeight: 0.15,
    reasoningWeight: 0.2,
    planningWeight: 0.15,
    capitalWeight: 0.1,
    constraintWeight: 0.35,
    contextWeight: 0.05,
    founderWeight: 0,
  },
  EMERGENCY: {
    mode: 'EMERGENCY',
    name: 'Emergency decision',
    benefitWeight: 0.35,
    reasoningWeight: 0.2,
    planningWeight: 0.1,
    capitalWeight: 0.05,
    constraintWeight: 0.2,
    contextWeight: 0.1,
    founderWeight: 0,
  },
  RECOVERY: {
    mode: 'RECOVERY',
    name: 'Recovery decision',
    benefitWeight: 0.2,
    reasoningWeight: 0.2,
    planningWeight: 0.2,
    capitalWeight: 0.15,
    constraintWeight: 0.2,
    contextWeight: 0.05,
    founderWeight: 0,
  },
  OPTIMIZATION: {
    mode: 'OPTIMIZATION',
    name: 'Optimization decision',
    benefitWeight: 0.35,
    reasoningWeight: 0.2,
    planningWeight: 0.2,
    capitalWeight: 0.15,
    constraintWeight: 0.05,
    contextWeight: 0.05,
    founderWeight: 0,
  },
  CONSENSUS: {
    mode: 'CONSENSUS',
    name: 'Consensus decision',
    benefitWeight: 0.2,
    reasoningWeight: 0.25,
    planningWeight: 0.2,
    capitalWeight: 0.1,
    constraintWeight: 0.15,
    contextWeight: 0.1,
    founderWeight: 0,
  },
};

/** Modes that require founder authority for constitutional validation (Part D). */
export const FOUNDER_DECISION_MODES: DecisionMode[] = ['FOUNDER', 'CONSTITUTIONAL'];

/** Ordered Part C decision stages, recorded in the decision trace. */
export const DECISION_STAGES = [
  'CANDIDATE_GENERATION',
  'CANDIDATE_SCORING',
  'CONSTITUTIONAL_FILTERING',
  'CONSTRAINT_EVALUATION',
  'RISK_EVALUATION',
  'CONFIDENCE_SCORING',
  'WINNER_SELECTION',
  'ALTERNATIVE_RANKING',
  'DECISION_TRACE',
] as const;

/**
 * Constitutional runtimes the Decision Engine is permitted to consume by
 * reference (never duplicated).
 */
export const REUSED_RUNTIMES = [
  'REASONING', // Reasoning Engine
  'PLANNING', // Planning Engine
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

/** Constitutional reference anchors for decision governance surfaces. */
export const DECISION_CONSTITUTIONAL_REF = {
  SESSION: 'DECISION:session',
  CONTEXT: 'DECISION:context',
  CANDIDATE: 'DECISION:candidate',
  EVALUATION: 'DECISION:evaluation',
  CONSTRAINT: 'DECISION:constraint',
  VERDICT: 'DECISION:verdict',
  EVIDENCE: 'DECISION:evidence',
  VALIDATION: 'DECISION:validation',
  TRACE: 'DECISION:trace',
  FOUNDER_AUTHORITY: 'DECISION:founder-authority',
} as const;

/** Verdict thresholds applied to the winning candidate score (Part C). */
export const VERDICT_THRESHOLDS = {
  SELECTED: 0.65,
  CONTESTED: 0.45,
} as const;

/** Risk-band thresholds applied to the aggregate risk score (Part C). */
export const RISK_THRESHOLDS = {
  LOW: 0.25,
  MODERATE: 0.5,
  ELEVATED: 0.75,
} as const;

/** Evidence / capital validation thresholds (Part D). */
export const VALIDATION_THRESHOLDS = {
  EVIDENCE: 0.4,
  CAPITAL: 0.4,
} as const;

/** Neutral prior applied to a missing candidate signal (0..1). */
export const NEUTRAL_SIGNAL = 0.5;

/** Maximum number of ranked alternatives the engine derives. */
export const MAX_ALTERNATIVES = 3;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action namespace for the Decision Engine. */
export const DECISION_ACTIONS = {
  START_DECISION: 'DECISION_START',
  EVALUATE: 'DECISION_EVALUATE',
  VALIDATE: 'DECISION_VALIDATE',
  OVERRIDE: 'DECISION_OVERRIDE',
} as const;

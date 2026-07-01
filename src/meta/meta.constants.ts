import { MetaArbitrationType, MetaOverrideType, MetaRouteTarget } from '@prisma/client';

/**
 * D14 Meta-Intelligence Orchestration — constitutional constants.
 *
 * The meta layer coordinates existing runtimes only. Every routing target maps
 * to an already-implemented constitutional domain; no new engines are created.
 */

/** Routing targets supported by the constitutional routing engine (Part B). */
export const ROUTE_TARGETS: MetaRouteTarget[] = [
  'KNOWLEDGE',
  'LEARNING',
  'RUNTIME',
  'EXCHANGE',
  'MEASUREMENT',
  'CAPITAL',
  'INTENT',
  'WORKSPACE',
  'PROVIDER',
];

/** Arbitration dimensions supported by the arbitration engine (Part C). */
export const ARBITRATION_TYPES: MetaArbitrationType[] = [
  'CONFLICT',
  'PRIORITY',
  'AUTHORITY',
  'EVIDENCE',
  'CAPITAL',
  'EXECUTION',
];

/** Founder override modes (Part E). Every override is immutable. */
export const OVERRIDE_TYPES: MetaOverrideType[] = [
  'MANUAL',
  'CONSTITUTIONAL',
  'PRIORITY',
  'EXECUTION',
];

/**
 * The constitutional runtimes the meta layer is permitted to coordinate
 * (Part F). Orchestration only — never re-implemented here.
 */
export const COORDINATED_RUNTIMES = [
  'D11', // Intelligence Feeding
  'D12', // Intelligence Learning
  'D13', // Intelligence Capital
  'D16', // Intelligence Object Foundation
  'D17', // Measurement Architecture
  'D18', // Runtime Architecture
  'D19', // Exchange Architecture
  'FIC', // Founder Intent Compiler
  'IUC', // Understanding Capital Runtime
] as const;

/** Constitutional reference anchor for each routing target. */
export const ROUTE_CONSTITUTIONAL_REF: Record<MetaRouteTarget, string> = {
  KNOWLEDGE: 'D16:intelligence-object-foundation',
  LEARNING: 'D12:intelligence-learning',
  RUNTIME: 'D18:runtime-architecture',
  EXCHANGE: 'D19:exchange-architecture',
  MEASUREMENT: 'D17:measurement-architecture',
  CAPITAL: 'D13:intelligence-capital',
  INTENT: 'FIC:founder-intent-compiler',
  WORKSPACE: 'D14:workspace-governance',
  PROVIDER: 'D18:provider-runtime',
};

/** Constitutional reference anchor for each arbitration dimension. */
export const ARBITRATION_CONSTITUTIONAL_REF: Record<MetaArbitrationType, string> = {
  CONFLICT: 'D14:arbitration-conflict',
  PRIORITY: 'D14:arbitration-priority',
  AUTHORITY: 'D14:arbitration-authority',
  EVIDENCE: 'D14:arbitration-evidence',
  CAPITAL: 'D13:capital-arbitration',
  EXECUTION: 'D18:execution-arbitration',
};

/**
 * Deterministic default weight for each routing target used to score routing
 * candidates when the caller does not supply an explicit priority. Higher is
 * more constitutionally load-bearing.
 */
export const ROUTE_TARGET_WEIGHT: Record<MetaRouteTarget, number> = {
  INTENT: 0.95,
  CAPITAL: 0.9,
  MEASUREMENT: 0.85,
  KNOWLEDGE: 0.8,
  LEARNING: 0.78,
  RUNTIME: 0.75,
  EXCHANGE: 0.7,
  WORKSPACE: 0.65,
  PROVIDER: 0.6,
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action namespace for the meta layer. */
export const META_ACTIONS = {
  CREATE_ORCHESTRATION: 'META_CREATE_ORCHESTRATION',
  START_ORCHESTRATION: 'META_START_ORCHESTRATION',
  ROUTE: 'META_ROUTE',
  ARBITRATE: 'META_ARBITRATE',
  MERGE_REQUEST: 'META_MERGE_REQUEST',
  MERGE_VALIDATE: 'META_MERGE_VALIDATE',
  MERGE_COMMIT: 'META_MERGE_COMMIT',
  MERGE_ROLLBACK: 'META_MERGE_ROLLBACK',
  OVERRIDE: 'META_OVERRIDE',
  CREATE_POLICY: 'META_CREATE_POLICY',
} as const;

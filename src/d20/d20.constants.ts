import {
  BuildProfileStatus,
  DeploymentEnvironment,
  DeploymentProfileStatus,
  ImplementationBoundaryKind,
  ImplementationDependencyKind,
  ImplementationUnitKind,
  ImplementationUnitStatus,
} from '@prisma/client';

/**
 * D20 — Implementation Boundary & Build Architecture constants.
 *
 * This layer documents and enforces how ONX Intelligence is built, assembled,
 * validated and deployed. It introduces NO new intelligence capabilities and
 * reuses existing modules by reference only.
 */

/** Implementation unit kinds (Part A). */
export const IMPLEMENTATION_UNIT_KINDS: ImplementationUnitKind[] = [
  'RUNTIME',
  'ENGINE',
  'PROTOCOL',
  'GOVERNANCE',
  'REGISTRY',
  'INTERFACE',
  'INFRASTRUCTURE',
];

/** Implementation unit lifecycle states. */
export const IMPLEMENTATION_UNIT_STATUSES: ImplementationUnitStatus[] = [
  'DECLARED',
  'VALIDATED',
  'BUILT',
  'DEPLOYED',
  'DEPRECATED',
  'OVERRIDDEN',
];

/** Boundary kinds (Part B — execution/runtime/build/deployment/dependency). */
export const IMPLEMENTATION_BOUNDARY_KINDS: ImplementationBoundaryKind[] = [
  'EXECUTION',
  'RUNTIME',
  'BUILD',
  'DEPLOYMENT',
  'DEPENDENCY',
];

/** Dependency kinds (Part D). */
export const IMPLEMENTATION_DEPENDENCY_KINDS: ImplementationDependencyKind[] = [
  'REQUIRED',
  'OPTIONAL',
  'PEER',
  'BUILD',
  'RUNTIME',
];

/** Build stages (Part C) — the canonical ordered build pipeline. */
export const BUILD_STAGES = [
  'RESOLVE_DEPENDENCIES',
  'COMPILE',
  'VALIDATE',
  'PACKAGE',
  'VERIFY',
  'PUBLISH',
] as const;

export type BuildStage = (typeof BUILD_STAGES)[number];

/** Supported build profile statuses. */
export const BUILD_PROFILE_STATUSES: BuildProfileStatus[] = [
  'DRAFT',
  'VALIDATED',
  'FAILED',
  'PUBLISHED',
];

/** Deployment environments (Part E) ordered by promotion. */
export const DEPLOYMENT_ENVIRONMENTS: DeploymentEnvironment[] = [
  'DEVELOPMENT',
  'STAGING',
  'PRODUCTION',
];

/** Supported deployment profile statuses. */
export const DEPLOYMENT_PROFILE_STATUSES: DeploymentProfileStatus[] = [
  'DRAFT',
  'VALIDATED',
  'FAILED',
  'DEPLOYED',
  'ROLLED_BACK',
];

/** Compatibility levels reported by the compatibility matrix (Part C/D). */
export const COMPATIBILITY_LEVELS = ['COMPATIBLE', 'DEGRADED', 'INCOMPATIBLE'] as const;

export type CompatibilityLevel = (typeof COMPATIBILITY_LEVELS)[number];

/**
 * Existing modules reused by the implementation registry. D20 references these
 * by value only — it never duplicates their logic or storage.
 */
export const REUSED_MODULES = [
  'REASONING',
  'PLANNING',
  'DECISION',
  'RUNTIME',
  'MEASUREMENT',
  'OBJECTS',
  'CAPITAL',
  'USFIP',
  'IFC',
  'FIAR',
] as const;

/** Constitutional references for D20 governance records. */
export const D20_CONSTITUTIONAL_REF = {
  UNIT: 'D20_IMPLEMENTATION_UNIT',
  PACKAGE: 'D20_IMPLEMENTATION_PACKAGE',
  DEPENDENCY: 'D20_IMPLEMENTATION_DEPENDENCY',
  BOUNDARY: 'D20_IMPLEMENTATION_BOUNDARY',
  BUILD: 'D20_BUILD_PROFILE',
  DEPLOYMENT: 'D20_DEPLOYMENT_PROFILE',
  COMPATIBILITY: 'D20_COMPATIBILITY_MATRIX',
  VALIDATION: 'D20_IMPLEMENTATION_VALIDATION',
  FOUNDER_AUTHORITY: 'D20_FOUNDER_AUTHORITY',
} as const;

/** Maximum dependency-graph traversal depth (cycle guard). */
export const MAX_GRAPH_DEPTH = 128;

/** Pagination defaults. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action codes for every D20 mutation. */
export const D20_ACTIONS = {
  REGISTER_UNIT: 'D20_REGISTER_UNIT',
  REGISTER_PACKAGE: 'D20_REGISTER_PACKAGE',
  DECLARE_DEPENDENCY: 'D20_DECLARE_DEPENDENCY',
  DECLARE_BOUNDARY: 'D20_DECLARE_BOUNDARY',
  CREATE_BUILD: 'D20_CREATE_BUILD',
  VALIDATE_BUILD: 'D20_VALIDATE_BUILD',
  CREATE_DEPLOYMENT: 'D20_CREATE_DEPLOYMENT',
  VALIDATE_DEPLOYMENT: 'D20_VALIDATE_DEPLOYMENT',
  VALIDATE: 'D20_VALIDATE',
  OVERRIDE: 'D20_OVERRIDE',
} as const;

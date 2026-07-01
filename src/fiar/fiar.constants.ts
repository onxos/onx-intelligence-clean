import { FIARAssetClass, FIARAssetStatus } from '@prisma/client';

/**
 * FIAR — Frontier Intelligence Asset Registry constants (Wave 12).
 *
 * FIAR is the canonical inventory of every strategic Intelligence asset. It is
 * NOT a reasoning, planning or decision engine and NOT Platform. It references
 * existing constitutional runtimes by value only — it never re-stores their
 * data or re-implements their logic.
 */

/** Lifecycle transition verbs (API surface for Part D). */
export enum FiarLifecycleTransition {
  ACTIVATE = 'ACTIVATE',
  DEPRECATE = 'DEPRECATE',
  ARCHIVE = 'ARCHIVE',
  REPLACE = 'REPLACE',
  REACTIVATE = 'REACTIVATE',
}

/**
 * The canonical strategic asset classes (Part B). Each class maps to the
 * constitutional runtime that owns the underlying data — FIAR only references
 * it. REASONING/PLANNING/DECISION are reserved for future runtimes.
 */
export const FIAR_ASSET_CLASSES: {
  assetClass: FIARAssetClass;
  name: string;
  sourceRuntime: string;
  future: boolean;
}[] = [
  { assetClass: 'KNOWLEDGE', name: 'Knowledge asset', sourceRuntime: 'D16', future: false },
  { assetClass: 'LEARNING', name: 'Learning asset', sourceRuntime: 'D12', future: false },
  { assetClass: 'MEMORY', name: 'Memory asset', sourceRuntime: 'memory-governance', future: false },
  { assetClass: 'EVIDENCE', name: 'Evidence asset', sourceRuntime: 'evidence', future: false },
  { assetClass: 'INTENT', name: 'Founder intent asset', sourceRuntime: 'FIC', future: false },
  { assetClass: 'CAPITAL', name: 'Capital asset', sourceRuntime: 'D13', future: false },
  { assetClass: 'MEASUREMENT', name: 'Measurement asset', sourceRuntime: 'D17', future: false },
  { assetClass: 'RUNTIME', name: 'Runtime asset', sourceRuntime: 'D18', future: false },
  { assetClass: 'EXCHANGE', name: 'Exchange asset', sourceRuntime: 'D19', future: false },
  { assetClass: 'GOVERNANCE', name: 'Governance asset', sourceRuntime: 'D14', future: false },
  { assetClass: 'PROTOCOL', name: 'Protocol asset', sourceRuntime: 'USFIP', future: false },
  { assetClass: 'MODEL', name: 'Model asset', sourceRuntime: 'provider-model', future: false },
  { assetClass: 'TOOL', name: 'Tool asset', sourceRuntime: 'tool', future: false },
  { assetClass: 'PROVIDER', name: 'Provider asset', sourceRuntime: 'provider', future: false },
  {
    assetClass: 'REASONING',
    name: 'Reasoning asset (future)',
    sourceRuntime: 'future',
    future: true,
  },
  {
    assetClass: 'PLANNING',
    name: 'Planning asset (future)',
    sourceRuntime: 'future',
    future: true,
  },
  {
    assetClass: 'DECISION',
    name: 'Decision asset (future)',
    sourceRuntime: 'future',
    future: true,
  },
];

/** Quick lookup: asset class → source runtime tag. */
export const CLASS_SOURCE_RUNTIME: Record<FIARAssetClass, string> = FIAR_ASSET_CLASSES.reduce(
  (acc, c) => {
    acc[c.assetClass] = c.sourceRuntime;
    return acc;
  },
  {} as Record<FIARAssetClass, string>,
);

/** Asset classes reserved for future runtimes (not yet implemented). */
export const FUTURE_ASSET_CLASSES: FIARAssetClass[] = FIAR_ASSET_CLASSES.filter(
  (c) => c.future,
).map((c) => c.assetClass);

/**
 * Constitutional runtimes FIAR is permitted to reference (never duplicated).
 */
export const REUSED_RUNTIMES = [
  'D16', // Intelligence Object Foundation — knowledge
  'FIC', // Founder Intent Compiler — intent
  'USFIP', // Universal Strategic Founder Intelligence Protocol — protocol
  'IFC', // Institutional Flourishing Capital — flourishing
  'IUC', // Understanding Capital Runtime
  'D17', // Measurement Architecture
  'D18', // Runtime Architecture
  'D19', // Exchange Architecture
] as const;

/** Constitutional reference anchors for FIAR governance surfaces. */
export const FIAR_CONSTITUTIONAL_REF = {
  ASSET: 'FIAR:asset',
  CATEGORY: 'FIAR:category',
  CLASSIFICATION: 'FIAR:classification',
  OWNERSHIP: 'FIAR:ownership',
  RELATIONSHIP: 'FIAR:relationship',
  LINEAGE: 'FIAR:lineage',
  POLICY: 'FIAR:policy',
  FOUNDER_AUTHORITY: 'FIAR:founder-authority',
} as const;

/**
 * Permitted lifecycle transitions keyed by current status (Part D).
 * ARCHIVED and OVERRIDDEN are terminal.
 */
export const FIAR_LIFECYCLE_TRANSITIONS: Record<FIARAssetStatus, FIARAssetStatus[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['DEPRECATED', 'REPLACED', 'ARCHIVED'],
  DEPRECATED: ['ACTIVE', 'ARCHIVED'],
  REPLACED: ['ARCHIVED'],
  ARCHIVED: [],
  OVERRIDDEN: [],
};

/** Lifecycle verb → resulting asset status. */
export const LIFECYCLE_TARGET_STATUS: Record<FiarLifecycleTransition, FIARAssetStatus> = {
  [FiarLifecycleTransition.ACTIVATE]: 'ACTIVE',
  [FiarLifecycleTransition.DEPRECATE]: 'DEPRECATED',
  [FiarLifecycleTransition.ARCHIVE]: 'ARCHIVED',
  [FiarLifecycleTransition.REPLACE]: 'REPLACED',
  [FiarLifecycleTransition.REACTIVATE]: 'ACTIVE',
};

/** Max depth guard when walking dependency graphs / lineage chains. */
export const MAX_GRAPH_DEPTH = 64;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action namespace for FIAR. */
export const FIAR_ACTIONS = {
  REGISTER_ASSET: 'FIAR_REGISTER_ASSET',
  UPDATE_ASSET: 'FIAR_UPDATE_ASSET',
  CLASSIFY_ASSET: 'FIAR_CLASSIFY_ASSET',
  ASSIGN_OWNERSHIP: 'FIAR_ASSIGN_OWNERSHIP',
  CREATE_RELATIONSHIP: 'FIAR_CREATE_RELATIONSHIP',
  LIFECYCLE_TRANSITION: 'FIAR_LIFECYCLE_TRANSITION',
  CREATE_CATEGORY: 'FIAR_CREATE_CATEGORY',
  CREATE_POLICY: 'FIAR_CREATE_POLICY',
  OVERRIDE: 'FIAR_OVERRIDE',
} as const;

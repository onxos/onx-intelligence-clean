import { StrategicHorizon, StrategicPriority } from '@prisma/client';

/**
 * USFIP — Universal Strategic Founder Intelligence Protocol constants.
 *
 * USFIP is the constitutional protocol that governs how Founder intent becomes
 * strategic intelligence. It is NOT a reasoning, planning or decision engine —
 * it evaluates protocols, selects policies/rules and records a governed,
 * traceable strategic execution path over existing constitutional runtimes.
 */

/** Strategic priority ordering (higher wins during policy/rule selection). */
export const STRATEGIC_PRIORITY_ORDER: Record<StrategicPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Strategic horizon ordering (nearer horizons are weighted for urgency). */
export const STRATEGIC_HORIZON_ORDER: Record<StrategicHorizon, number> = {
  IMMEDIATE: 4,
  SHORT: 3,
  MEDIUM: 2,
  LONG: 1,
};

/**
 * Constitutional runtimes USFIP is permitted to reuse by reference (never
 * re-implemented). Founder intent flows from FIC into a governed protocol that
 * coordinates these domains through D14 meta-orchestration.
 */
export const REUSED_RUNTIMES = [
  'FIC', // Founder Intent Compiler — source of founder intent
  'D14', // Meta-Intelligence Orchestration — coordination substrate
  'D16', // Intelligence Object Foundation
  'D17', // Measurement Architecture
  'D18', // Runtime Architecture
  'D19', // Exchange Architecture
  'IUC', // Understanding Capital Runtime
] as const;

/** Constitutional reference anchors for USFIP governance surfaces. */
export const USFIP_CONSTITUTIONAL_REF = {
  PROTOCOL: 'USFIP:strategic-protocol',
  RULE: 'USFIP:strategic-rule',
  POLICY: 'USFIP:strategic-policy',
  EXECUTION: 'USFIP:strategic-execution',
  FOUNDER_AUTHORITY: 'USFIP:founder-authority',
  INTENT: 'FIC:founder-intent-compiler',
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_STREAM_LIMIT = 50;
export const MAX_STREAM_LIMIT = 200;

/** Audit action namespace for USFIP. */
export const USFIP_ACTIONS = {
  CREATE_SESSION: 'USFIP_CREATE_SESSION',
  INTERPRET: 'USFIP_INTERPRET',
  CREATE_PROTOCOL: 'USFIP_CREATE_PROTOCOL',
  ACTIVATE_PROTOCOL: 'USFIP_ACTIVATE_PROTOCOL',
  CREATE_RULE: 'USFIP_CREATE_RULE',
  CREATE_POLICY: 'USFIP_CREATE_POLICY',
  EXECUTE: 'USFIP_EXECUTE',
  VALIDATE: 'USFIP_VALIDATE',
  OVERRIDE: 'USFIP_OVERRIDE',
} as const;

import { RuntimeContextType, RuntimeSessionState } from '@prisma/client';

/**
 * IW-09 — D18 Intelligence Runtime constants.
 *
 * Canonical runtime session lifecycle states (Part B).
 */
export const RUNTIME_SESSION_STATES: RuntimeSessionState[] = [
  'CREATED',
  'INITIALIZING',
  'READY',
  'RUNNING',
  'WAITING',
  'PAUSED',
  'RECOVERING',
  'DEGRADED',
  'FAILED',
  'STOPPING',
  'STOPPED',
  'ARCHIVED',
];

/**
 * Validated runtime state-machine transitions. A session advances through
 * initialization, runs (with waiting/pausing), may recover or degrade, and is
 * ultimately stopped and archived. ARCHIVED is terminal.
 */
export const RUNTIME_STATE_TRANSITIONS: Record<RuntimeSessionState, RuntimeSessionState[]> = {
  CREATED: ['INITIALIZING', 'ARCHIVED'],
  INITIALIZING: ['READY', 'DEGRADED', 'FAILED'],
  READY: ['RUNNING', 'STOPPING', 'ARCHIVED'],
  RUNNING: ['WAITING', 'PAUSED', 'RECOVERING', 'DEGRADED', 'FAILED', 'STOPPING'],
  WAITING: ['RUNNING', 'PAUSED', 'RECOVERING', 'DEGRADED', 'FAILED', 'STOPPING'],
  PAUSED: ['RUNNING', 'RECOVERING', 'STOPPING', 'ARCHIVED'],
  RECOVERING: ['RUNNING', 'READY', 'DEGRADED', 'FAILED', 'STOPPING'],
  DEGRADED: ['RUNNING', 'RECOVERING', 'FAILED', 'STOPPING'],
  FAILED: ['RECOVERING', 'STOPPING', 'ARCHIVED'],
  STOPPING: ['STOPPED', 'FAILED'],
  STOPPED: ['RECOVERING', 'ARCHIVED'],
  ARCHIVED: [],
};

/** States in which the session is actively doing work. */
export const RUNTIME_ACTIVE_STATES: RuntimeSessionState[] = ['RUNNING', 'WAITING'];

/** Terminal states from which no further progress is possible. */
export const RUNTIME_TERMINAL_STATES: RuntimeSessionState[] = ['ARCHIVED'];

/** States from which a recovery may be initiated. */
export const RUNTIME_RECOVERABLE_STATES: RuntimeSessionState[] = [
  'RUNNING',
  'WAITING',
  'PAUSED',
  'DEGRADED',
  'FAILED',
  'STOPPED',
  'RECOVERING',
];

/** States in which a checkpoint may be captured (anything not terminal). */
export const RUNTIME_CHECKPOINTABLE_STATES: RuntimeSessionState[] = RUNTIME_SESSION_STATES.filter(
  (state) => state !== 'ARCHIVED' && state !== 'CREATED',
);

/** Canonical runtime context object types (Part C). */
export const RUNTIME_CONTEXT_TYPES: RuntimeContextType[] = [
  'EXECUTION',
  'KNOWLEDGE',
  'LEARNING',
  'CAPITAL',
  'MEASUREMENT',
  'INTENT',
  'WORKSPACE',
  'PROVIDER',
  'MEMORY',
];

/** Heartbeat staleness (ms) beyond which a running session is considered degraded. */
export const RUNTIME_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

/** Recovery count beyond which health is downgraded even when the state is nominal. */
export const RUNTIME_RECOVERY_HEALTH_THRESHOLD = 3;

export const RUNTIME_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'state',
  'healthStatus',
] as const;

export function isValidRuntimeTransition(
  from: RuntimeSessionState,
  to: RuntimeSessionState,
): boolean {
  if (from === to) {
    return false;
  }
  return (RUNTIME_STATE_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminalRuntimeState(state: RuntimeSessionState): boolean {
  return RUNTIME_TERMINAL_STATES.includes(state);
}

export function isRecoverableRuntimeState(state: RuntimeSessionState): boolean {
  return RUNTIME_RECOVERABLE_STATES.includes(state);
}

export function canCheckpointRuntimeState(state: RuntimeSessionState): boolean {
  return RUNTIME_CHECKPOINTABLE_STATES.includes(state);
}

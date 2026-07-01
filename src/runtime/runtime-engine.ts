import { RuntimeHealthStatus, RuntimeRecoveryType, RuntimeSessionState } from '@prisma/client';
import {
  isRecoverableRuntimeState,
  isValidRuntimeTransition,
  RUNTIME_ACTIVE_STATES,
  RUNTIME_HEARTBEAT_STALE_MS,
  RUNTIME_RECOVERY_HEALTH_THRESHOLD,
} from './runtime.constants';

/**
 * IW-09 — D18 Runtime recovery + continuity engine.
 *
 * A deterministic, side-effect-free core. It owns:
 *  - state transition validation        (Part B)
 *  - health computation                  (Part F)
 *  - recovery target resolution          (Part D)
 *  - continuity sequencing + lineage     (Part E)
 */

export type RuntimeHealthInputs = {
  state: RuntimeSessionState;
  recoveryCount: number;
  lastHeartbeatAt?: Date | string | null;
  now?: Date;
  staleMs?: number;
};

/** Assert a runtime transition, throwing a descriptive error if invalid. */
export function assertRuntimeTransition(from: RuntimeSessionState, to: RuntimeSessionState): void {
  if (!isValidRuntimeTransition(from, to)) {
    throw new Error(`Invalid runtime transition ${from} -> ${to}`);
  }
}

/**
 * Compute the health of a runtime session. A degraded/failed state maps directly
 * onto health; otherwise health is derived from heartbeat staleness (for active
 * states) and the accumulated recovery count.
 */
export function computeRuntimeHealth(inputs: RuntimeHealthInputs): RuntimeHealthStatus {
  const { state, recoveryCount } = inputs;

  if (state === 'FAILED') {
    return 'UNHEALTHY';
  }
  if (state === 'DEGRADED' || state === 'RECOVERING') {
    return 'DEGRADED';
  }
  if (state === 'CREATED' || state === 'INITIALIZING') {
    return 'UNKNOWN';
  }
  if (state === 'ARCHIVED' || state === 'STOPPED' || state === 'STOPPING') {
    return 'UNKNOWN';
  }

  const staleMs = inputs.staleMs ?? RUNTIME_HEARTBEAT_STALE_MS;
  if (RUNTIME_ACTIVE_STATES.includes(state) && inputs.lastHeartbeatAt) {
    const now = inputs.now ?? new Date();
    const last = new Date(inputs.lastHeartbeatAt).getTime();
    if (Number.isFinite(last) && now.getTime() - last > staleMs) {
      return 'DEGRADED';
    }
  }

  if (recoveryCount >= RUNTIME_RECOVERY_HEALTH_THRESHOLD) {
    return 'DEGRADED';
  }

  return 'HEALTHY';
}

/**
 * Resolve the runtime state a session should return to for a given recovery type
 * and (optional) checkpoint-captured state. Recovery always routes through the
 * RECOVERING state at the service layer; this returns the post-recovery target.
 */
export function resolveRecoveryTargetState(
  recoveryType: RuntimeRecoveryType,
  capturedState?: RuntimeSessionState | null,
): RuntimeSessionState {
  switch (recoveryType) {
    case 'CHECKPOINT_RESTORE':
    case 'RUNTIME_ROLLBACK':
      // Return to the checkpoint's captured state when it is itself resumable,
      // otherwise fall back to READY.
      if (capturedState && isRecoverableRuntimeState(capturedState)) {
        return capturedState;
      }
      return 'READY';
    case 'SESSION_RESUME':
      return 'RUNNING';
    case 'CRASH_RECOVERY':
    case 'CONTINUITY_RECOVERY':
    default:
      return 'READY';
  }
}

/** Next monotonic sequence number for an event/checkpoint stream. */
export function nextSequence(current: number | null | undefined): number {
  return (current ?? 0) + 1;
}

export type LineageInputs = {
  parentLineageRoot?: string | null;
  parentSessionId?: string | null;
  parentContinuitySeq?: number | null;
};

export type LineageResult = {
  lineageRoot: string | null;
  parentSessionId: string | null;
  continuitySeq: number;
};

/**
 * Derive continuity lineage for a resumed/forked session. The lineage root is
 * inherited from the parent (or the parent itself becomes the root); the
 * continuity sequence increments along the chain.
 */
export function deriveLineage(inputs: LineageInputs): LineageResult {
  const lineageRoot = inputs.parentLineageRoot ?? inputs.parentSessionId ?? null;
  return {
    lineageRoot,
    parentSessionId: inputs.parentSessionId ?? null,
    continuitySeq: nextSequence(inputs.parentContinuitySeq),
  };
}

/** Whether a recovery of the given type is permitted from the current state. */
export function canInitiateRecovery(
  state: RuntimeSessionState,
  recoveryType: RuntimeRecoveryType,
): boolean {
  if (!isRecoverableRuntimeState(state)) {
    return false;
  }
  if (recoveryType === 'SESSION_RESUME') {
    // Resume only makes sense from a paused/stopped/degraded posture.
    return ['PAUSED', 'STOPPED', 'DEGRADED', 'RECOVERING'].includes(state);
  }
  return true;
}

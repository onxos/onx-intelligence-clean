import {
  assertRuntimeTransition,
  canInitiateRecovery,
  computeRuntimeHealth,
  deriveLineage,
  nextSequence,
  resolveRecoveryTargetState,
} from './runtime-engine';
import {
  isRecoverableRuntimeState,
  isTerminalRuntimeState,
  isValidRuntimeTransition,
  RUNTIME_RECOVERY_HEALTH_THRESHOLD,
} from './runtime.constants';

describe('runtime-engine (D18 pure core)', () => {
  describe('state machine transitions', () => {
    it('accepts canonical forward transitions', () => {
      expect(isValidRuntimeTransition('CREATED', 'INITIALIZING')).toBe(true);
      expect(isValidRuntimeTransition('INITIALIZING', 'READY')).toBe(true);
      expect(isValidRuntimeTransition('READY', 'RUNNING')).toBe(true);
      expect(isValidRuntimeTransition('RUNNING', 'PAUSED')).toBe(true);
      expect(isValidRuntimeTransition('RUNNING', 'STOPPING')).toBe(true);
      expect(isValidRuntimeTransition('STOPPING', 'STOPPED')).toBe(true);
    });

    it('rejects illegal transitions', () => {
      expect(isValidRuntimeTransition('CREATED', 'RUNNING')).toBe(false);
      expect(isValidRuntimeTransition('ARCHIVED', 'RUNNING')).toBe(false);
      expect(isValidRuntimeTransition('STOPPED', 'RUNNING')).toBe(false);
    });

    it('treats ARCHIVED as terminal', () => {
      expect(isTerminalRuntimeState('ARCHIVED')).toBe(true);
      expect(isTerminalRuntimeState('RUNNING')).toBe(false);
    });

    it('assertRuntimeTransition throws on invalid edges only', () => {
      expect(() => assertRuntimeTransition('READY', 'RUNNING')).not.toThrow();
      expect(() => assertRuntimeTransition('CREATED', 'RUNNING')).toThrow(
        /Invalid runtime transition/,
      );
    });
  });

  describe('computeRuntimeHealth', () => {
    it('maps FAILED to UNHEALTHY', () => {
      expect(computeRuntimeHealth({ state: 'FAILED', recoveryCount: 0 })).toBe('UNHEALTHY');
    });

    it('maps DEGRADED / RECOVERING to DEGRADED', () => {
      expect(computeRuntimeHealth({ state: 'DEGRADED', recoveryCount: 0 })).toBe('DEGRADED');
      expect(computeRuntimeHealth({ state: 'RECOVERING', recoveryCount: 0 })).toBe('DEGRADED');
    });

    it('maps CREATED / INITIALIZING / STOPPED to UNKNOWN', () => {
      expect(computeRuntimeHealth({ state: 'CREATED', recoveryCount: 0 })).toBe('UNKNOWN');
      expect(computeRuntimeHealth({ state: 'INITIALIZING', recoveryCount: 0 })).toBe('UNKNOWN');
      expect(computeRuntimeHealth({ state: 'STOPPED', recoveryCount: 0 })).toBe('UNKNOWN');
    });

    it('reports HEALTHY for a fresh running session', () => {
      expect(
        computeRuntimeHealth({
          state: 'RUNNING',
          recoveryCount: 0,
          lastHeartbeatAt: new Date(),
        }),
      ).toBe('HEALTHY');
    });

    it('degrades an active session with a stale heartbeat', () => {
      const now = new Date('2026-07-01T12:00:00Z');
      const stale = new Date('2026-07-01T11:00:00Z');
      expect(
        computeRuntimeHealth({
          state: 'RUNNING',
          recoveryCount: 0,
          lastHeartbeatAt: stale,
          now,
        }),
      ).toBe('DEGRADED');
    });

    it('degrades once the recovery threshold is reached', () => {
      expect(
        computeRuntimeHealth({
          state: 'RUNNING',
          recoveryCount: RUNTIME_RECOVERY_HEALTH_THRESHOLD,
          lastHeartbeatAt: new Date(),
        }),
      ).toBe('DEGRADED');
    });
  });

  describe('resolveRecoveryTargetState', () => {
    it('returns to the captured state when it is recoverable', () => {
      expect(resolveRecoveryTargetState('CHECKPOINT_RESTORE', 'RUNNING')).toBe('RUNNING');
      expect(resolveRecoveryTargetState('RUNTIME_ROLLBACK', 'WAITING')).toBe('WAITING');
    });

    it('falls back to READY for non-recoverable captured states', () => {
      expect(resolveRecoveryTargetState('CHECKPOINT_RESTORE', 'CREATED')).toBe('READY');
      expect(resolveRecoveryTargetState('CHECKPOINT_RESTORE', null)).toBe('READY');
    });

    it('resumes to RUNNING and crash/continuity recover to READY', () => {
      expect(resolveRecoveryTargetState('SESSION_RESUME')).toBe('RUNNING');
      expect(resolveRecoveryTargetState('CRASH_RECOVERY')).toBe('READY');
      expect(resolveRecoveryTargetState('CONTINUITY_RECOVERY')).toBe('READY');
    });
  });

  describe('canInitiateRecovery', () => {
    it('blocks recovery from non-recoverable states', () => {
      expect(canInitiateRecovery('CREATED', 'CRASH_RECOVERY')).toBe(false);
      expect(canInitiateRecovery('ARCHIVED', 'CHECKPOINT_RESTORE')).toBe(false);
    });

    it('allows generic recovery from recoverable states', () => {
      expect(canInitiateRecovery('FAILED', 'CHECKPOINT_RESTORE')).toBe(true);
      expect(canInitiateRecovery('DEGRADED', 'CRASH_RECOVERY')).toBe(true);
    });

    it('restricts SESSION_RESUME to paused/stopped/degraded postures', () => {
      expect(canInitiateRecovery('PAUSED', 'SESSION_RESUME')).toBe(true);
      expect(canInitiateRecovery('STOPPED', 'SESSION_RESUME')).toBe(true);
      expect(canInitiateRecovery('RUNNING', 'SESSION_RESUME')).toBe(false);
    });
  });

  describe('continuity lineage + sequencing', () => {
    it('nextSequence increments from null/undefined and numbers', () => {
      expect(nextSequence(undefined)).toBe(1);
      expect(nextSequence(null)).toBe(1);
      expect(nextSequence(4)).toBe(5);
    });

    it('deriveLineage inherits the root and increments continuity', () => {
      expect(
        deriveLineage({
          parentLineageRoot: 'root-1',
          parentSessionId: 'sess-2',
          parentContinuitySeq: 2,
        }),
      ).toEqual({ lineageRoot: 'root-1', parentSessionId: 'sess-2', continuitySeq: 3 });
    });

    it('deriveLineage promotes the parent to root when no root exists', () => {
      expect(deriveLineage({ parentSessionId: 'sess-9' })).toEqual({
        lineageRoot: 'sess-9',
        parentSessionId: 'sess-9',
        continuitySeq: 1,
      });
    });

    it('recoverable state helper matches the recovery policy', () => {
      expect(isRecoverableRuntimeState('FAILED')).toBe(true);
      expect(isRecoverableRuntimeState('CREATED')).toBe(false);
    });
  });
});

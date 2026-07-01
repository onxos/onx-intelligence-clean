import {
  assertExchangeTransition,
  clamp01,
  computeChecksum,
  computeTrustScore,
  coversAllDimensions,
  deriveLineage,
  meetsTrustThreshold,
  nextExchangeStage,
  resolveOwnershipClass,
  resolveVerificationState,
  validateExchange,
  verifyChecksum,
  type ValidationInputs,
} from './exchange-engine';
import { isTerminalExchangeStage, isValidExchangeTransition } from './exchange.constants';

describe('exchange-engine', () => {
  describe('pipeline transitions', () => {
    it('accepts canonical forward transitions', () => {
      expect(isValidExchangeTransition('INTEND', 'COMPREHEND')).toBe(true);
      expect(isValidExchangeTransition('CAPITALIZE', 'COMPLETE')).toBe(true);
      expect(() => assertExchangeTransition('VALIDATE', 'TRANSFER')).not.toThrow();
    });

    it('accepts failing to FAILED from any active stage', () => {
      expect(isValidExchangeTransition('VALIDATE', 'FAILED')).toBe(true);
      expect(() => assertExchangeTransition('VERIFY', 'FAILED')).not.toThrow();
    });

    it('rejects invalid and self transitions', () => {
      expect(isValidExchangeTransition('INTEND', 'TRANSFER')).toBe(false);
      expect(isValidExchangeTransition('INTEND', 'INTEND')).toBe(false);
      expect(() => assertExchangeTransition('INTEND', 'COMPLETE')).toThrow(
        /Invalid exchange stage/,
      );
    });

    it('marks terminal stages and stops nextExchangeStage', () => {
      expect(isTerminalExchangeStage('COMPLETE')).toBe(true);
      expect(isTerminalExchangeStage('FAILED')).toBe(true);
      expect(isTerminalExchangeStage('INTEND')).toBe(false);
      expect(nextExchangeStage('INTEND')).toBe('COMPREHEND');
      expect(nextExchangeStage('COMPLETE')).toBeNull();
      expect(nextExchangeStage('FAILED')).toBeNull();
    });
  });

  describe('trust scoring', () => {
    it('clamps values into [0,1]', () => {
      expect(clamp01(-2)).toBe(0);
      expect(clamp01(5)).toBe(1);
      expect(clamp01(0.4)).toBe(0.4);
      expect(clamp01(Number.NaN)).toBe(0);
    });

    it('computes a full-trust score of 1 for maximal inputs', () => {
      const score = computeTrustScore({
        authority: 'SOVEREIGN',
        confidence: 1,
        verification: 'VERIFIED',
        integrityVerified: true,
        hasProvenance: true,
        traceable: true,
      });
      expect(score).toBe(1);
      expect(meetsTrustThreshold(score)).toBe(true);
    });

    it('computes a low score for weak inputs and fails the threshold', () => {
      const score = computeTrustScore({
        authority: 'OPERATIONAL',
        confidence: 0,
        verification: 'UNVERIFIED',
        integrityVerified: false,
        hasProvenance: false,
        traceable: false,
      });
      expect(score).toBeLessThan(0.6);
      expect(meetsTrustThreshold(score)).toBe(false);
    });
  });

  describe('verification state', () => {
    it('rejects when integrity fails', () => {
      expect(resolveVerificationState(false, 1)).toBe('REJECTED');
    });

    it('verifies when integrity holds and trust meets threshold', () => {
      expect(resolveVerificationState(true, 0.9)).toBe('VERIFIED');
    });

    it('is pending when integrity holds but trust is low', () => {
      expect(resolveVerificationState(true, 0.2)).toBe('PENDING');
    });
  });

  describe('checksum integrity', () => {
    it('matches for identical payloads and mismatches otherwise', () => {
      const payload = { a: 1, b: 'x' };
      const checksum = computeChecksum(payload);
      expect(verifyChecksum(payload, checksum)).toBe(true);
      expect(verifyChecksum({ a: 2 }, checksum)).toBe(false);
    });
  });

  describe('ownership resolution', () => {
    it('honours a valid requested class', () => {
      expect(resolveOwnershipClass({ requested: 'AGENT' })).toBe('AGENT');
    });

    it('defaults unknown/absent to WORKSPACE', () => {
      expect(resolveOwnershipClass({})).toBe('WORKSPACE');
    });

    it('gates FOUNDER behind founder authority', () => {
      expect(resolveOwnershipClass({ requested: 'FOUNDER', hasFounderAuthority: false })).toBe(
        'WORKSPACE',
      );
      expect(resolveOwnershipClass({ requested: 'FOUNDER', hasFounderAuthority: true })).toBe(
        'FOUNDER',
      );
    });
  });

  describe('lineage derivation', () => {
    it('starts a root chain at depth 0', () => {
      const lineage = deriveLineage({ origin: 'a', destination: 'b' }, 'self-1');
      expect(lineage.depth).toBe(0);
      expect(lineage.executionChain).toEqual(['self-1']);
      expect(lineage.parentTransactionId).toBeNull();
    });

    it('extends a parent chain and increments depth', () => {
      const lineage = deriveLineage(
        { parentTransactionId: 'p1', parentDepth: 2, executionChain: ['root', 'p1'] },
        'self-2',
      );
      expect(lineage.depth).toBe(3);
      expect(lineage.executionChain).toEqual(['root', 'p1', 'self-2']);
      expect(lineage.parentTransactionId).toBe('p1');
    });
  });

  describe('validation engine', () => {
    const base: ValidationInputs = {
      ownershipClass: 'WORKSPACE',
      authority: 'OPERATIONAL',
      actorWorkspaceId: 'ws-1',
      transactionWorkspaceId: 'ws-1',
      hasPayload: true,
      integrityVerified: true,
      hasLineage: true,
      trustScore: 0.9,
      policyViolations: [],
    };

    it('passes and covers all dimensions when everything is valid', () => {
      const result = validateExchange(base);
      expect(result.passed).toBe(true);
      expect(coversAllDimensions(result.checks)).toBe(true);
    });

    it('fails on workspace mismatch', () => {
      const result = validateExchange({ ...base, transactionWorkspaceId: 'ws-2' });
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.dimension === 'workspace')?.outcome).toBe('FAIL');
    });

    it('fails on missing payload', () => {
      const result = validateExchange({ ...base, hasPayload: false });
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.dimension === 'schema')?.outcome).toBe('FAIL');
    });

    it('fails on integrity mismatch', () => {
      const result = validateExchange({ ...base, integrityVerified: false });
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.dimension === 'integrity')?.outcome).toBe('FAIL');
    });

    it('fails FOUNDER ownership without elevated authority', () => {
      const result = validateExchange({
        ...base,
        ownershipClass: 'FOUNDER',
        authority: 'OPERATIONAL',
      });
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.dimension === 'authority')?.outcome).toBe('FAIL');
    });

    it('fails on policy violations', () => {
      const result = validateExchange({ ...base, policyViolations: ['trust below minimum'] });
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.dimension === 'policy')?.outcome).toBe('FAIL');
    });

    it('warns (non-blocking) on absent lineage and low trust', () => {
      const result = validateExchange({ ...base, hasLineage: false, trustScore: 0.2 });
      expect(result.passed).toBe(true);
      expect(result.checks.find((c) => c.dimension === 'lineage')?.outcome).toBe('WARN');
      expect(result.checks.find((c) => c.dimension === 'trust')?.outcome).toBe('WARN');
    });
  });
});

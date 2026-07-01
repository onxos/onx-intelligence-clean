import {
  aggregateCertification,
  clamp01,
  computeResilienceScore,
  detectContradiction,
  detectContradictions,
  evaluateAllGates,
  evaluateGate,
  meetsResilienceThreshold,
  simulateInjection,
  stressOutcome,
} from './proof-engine';
import { CERTIFICATION_GATES, FAILURE_INJECTION_TYPES } from './proof.constants';

describe('proof-engine', () => {
  describe('clamp01', () => {
    it('clamps into the [0,1] interval and guards NaN', () => {
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(2)).toBe(1);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });

  describe('evaluateGate', () => {
    it('PASSes when there are no violations', () => {
      const result = evaluateGate('KNOWLEDGE_INTEGRITY', {
        knowledgeObjects: 10,
        knowledgeViolations: 0,
      });
      expect(result.outcome).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.constitutionalRefs).toContain('D11');
    });

    it('PASSes when nothing was observed (nothing to disprove)', () => {
      const result = evaluateGate('MEMORY_INTEGRITY', {});
      expect(result.outcome).toBe('PASS');
    });

    it('WARNs at 1-2 violations', () => {
      expect(evaluateGate('RUNTIME_INTEGRITY', { runtimeViolations: 1 }).outcome).toBe('WARNING');
      expect(evaluateGate('RUNTIME_INTEGRITY', { runtimeViolations: 2 }).outcome).toBe('WARNING');
    });

    it('FAILs at 3-5 violations', () => {
      expect(evaluateGate('EXCHANGE_INTEGRITY', { exchangeViolations: 3 }).outcome).toBe('FAIL');
      expect(evaluateGate('EXCHANGE_INTEGRITY', { exchangeViolations: 5 }).outcome).toBe('FAIL');
    });

    it('is CRITICAL at 6+ violations with a zero score', () => {
      const result = evaluateGate('SECURITY_INTEGRITY', { securityViolations: 6 });
      expect(result.outcome).toBe('CRITICAL');
      expect(result.score).toBe(0);
    });
  });

  describe('evaluateAllGates', () => {
    it('returns one result per canonical gate', () => {
      const results = evaluateAllGates({});
      expect(results).toHaveLength(CERTIFICATION_GATES.length);
      expect(results.map((r) => r.gate).sort()).toEqual([...CERTIFICATION_GATES].sort());
    });
  });

  describe('aggregateCertification', () => {
    it('passes a clean sweep', () => {
      const summary = aggregateCertification(evaluateAllGates({}));
      expect(summary.passed).toBe(true);
      expect(summary.outcome).toBe('PASS');
      expect(summary.gatesPassed).toBe(CERTIFICATION_GATES.length);
    });

    it('takes the worst gate outcome and fails on FAIL', () => {
      const summary = aggregateCertification(evaluateAllGates({ capitalViolations: 4 }));
      expect(summary.outcome).toBe('FAIL');
      expect(summary.passed).toBe(false);
    });

    it('returns a benign default for an empty gate set', () => {
      const summary = aggregateCertification([]);
      expect(summary.passed).toBe(true);
      expect(summary.gatesTotal).toBe(0);
    });
  });

  describe('simulateInjection', () => {
    it('recovers with full defenses', () => {
      const r = simulateInjection('RUNTIME_INTERRUPTION');
      expect(r.status).toBe('RECOVERED');
      expect(r.outcome).toBe('PASS');
      expect(r.recovered).toBe(true);
    });

    it('contains but does not recover', () => {
      const r = simulateInjection('CORRUPTED_MEMORY', { canRecover: false });
      expect(r.status).toBe('CONTAINED');
      expect(r.outcome).toBe('WARNING');
    });

    it('detects but does not contain', () => {
      const r = simulateInjection('EVIDENCE_LOSS', { canContain: false });
      expect(r.status).toBe('DETECTED');
      expect(r.outcome).toBe('FAIL');
    });

    it('is unrecovered and CRITICAL when undetectable', () => {
      const r = simulateInjection('STATE_CORRUPTION', { canDetect: false });
      expect(r.status).toBe('UNRECOVERED');
      expect(r.outcome).toBe('CRITICAL');
    });

    it('maps each injection type to a certification gate', () => {
      for (const type of FAILURE_INJECTION_TYPES) {
        expect(CERTIFICATION_GATES).toContain(simulateInjection(type).gate);
      }
    });
  });

  describe('computeResilienceScore', () => {
    it('scores a fully recovered battery at 1', () => {
      const results = FAILURE_INJECTION_TYPES.map((t) => simulateInjection(t));
      expect(computeResilienceScore(results)).toBe(1);
      expect(meetsResilienceThreshold(computeResilienceScore(results))).toBe(true);
    });

    it('weights contained (0.5) and detected (0.25)', () => {
      const contained = simulateInjection('CORRUPTED_MEMORY', { canRecover: false });
      const detected = simulateInjection('EVIDENCE_LOSS', { canContain: false });
      expect(computeResilienceScore([contained, detected])).toBeCloseTo(0.375, 4);
    });

    it('scores an empty battery at 1', () => {
      expect(computeResilienceScore([])).toBe(1);
    });
  });

  describe('stressOutcome', () => {
    it('returns the worst outcome across injections', () => {
      const results = [
        simulateInjection('RUNTIME_INTERRUPTION'),
        simulateInjection('STATE_CORRUPTION', { canDetect: false }),
      ];
      expect(stressOutcome(results)).toBe('CRITICAL');
    });

    it('returns PASS for an empty battery', () => {
      expect(stressOutcome([])).toBe('PASS');
    });
  });

  describe('detectContradiction', () => {
    it('returns null when values agree', () => {
      expect(
        detectContradiction({ type: 'KNOWLEDGE', leftValue: 'a', rightValue: 'a' }),
      ).toBeNull();
    });

    it('detects a conflict with severity, action and refs', () => {
      const c = detectContradiction({
        type: 'GOVERNANCE',
        leftReferenceId: 'l1',
        leftValue: true,
        rightReferenceId: 'r1',
        rightValue: false,
      });
      expect(c).not.toBeNull();
      expect(c?.severity).toBe('CRITICAL');
      expect(c?.recommendedAction).toBeTruthy();
      expect(c?.constitutionalRefs.length).toBeGreaterThan(0);
      expect(c?.leftReferenceId).toBe('l1');
    });

    it('compares structurally for objects', () => {
      expect(
        detectContradiction({ type: 'CAPITAL', leftValue: { a: 1 }, rightValue: { a: 1 } }),
      ).toBeNull();
      expect(
        detectContradiction({ type: 'CAPITAL', leftValue: { a: 1 }, rightValue: { a: 2 } }),
      ).not.toBeNull();
    });
  });

  describe('detectContradictions', () => {
    it('filters agreements and keeps conflicts', () => {
      const detected = detectContradictions([
        { type: 'KNOWLEDGE', leftValue: 1, rightValue: 1 },
        { type: 'INTENT', leftValue: 'x', rightValue: 'y' },
      ]);
      expect(detected).toHaveLength(1);
      expect(detected[0].type).toBe('INTENT');
      expect(detected[0].severity).toBe('CRITICAL');
    });
  });
});

import {
  checkAlignment,
  computeFlourishing,
  deriveCapitalizationSignal,
  detectDegradation,
  resolveRisk,
  resolveTrend,
  scoreDimension,
  shouldSignalAllocation,
  validateGovernance,
} from './ifc-engine';

describe('ifc-engine (IFC)', () => {
  // ------------------------------------------------------- dimension scoring
  describe('scoreDimension', () => {
    it('returns zero with no active indicators', () => {
      expect(scoreDimension([])).toEqual({ score: 0, confidence: 0 });
      expect(scoreDimension([{ value: 1, weight: 1, confidence: 1, status: 'INACTIVE' }])).toEqual({
        score: 0,
        confidence: 0,
      });
    });

    it('computes a weighted mean of active indicators', () => {
      const r = scoreDimension([
        { value: 1, weight: 3, confidence: 0.9, status: 'ACTIVE' },
        { value: 0, weight: 1, confidence: 0.5, status: 'ACTIVE' },
      ]);
      expect(r.score).toBeCloseTo(0.75, 5);
      expect(r.confidence).toBeCloseTo(0.8, 5);
    });

    it('falls back to a simple mean when weights are zero', () => {
      const r = scoreDimension([
        { value: 0.4, weight: 0, confidence: 0.6, status: 'ACTIVE' },
        { value: 0.6, weight: 0, confidence: 0.4, status: 'ACTIVE' },
      ]);
      expect(r.score).toBeCloseTo(0.5, 5);
      expect(r.confidence).toBeCloseTo(0.5, 5);
    });
  });

  // ------------------------------------------------------------- risk / trend
  describe('resolveRisk', () => {
    it('maps the index onto risk bands', () => {
      expect(resolveRisk(0.9)).toBe('LOW');
      expect(resolveRisk(0.6)).toBe('MODERATE');
      expect(resolveRisk(0.35)).toBe('ELEVATED');
      expect(resolveRisk(0.1)).toBe('CRITICAL');
    });
  });

  describe('resolveTrend', () => {
    it('classifies deltas against the epsilon', () => {
      expect(resolveTrend(0.1)).toBe('RISING');
      expect(resolveTrend(-0.1)).toBe('FALLING');
      expect(resolveTrend(0.001)).toBe('STABLE');
    });
  });

  describe('detectDegradation', () => {
    it('flags steep drops and critical risk', () => {
      expect(detectDegradation(-0.2, 'LOW')).toBe(true);
      expect(detectDegradation(0, 'CRITICAL')).toBe(true);
      expect(detectDegradation(-0.01, 'LOW')).toBe(false);
    });
  });

  // ------------------------------------------------------- flourishing index
  describe('computeFlourishing', () => {
    it('computes a weighted index with no previous baseline (stable trend)', () => {
      const r = computeFlourishing({
        dimensions: [
          { kind: 'KNOWLEDGE', weight: 0.5, score: 0.8, confidence: 1, status: 'ACTIVE' },
          { kind: 'CAPITAL', weight: 0.5, score: 0.6, confidence: 1, status: 'ACTIVE' },
        ],
        previousIndex: null,
      });
      expect(r.flourishingIndex).toBeGreaterThan(0);
      expect(r.trend).toBe('STABLE');
      expect(r.delta).toBe(0);
      expect(r.dimensionScores.length).toBe(2);
    });

    it('derives a rising trend and positive delta against a lower baseline', () => {
      const r = computeFlourishing({
        dimensions: [{ kind: 'KNOWLEDGE', weight: 1, score: 0.9, confidence: 1, status: 'ACTIVE' }],
        previousIndex: 0.2,
      });
      expect(r.delta).toBeGreaterThan(0);
      expect(r.trend).toBe('RISING');
      expect(r.risk).toBe('LOW');
    });

    it('flags degradation on a steep fall', () => {
      const r = computeFlourishing({
        dimensions: [{ kind: 'CAPITAL', weight: 1, score: 0.2, confidence: 0.5, status: 'ACTIVE' }],
        previousIndex: 0.9,
      });
      expect(r.trend).toBe('FALLING');
      expect(r.degraded).toBe(true);
    });

    it('ignores inactive dimensions', () => {
      const r = computeFlourishing({
        dimensions: [
          { kind: 'KNOWLEDGE', weight: 1, score: 1, confidence: 1, status: 'ACTIVE' },
          { kind: 'TRUST', weight: 1, score: 0, confidence: 0, status: 'INACTIVE' },
        ],
        previousIndex: null,
      });
      expect(r.flourishingIndex).toBeGreaterThan(0.5);
    });
  });

  // ----------------------------------------------------------- capitalization
  describe('deriveCapitalizationSignal', () => {
    it('emits GROWTH when rising', () => {
      const s = deriveCapitalizationSignal({
        flourishingIndex: 0.7,
        confidence: 0.8,
        trend: 'RISING',
        degraded: false,
      });
      expect(s.kind).toBe('GROWTH');
      expect(s.magnitude).toBeCloseTo(0.56, 5);
    });

    it('emits DECAY when degraded or falling', () => {
      expect(
        deriveCapitalizationSignal({
          flourishingIndex: 0.7,
          confidence: 0.8,
          trend: 'STABLE',
          degraded: true,
        }).kind,
      ).toBe('DECAY');
      expect(
        deriveCapitalizationSignal({
          flourishingIndex: 0.7,
          confidence: 0.8,
          trend: 'FALLING',
          degraded: false,
        }).kind,
      ).toBe('DECAY');
    });

    it('emits PRESERVATION when stable and healthy', () => {
      expect(
        deriveCapitalizationSignal({
          flourishingIndex: 0.8,
          confidence: 0.9,
          trend: 'STABLE',
          degraded: false,
        }).kind,
      ).toBe('PRESERVATION');
    });

    it('emits CONTRIBUTION when stable but not yet compounding', () => {
      expect(
        deriveCapitalizationSignal({
          flourishingIndex: 0.5,
          confidence: 0.6,
          trend: 'STABLE',
          degraded: false,
        }).kind,
      ).toBe('CONTRIBUTION');
    });
  });

  describe('shouldSignalAllocation', () => {
    it('recommends allocation only when healthy and confident', () => {
      expect(
        shouldSignalAllocation({ flourishingIndex: 0.7, confidence: 0.6, degraded: false }),
      ).toBe(true);
      expect(
        shouldSignalAllocation({ flourishingIndex: 0.7, confidence: 0.6, degraded: true }),
      ).toBe(false);
      expect(
        shouldSignalAllocation({ flourishingIndex: 0.4, confidence: 0.9, degraded: false }),
      ).toBe(false);
    });
  });

  // ------------------------------------------------------------- alignment (E)
  describe('checkAlignment', () => {
    it('requires a founder reference for authority', () => {
      const r = checkAlignment({
        flourishingIndex: 0.9,
        founderAlignmentScore: 0.9,
        degraded: false,
      });
      expect(r.founderAuthorityValid).toBe(false);
      expect(r.aligned).toBe(false);
    });

    it('is aligned with a linked intent and healthy flourishing', () => {
      const r = checkAlignment({
        flourishingIndex: 0.8,
        founderAlignmentScore: 0.8,
        degraded: false,
        intentReferenceId: 'fic-1',
      });
      expect(r.founderAuthorityValid).toBe(true);
      expect(r.aligned).toBe(true);
      expect(r.alignmentScore).toBeGreaterThan(0.5);
    });

    it('is misaligned when degraded', () => {
      const r = checkAlignment({
        flourishingIndex: 0.8,
        founderAlignmentScore: 0.9,
        degraded: true,
        objectiveReference: 'obj-1',
      });
      expect(r.aligned).toBe(false);
    });
  });

  // ------------------------------------------------------------ governance (F)
  describe('validateGovernance', () => {
    it('rejects an overridden profile', () => {
      const r = validateGovernance({
        overridden: true,
        flourishingIndex: 0.9,
        confidence: 0.9,
        degraded: false,
      });
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.includes('override'))).toBe(true);
    });

    it('enforces policy minimums', () => {
      const r = validateGovernance({
        overridden: false,
        flourishingIndex: 0.3,
        confidence: 0.2,
        degraded: false,
        minIndex: 0.5,
        minConfidence: 0.4,
      });
      expect(r.valid).toBe(false);
      expect(r.issues.length).toBe(2);
    });

    it('passes a healthy profile', () => {
      const r = validateGovernance({
        overridden: false,
        flourishingIndex: 0.8,
        confidence: 0.7,
        degraded: false,
        minIndex: 0.5,
        minConfidence: 0.4,
      });
      expect(r.valid).toBe(true);
    });
  });
});

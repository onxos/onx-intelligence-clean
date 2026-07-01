import {
  aggregateScores,
  calculateConfidence,
  calculateRawScore,
  classifyProgressState,
  classifyTrend,
  compareBenchmark,
  computeScore,
  isLowConfidence,
  normalizeScore,
} from './measurement-engine';

describe('measurement-engine (D17 scoring core)', () => {
  describe('calculateRawScore', () => {
    it('returns 0 for no components', () => {
      expect(calculateRawScore([])).toBe(0);
    });

    it('computes an unweighted mean when weights are absent', () => {
      expect(
        calculateRawScore([
          { key: 'a', value: 40 },
          { key: 'b', value: 60 },
        ]),
      ).toBe(50);
    });

    it('computes a weighted mean', () => {
      const raw = calculateRawScore([
        { key: 'a', value: 100, weight: 3 },
        { key: 'b', value: 0, weight: 1 },
      ]);
      expect(raw).toBe(75);
    });

    it('returns 0 when all weights are non-positive', () => {
      expect(calculateRawScore([{ key: 'a', value: 10, weight: 0 }])).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    it('defaults each component confidence to 1', () => {
      expect(calculateConfidence([{ key: 'a', value: 10 }])).toBe(1);
    });

    it('computes a weighted confidence mean and clamps to [0,1]', () => {
      const confidence = calculateConfidence([
        { key: 'a', value: 10, confidence: 0.5, weight: 1 },
        { key: 'b', value: 10, confidence: 0.9, weight: 1 },
      ]);
      expect(confidence).toBeCloseTo(0.7, 6);
    });
  });

  describe('normalizeScore', () => {
    it('maps a raw score onto a 0-100 band', () => {
      expect(normalizeScore(5, 0, 10)).toBe(50);
    });

    it('clamps out-of-range values', () => {
      expect(normalizeScore(20, 0, 10)).toBe(100);
      expect(normalizeScore(-5, 0, 10)).toBe(0);
    });

    it('falls back to a clamp when the band is degenerate', () => {
      expect(normalizeScore(42, 10, 10)).toBe(42);
    });
  });

  describe('classifyTrend', () => {
    it('is STABLE when movement is below the plateau threshold', () => {
      expect(classifyTrend(0.4)).toBe('STABLE');
    });

    it('is RISING for meaningful positive movement', () => {
      expect(classifyTrend(5)).toBe('RISING');
    });

    it('is FALLING for meaningful negative movement', () => {
      expect(classifyTrend(-5)).toBe('FALLING');
    });

    it('is VOLATILE when recent deltas swing widely', () => {
      expect(classifyTrend(5, [0, 80, 5, 90])).toBe('VOLATILE');
    });
  });

  describe('classifyProgressState', () => {
    it('is NASCENT on the first measurement', () => {
      expect(classifyProgressState(20, 0, null)).toBe('NASCENT');
    });

    it('is COMPLETION at or above the completion threshold', () => {
      expect(classifyProgressState(100, 5, 90)).toBe('COMPLETION');
    });

    it('is PLATEAU when the delta is negligible', () => {
      expect(classifyProgressState(50, 0.2, 50)).toBe('PLATEAU');
    });

    it('is REGRESSION when the score falls', () => {
      expect(classifyProgressState(40, -10, 50)).toBe('REGRESSION');
    });

    it('is GROWTH for early positive movement', () => {
      expect(classifyProgressState(45, 10, 35)).toBe('GROWTH');
    });

    it('is IMPROVEMENT for sustained positive movement', () => {
      expect(classifyProgressState(70, 10, 60)).toBe('IMPROVEMENT');
    });
  });

  describe('computeScore', () => {
    it('produces a full result on the first measurement (NASCENT)', () => {
      const result = computeScore({
        components: [{ key: 'a', value: 5 }],
        normalizationMin: 0,
        normalizationMax: 10,
        previousNormalizedScore: null,
      });
      expect(result.normalizedScore).toBe(50);
      expect(result.delta).toBe(0);
      expect(result.progressState).toBe('NASCENT');
      expect(result.confidence).toBe(1);
    });

    it('computes delta and improvement against a prior score', () => {
      const result = computeScore({
        components: [{ key: 'a', value: 8 }],
        normalizationMin: 0,
        normalizationMax: 10,
        previousNormalizedScore: 60,
      });
      expect(result.normalizedScore).toBe(80);
      expect(result.delta).toBe(20);
      expect(result.trend).toBe('RISING');
      expect(result.progressState).toBe('IMPROVEMENT');
    });

    it('applies the profile weight to the weighted score', () => {
      const result = computeScore({
        components: [{ key: 'a', value: 10 }],
        profileWeight: 2,
      });
      expect(result.weightedScore).toBe(20);
    });
  });

  describe('compareBenchmark', () => {
    it('meets a GTE benchmark when the score is higher', () => {
      expect(compareBenchmark(80, 70, 'GTE')).toEqual({ benchmarkDelta: 10, met: true });
    });

    it('fails a GTE benchmark when the score is lower', () => {
      expect(compareBenchmark(60, 70, 'GTE').met).toBe(false);
    });

    it('meets an LTE benchmark when the score is lower', () => {
      expect(compareBenchmark(60, 70, 'LTE').met).toBe(true);
    });

    it('meets an EQ benchmark within the plateau tolerance', () => {
      expect(compareBenchmark(70.5, 70, 'EQ').met).toBe(true);
      expect(compareBenchmark(80, 70, 'EQ').met).toBe(false);
    });
  });

  describe('aggregateScores', () => {
    it('returns 0 for no entries', () => {
      expect(aggregateScores([])).toBe(0);
    });

    it('computes a weighted composite', () => {
      const composite = aggregateScores([
        { normalizedScore: 100, weight: 3 },
        { normalizedScore: 0, weight: 1 },
      ]);
      expect(composite).toBe(75);
    });
  });

  describe('isLowConfidence', () => {
    it('flags confidence below the threshold', () => {
      expect(isLowConfidence(0.2)).toBe(true);
      expect(isLowConfidence(0.9)).toBe(false);
    });
  });
});

import {
  aggregateContext,
  aggregateEvidence,
  buildReasoningTrace,
  clamp01,
  deriveAlternativePaths,
  evaluateConstraints,
  resolveModeProfile,
  resolveVerdict,
  runReasoning,
  scoreConfidence,
  validateReasoning,
} from './reasoning-engine';

describe('reasoning-engine (pure)', () => {
  describe('clamp01', () => {
    it('clamps out-of-range and non-finite values', () => {
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(2)).toBe(1);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });

  describe('resolveModeProfile', () => {
    it('returns a profile whose weights sum to 1', () => {
      const profile = resolveModeProfile('FOUNDER_GUIDED');
      const sum =
        profile.evidenceWeight +
        profile.constraintWeight +
        profile.contextWeight +
        profile.founderWeight;
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('aggregateContext', () => {
    it('returns zero for empty context', () => {
      expect(aggregateContext([])).toEqual({
        confidence: 0,
        count: 0,
        runtimes: [],
        hasKnowledge: false,
      });
    });

    it('computes a weighted mean and detects knowledge runtimes', () => {
      const agg = aggregateContext([
        { runtime: 'D16', role: 'KNOWLEDGE', weight: 2, confidence: 1 },
        { runtime: 'D17', role: 'MEASUREMENT', weight: 1, confidence: 0.4 },
      ]);
      expect(agg.count).toBe(2);
      expect(agg.hasKnowledge).toBe(true);
      expect(agg.confidence).toBeCloseTo((2 * 1 + 1 * 0.4) / 3, 5);
    });

    it('flags no knowledge when only non-knowledge runtimes present', () => {
      const agg = aggregateContext([{ runtime: 'D19', role: 'EXCHANGE', confidence: 0.9 }]);
      expect(agg.hasKnowledge).toBe(false);
    });
  });

  describe('aggregateEvidence', () => {
    it('returns zero for empty evidence', () => {
      expect(aggregateEvidence([])).toEqual({ confidence: 0, count: 0 });
    });

    it('averages evidence confidence', () => {
      const agg = aggregateEvidence([{ confidence: 0.8 }, { confidence: 0.4 }]);
      expect(agg.count).toBe(2);
      expect(agg.confidence).toBeCloseTo(0.6, 5);
    });
  });

  describe('evaluateConstraints', () => {
    it('is vacuously satisfied with no constraints', () => {
      const result = evaluateConstraints([]);
      expect(result.ratio).toBe(1);
      expect(result.constraintsSatisfied).toBe(true);
    });

    it('marks required unsatisfied constraints as contested', () => {
      const result = evaluateConstraints([
        { name: 'budget', satisfied: true },
        { name: 'authority', satisfied: false, required: true },
      ]);
      expect(result.constraintsSatisfied).toBe(false);
      expect(result.violations).toContain('authority');
      expect(result.ratio).toBeCloseTo(0.5, 5);
    });

    it('tolerates optional unsatisfied constraints', () => {
      const result = evaluateConstraints([
        { name: 'nice-to-have', satisfied: false, required: false },
      ]);
      expect(result.constraintsSatisfied).toBe(true);
      expect(result.violations).toContain('nice-to-have');
    });
  });

  describe('scoreConfidence', () => {
    it('blends signals via the mode profile', () => {
      const score = scoreConfidence({
        mode: 'INDUCTIVE',
        contextConfidence: 1,
        evidenceConfidence: 1,
        constraintRatio: 1,
      });
      expect(score).toBeCloseTo(1, 5);
    });

    it('adds founder weight only when founder present', () => {
      const withFounder = scoreConfidence({
        mode: 'FOUNDER_GUIDED',
        contextConfidence: 0,
        evidenceConfidence: 0,
        constraintRatio: 0,
        founderPresent: true,
      });
      const withoutFounder = scoreConfidence({
        mode: 'FOUNDER_GUIDED',
        contextConfidence: 0,
        evidenceConfidence: 0,
        constraintRatio: 0,
        founderPresent: false,
      });
      expect(withFounder).toBeGreaterThan(withoutFounder);
      expect(withoutFounder).toBe(0);
    });
  });

  describe('resolveVerdict', () => {
    it('is CONTESTED when constraints not satisfied regardless of confidence', () => {
      expect(resolveVerdict(0.99, false)).toBe('CONTESTED');
    });

    it('maps confidence to verdict bands', () => {
      expect(resolveVerdict(0.8, true)).toBe('CONCLUSIVE');
      expect(resolveVerdict(0.6, true)).toBe('PLAUSIBLE');
      expect(resolveVerdict(0.2, true)).toBe('INCONCLUSIVE');
    });
  });

  describe('deriveAlternativePaths', () => {
    it('excludes the primary mode and is bounded and sorted', () => {
      const alts = deriveAlternativePaths('DEDUCTIVE', {
        contextConfidence: 0.5,
        evidenceConfidence: 0.9,
        constraintRatio: 0.3,
      });
      expect(alts.length).toBeLessThanOrEqual(3);
      expect(alts.every((a) => a.mode !== 'DEDUCTIVE')).toBe(true);
      for (let i = 1; i < alts.length; i += 1) {
        expect(alts[i - 1].confidence).toBeGreaterThanOrEqual(alts[i].confidence);
      }
    });
  });

  describe('buildReasoningTrace', () => {
    it('joins step kinds into a trace summary', () => {
      const trace = buildReasoningTrace([
        { kind: 'CONTEXT_LOADING', sequence: 0, summary: 'a', confidence: 1, output: {} },
        { kind: 'REASONING_TRACE', sequence: 1, summary: 'b', confidence: 1, output: {} },
      ]);
      expect(trace.summary).toBe('CONTEXT_LOADING -> REASONING_TRACE');
      expect(trace.stages).toHaveLength(2);
    });
  });

  describe('runReasoning', () => {
    it('produces a conclusive verdict for strong, consistent signals', () => {
      const outcome = runReasoning({
        mode: 'INDUCTIVE',
        question: 'Is flourishing improving?',
        contexts: [{ runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 }],
        evidence: [{ confidence: 1 }, { confidence: 0.9 }],
        constraints: [{ name: 'trust', satisfied: true }],
      });
      expect(outcome.verdict).toBe('CONCLUSIVE');
      expect(outcome.steps).toHaveLength(7);
      expect(outcome.hasKnowledge).toBe(true);
      expect(outcome.trace.summary).toContain('CONTEXT_LOADING');
      expect(outcome.alternatives.length).toBeGreaterThan(0);
    });

    it('contests the result when a required constraint fails', () => {
      const outcome = runReasoning({
        mode: 'CONSTRAINT',
        question: 'Should we proceed?',
        contexts: [{ runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 }],
        evidence: [{ confidence: 1 }],
        constraints: [{ name: 'authority', satisfied: false, required: true }],
      });
      expect(outcome.verdict).toBe('CONTESTED');
      expect(outcome.constraintsSatisfied).toBe(false);
      expect(outcome.violations).toContain('authority');
    });
  });

  describe('validateReasoning', () => {
    it('passes when all five dimensions hold', () => {
      const result = validateReasoning({
        mode: 'INDUCTIVE',
        contextConfidence: 0.9,
        evidenceConfidence: 0.8,
        evidenceCount: 2,
        hasKnowledge: true,
        constraintsSatisfied: true,
        hasConstitutionalRef: true,
        founderAuthorityValid: true,
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.checks).toHaveLength(5);
    });

    it('fails knowledge and evidence checks when absent', () => {
      const result = validateReasoning({
        mode: 'INDUCTIVE',
        contextConfidence: 0.9,
        evidenceConfidence: 0,
        evidenceCount: 0,
        hasKnowledge: false,
        constraintsSatisfied: true,
        hasConstitutionalRef: true,
        founderAuthorityValid: true,
      });
      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.kind === 'KNOWLEDGE')?.valid).toBe(false);
      expect(result.checks.find((c) => c.kind === 'EVIDENCE')?.valid).toBe(false);
    });

    it('fails constitutional check for founder modes without founder authority', () => {
      const result = validateReasoning({
        mode: 'FOUNDER_GUIDED',
        contextConfidence: 0.9,
        evidenceConfidence: 0.8,
        evidenceCount: 1,
        hasKnowledge: true,
        constraintsSatisfied: true,
        hasConstitutionalRef: true,
        founderAuthorityValid: false,
      });
      expect(result.checks.find((c) => c.kind === 'CONSTITUTIONAL')?.valid).toBe(false);
    });
  });
});

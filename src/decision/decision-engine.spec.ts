import {
  aggregateContext,
  analyzeConstraints,
  clamp01,
  estimateCandidateRisk,
  evaluateCandidates,
  rankAlternatives,
  resolveDecisionProfile,
  resolveRiskLevel,
  resolveVerdict,
  runDecision,
  scoreCandidate,
  validateDecision,
  type CandidateSignal,
} from './decision-engine';
import { DECISION_MODE_PROFILES } from './decision.constants';

describe('decision-engine', () => {
  describe('clamp01', () => {
    it('clamps out-of-range and non-finite values', () => {
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(2)).toBe(1);
      expect(clamp01(0.4)).toBeCloseTo(0.4);
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });

  describe('mode profiles', () => {
    it('every profile weight set sums to 1', () => {
      for (const profile of Object.values(DECISION_MODE_PROFILES)) {
        const sum =
          profile.benefitWeight +
          profile.reasoningWeight +
          profile.planningWeight +
          profile.capitalWeight +
          profile.constraintWeight +
          profile.contextWeight +
          profile.founderWeight;
        expect(sum).toBeCloseTo(1, 5);
      }
    });

    it('only FOUNDER mode carries founder weight', () => {
      expect(resolveDecisionProfile('FOUNDER').founderWeight).toBeGreaterThan(0);
      expect(resolveDecisionProfile('STRATEGIC').founderWeight).toBe(0);
    });
  });

  describe('aggregateContext', () => {
    it('returns zeros for an empty set', () => {
      const agg = aggregateContext([]);
      expect(agg.confidence).toBe(0);
      expect(agg.hasReasoning).toBe(false);
      expect(agg.hasPlanning).toBe(false);
      expect(agg.hasCapital).toBe(false);
    });

    it('detects reasoning, planning, knowledge and capital and derives capital support', () => {
      const agg = aggregateContext([
        { runtime: 'REASONING', role: 'REASONING', confidence: 1 },
        { runtime: 'PLANNING', role: 'PLAN', confidence: 0.9 },
        { runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 },
        { runtime: 'CAPITAL', role: 'CAPITAL', confidence: 0.8 },
      ]);
      expect(agg.hasReasoning).toBe(true);
      expect(agg.hasPlanning).toBe(true);
      expect(agg.hasKnowledge).toBe(true);
      expect(agg.hasCapital).toBe(true);
      expect(agg.capitalSupport).toBeCloseTo(0.8);
      expect(agg.count).toBe(4);
    });
  });

  describe('analyzeConstraints', () => {
    it('is vacuously satisfied when empty', () => {
      const a = analyzeConstraints([]);
      expect(a.constraintsSatisfied).toBe(true);
      expect(a.ratio).toBe(1);
    });

    it('fails when a required constraint is unsatisfied', () => {
      const a = analyzeConstraints([{ name: 'safety', satisfied: false, required: true }]);
      expect(a.constraintsSatisfied).toBe(false);
      expect(a.violations).toContain('safety');
    });

    it('tolerates unsatisfied optional constraints', () => {
      const a = analyzeConstraints([{ name: 'nice-to-have', satisfied: false, required: false }]);
      expect(a.constraintsSatisfied).toBe(true);
    });
  });

  describe('scoreCandidate', () => {
    it('scores a strong candidate above the selection threshold', () => {
      const score = scoreCandidate(
        {
          label: 'A',
          benefit: 0.9,
          reasoningConfidence: 0.9,
          planningReadiness: 0.9,
          capitalSupport: 0.9,
          constraintsSatisfied: true,
        },
        {
          mode: 'STRATEGIC',
          contextConfidence: 1,
          fallbackCapitalSupport: 0.9,
          founderPresent: false,
        },
      );
      expect(score).toBeGreaterThan(0.65);
    });
  });

  describe('estimateCandidateRisk / resolveRiskLevel', () => {
    it('bands the risk score', () => {
      expect(resolveRiskLevel(0.1)).toBe('LOW');
      expect(resolveRiskLevel(0.4)).toBe('MODERATE');
      expect(resolveRiskLevel(0.6)).toBe('ELEVATED');
      expect(resolveRiskLevel(0.9)).toBe('CRITICAL');
    });

    it('raises risk for costly, constraint-violating candidates', () => {
      const low = estimateCandidateRisk({ label: 'x', benefit: 0.9, cost: 0.05 });
      const high = estimateCandidateRisk({
        label: 'y',
        benefit: 0.2,
        cost: 0.9,
        constraintsSatisfied: false,
      });
      expect(high.riskScore).toBeGreaterThan(low.riskScore);
    });
  });

  describe('evaluateCandidates', () => {
    const input = {
      mode: 'STRATEGIC' as const,
      contextConfidence: 1,
      fallbackCapitalSupport: 0.8,
      founderPresent: false,
    };

    it('filters inadmissible candidates out of winner selection', () => {
      const candidates: CandidateSignal[] = [
        { label: 'admissible', benefit: 0.8, admissible: true },
        { label: 'blocked', benefit: 0.95, admissible: false },
      ];
      const evalResult = evaluateCandidates(candidates, input);
      expect(evalResult.admissibleCount).toBe(1);
      expect(evalResult.filteredCount).toBe(1);
      expect(evalResult.winner?.label).toBe('admissible');
      expect(evalResult.candidates.find((c) => c.label === 'blocked')?.status).toBe('FILTERED');
    });

    it('selects the highest-scoring admissible candidate', () => {
      const candidates: CandidateSignal[] = [
        { label: 'weak', benefit: 0.3 },
        { label: 'strong', benefit: 0.95, reasoningConfidence: 0.9, planningReadiness: 0.9 },
      ];
      const evalResult = evaluateCandidates(candidates, input);
      expect(evalResult.winner?.label).toBe('strong');
      expect(evalResult.candidates.find((c) => c.label === 'strong')?.status).toBe('SELECTED');
      expect(evalResult.candidates.find((c) => c.label === 'weak')?.status).toBe('REJECTED');
    });

    it('returns no winner when nothing is admissible', () => {
      const evalResult = evaluateCandidates([{ label: 'x', admissible: false }], input);
      expect(evalResult.winner).toBeNull();
      expect(evalResult.admissibleCount).toBe(0);
    });
  });

  describe('resolveVerdict', () => {
    const winner = {
      label: 'w',
      score: 0.8,
      riskLevel: 'LOW' as const,
    } as any;

    it('blocks when there is no admissible candidate', () => {
      expect(resolveVerdict(null, true, 0)).toBe('BLOCKED');
    });

    it('defers when the winner risk is critical', () => {
      expect(resolveVerdict({ ...winner, riskLevel: 'CRITICAL' }, true, 1)).toBe('DEFERRED');
    });

    it('contests when required constraints are unsatisfied', () => {
      expect(resolveVerdict(winner, false, 1)).toBe('CONTESTED');
    });

    it('selects a strong winner', () => {
      expect(resolveVerdict(winner, true, 1)).toBe('SELECTED');
    });

    it('defers a weak winner', () => {
      expect(resolveVerdict({ ...winner, score: 0.3 }, true, 1)).toBe('DEFERRED');
    });
  });

  describe('rankAlternatives', () => {
    it('excludes the winner and bounds the list', () => {
      const evalResult = evaluateCandidates(
        [
          { label: 'a', benefit: 0.9 },
          { label: 'b', benefit: 0.8 },
          { label: 'c', benefit: 0.7 },
          { label: 'd', benefit: 0.6 },
          { label: 'e', benefit: 0.5 },
        ],
        {
          mode: 'STRATEGIC',
          contextConfidence: 1,
          fallbackCapitalSupport: 0.8,
          founderPresent: false,
        },
      );
      const alternatives = rankAlternatives(evalResult);
      expect(alternatives.length).toBeLessThanOrEqual(3);
      expect(alternatives.every((a) => a.label !== evalResult.winner?.label)).toBe(true);
    });
  });

  describe('runDecision', () => {
    it('selects a clear winner under strong input with a full trace', () => {
      const outcome = runDecision({
        mode: 'STRATEGIC',
        objective: 'Pick the strongest path',
        candidates: [
          {
            label: 'strong',
            benefit: 0.95,
            reasoningConfidence: 0.9,
            planningReadiness: 0.9,
            capitalSupport: 0.9,
            cost: 0.05,
          },
          { label: 'weak', benefit: 0.3 },
        ],
        constraints: [{ name: 'budget', satisfied: true }],
        contexts: [
          { runtime: 'REASONING', role: 'REASONING', confidence: 1 },
          { runtime: 'PLANNING', role: 'PLAN', confidence: 1 },
          { runtime: 'CAPITAL', role: 'CAPITAL', confidence: 0.9 },
        ],
      });
      expect(outcome.verdict).toBe('SELECTED');
      expect(outcome.winner?.label).toBe('strong');
      expect(outcome.trace.stages).toHaveLength(9);
      expect(outcome.hasReasoning).toBe(true);
      expect(outcome.hasPlanning).toBe(true);
      expect(outcome.alternatives.length).toBeGreaterThan(0);
    });

    it('blocks when no candidate is constitutionally admissible', () => {
      const outcome = runDecision({
        mode: 'CONSTITUTIONAL',
        objective: 'No admissible path',
        candidates: [{ label: 'x', admissible: false }],
        constraints: [],
        contexts: [{ runtime: 'REASONING', role: 'REASONING', confidence: 1 }],
      });
      expect(outcome.verdict).toBe('BLOCKED');
      expect(outcome.winner).toBeNull();
    });

    it('contests when a required constraint is unsatisfied', () => {
      const outcome = runDecision({
        mode: 'OPERATIONAL',
        objective: 'Contested path',
        candidates: [
          { label: 'a', benefit: 0.9, reasoningConfidence: 0.9, planningReadiness: 0.9 },
        ],
        constraints: [{ name: 'safety', satisfied: false, required: true }],
        contexts: [{ runtime: 'REASONING', role: 'REASONING', confidence: 1 }],
      });
      expect(outcome.verdict).toBe('CONTESTED');
      expect(outcome.constraintsSatisfied).toBe(false);
    });
  });

  describe('validateDecision', () => {
    it('passes all six checks for a well-formed decision', () => {
      const result = validateDecision({
        mode: 'STRATEGIC',
        hasConstitutionalRef: true,
        founderAuthorityValid: true,
        admissibleCount: 2,
        evidencePresent: true,
        contextConfidence: 0.9,
        hasReasoning: true,
        hasPlanning: true,
        capitalSupport: 0.8,
      });
      expect(result.checks).toHaveLength(6);
      expect(result.valid).toBe(true);
    });

    it('fails reasoning, planning and capital checks when signals are missing', () => {
      const result = validateDecision({
        mode: 'STRATEGIC',
        hasConstitutionalRef: true,
        founderAuthorityValid: true,
        admissibleCount: 1,
        evidencePresent: true,
        contextConfidence: 0.9,
        hasReasoning: false,
        hasPlanning: false,
        capitalSupport: 0.1,
      });
      expect(result.valid).toBe(false);
      const failed = result.checks.filter((c) => !c.valid).map((c) => c.kind);
      expect(failed).toEqual(expect.arrayContaining(['REASONING', 'PLANNING', 'CAPITAL']));
    });

    it('fails constitutional and founder checks for a founder mode without authority', () => {
      const result = validateDecision({
        mode: 'FOUNDER',
        hasConstitutionalRef: true,
        founderAuthorityValid: false,
        admissibleCount: 1,
        evidencePresent: true,
        contextConfidence: 0.9,
        hasReasoning: true,
        hasPlanning: true,
        capitalSupport: 0.8,
      });
      expect(result.valid).toBe(false);
      const failed = result.checks.filter((c) => !c.valid).map((c) => c.kind);
      expect(failed).toEqual(expect.arrayContaining(['CONSTITUTIONAL', 'FOUNDER']));
    });
  });
});

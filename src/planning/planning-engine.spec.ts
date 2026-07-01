import {
  aggregateContext,
  analyzeConstraints,
  buildDependencyGraph,
  clamp01,
  decomposeGoals,
  deriveAlternativePlans,
  estimateResources,
  estimateRisk,
  generateMilestones,
  generateTimeline,
  resolvePlanningProfile,
  resolveReadiness,
  resolveRiskLevel,
  runPlanning,
  scorePlanConfidence,
  validatePlanning,
} from './planning-engine';
import { PLANNING_MODE_PROFILES } from './planning.constants';

describe('planning-engine', () => {
  describe('clamp01', () => {
    it('clamps out-of-range and non-finite values', () => {
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(2)).toBe(1);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(NaN)).toBe(0);
    });
  });

  describe('resolvePlanningProfile', () => {
    it('returns a profile whose weights sum to 1 for every mode', () => {
      for (const profile of Object.values(PLANNING_MODE_PROFILES)) {
        const sum =
          profile.goalWeight +
          profile.constraintWeight +
          profile.resourceWeight +
          profile.riskWeight +
          profile.contextWeight +
          profile.founderWeight;
        expect(Number(sum.toFixed(6))).toBe(1);
      }
      expect(resolvePlanningProfile('FOUNDER').founderWeight).toBeGreaterThan(0);
    });
  });

  describe('aggregateContext', () => {
    it('returns zero for an empty context set', () => {
      expect(aggregateContext([])).toEqual({
        confidence: 0,
        count: 0,
        runtimes: [],
        hasKnowledge: false,
        hasReasoning: false,
      });
    });

    it('detects knowledge and reasoning runtimes and weights confidence', () => {
      const agg = aggregateContext([
        { runtime: 'D16', role: 'KNOWLEDGE', weight: 2, confidence: 1 },
        { runtime: 'REASONING', role: 'REASONING', weight: 1, confidence: 0.4 },
      ]);
      expect(agg.hasKnowledge).toBe(true);
      expect(agg.hasReasoning).toBe(true);
      expect(agg.count).toBe(2);
      expect(agg.confidence).toBeCloseTo((2 * 1 + 1 * 0.4) / 3, 5);
    });
  });

  describe('decomposeGoals', () => {
    it('returns empty decomposition when no goals', () => {
      const d = decomposeGoals([]);
      expect(d.count).toBe(0);
      expect(d.steps).toHaveLength(0);
      expect(d.goalConfidence).toBe(0);
    });

    it('orders goals by priority and emits steps per goal', () => {
      const d = decomposeGoals([
        { title: 'low', priority: 1 },
        { title: 'high', priority: 5, description: 'x', measurable: true },
      ]);
      expect(d.count).toBe(2);
      expect(d.steps.length).toBe(4);
      // Highest priority first.
      expect(d.steps[0].goalReference).toBe('high');
      expect(d.goalConfidence).toBeGreaterThan(0);
    });
  });

  describe('analyzeConstraints', () => {
    it('is vacuously satisfied with no constraints', () => {
      expect(analyzeConstraints([]).constraintsSatisfied).toBe(true);
      expect(analyzeConstraints([]).ratio).toBe(1);
    });

    it('blocks on a required unsatisfied constraint', () => {
      const a = analyzeConstraints([{ name: 'budget', satisfied: false, required: true }]);
      expect(a.constraintsSatisfied).toBe(false);
      expect(a.violations).toContain('budget');
    });

    it('tolerates an optional unsatisfied constraint', () => {
      const a = analyzeConstraints([{ name: 'nice-to-have', satisfied: false, required: false }]);
      expect(a.constraintsSatisfied).toBe(true);
      expect(a.ratio).toBe(0);
    });
  });

  describe('estimateResources', () => {
    it('is vacuously feasible with no resources', () => {
      expect(estimateResources([]).feasibility).toBe(1);
    });

    it('flags unavailable resources and capacity shortfalls', () => {
      const e = estimateResources([
        { name: 'ok' },
        { name: 'gone', available: false },
        { name: 'tight', demand: 10, capacity: 5 },
      ]);
      expect(e.satisfiedCount).toBe(1);
      expect(e.shortfalls).toEqual(expect.arrayContaining(['gone', 'tight']));
      expect(e.feasibility).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('buildDependencyGraph', () => {
    it('builds a linear acyclic chain', () => {
      const steps = decomposeGoals([{ title: 'g' }]).steps;
      const graph = buildDependencyGraph(steps);
      expect(graph.cyclic).toBe(false);
      expect(graph.nodes).toBe(steps.length);
      expect(graph.edges).toHaveLength(steps.length - 1);
    });
  });

  describe('generateTimeline + generateMilestones', () => {
    it('produces a serial timeline and one milestone per goal', () => {
      const d = decomposeGoals([{ title: 'a' }, { title: 'b' }]);
      const timeline = generateTimeline(d.steps);
      expect(timeline.totalDuration).toBe(d.steps.length);
      const milestones = generateMilestones(d.goals, timeline);
      expect(milestones).toHaveLength(2);
      expect(milestones[1].targetOffset).toBe(timeline.totalDuration);
    });
  });

  describe('estimateRisk + resolveRiskLevel', () => {
    it('maps risk scores onto bands', () => {
      expect(resolveRiskLevel(0.1)).toBe('LOW');
      expect(resolveRiskLevel(0.4)).toBe('MODERATE');
      expect(resolveRiskLevel(0.7)).toBe('ELEVATED');
      expect(resolveRiskLevel(0.9)).toBe('CRITICAL');
    });

    it('raises risk when knowledge is absent and feasibility is low', () => {
      const good = estimateRisk({
        constraintRatio: 1,
        resourceFeasibility: 1,
        contextConfidence: 1,
        hasKnowledge: true,
      });
      const bad = estimateRisk({
        constraintRatio: 0,
        resourceFeasibility: 0,
        contextConfidence: 0,
        hasKnowledge: false,
      });
      expect(good.riskScore).toBeLessThan(bad.riskScore);
      expect(bad.riskLevel).toBe('CRITICAL');
    });
  });

  describe('scorePlanConfidence', () => {
    it('adds founder weight only when founder is present in FOUNDER mode', () => {
      const base = {
        goalConfidence: 0.5,
        constraintRatio: 0.5,
        resourceFeasibility: 0.5,
        riskScore: 0.5,
        contextConfidence: 0.5,
      };
      const withFounder = scorePlanConfidence({
        mode: 'FOUNDER',
        ...base,
        founderPresent: true,
      });
      const withoutFounder = scorePlanConfidence({
        mode: 'FOUNDER',
        ...base,
        founderPresent: false,
      });
      expect(withFounder).toBeGreaterThan(withoutFounder);
    });
  });

  describe('resolveReadiness', () => {
    it('blocks when constraints unsatisfied or risk critical', () => {
      expect(resolveReadiness(0.9, false, 'LOW')).toBe('BLOCKED');
      expect(resolveReadiness(0.9, true, 'CRITICAL')).toBe('BLOCKED');
    });

    it('bands executable/conditional by confidence', () => {
      expect(resolveReadiness(0.8, true, 'LOW')).toBe('EXECUTABLE');
      expect(resolveReadiness(0.5, true, 'MODERATE')).toBe('CONDITIONAL');
      expect(resolveReadiness(0.2, true, 'MODERATE')).toBe('BLOCKED');
    });
  });

  describe('deriveAlternativePlans', () => {
    it('excludes the primary mode and is bounded and sorted', () => {
      const alts = deriveAlternativePlans(
        'STRATEGIC',
        {
          goalConfidence: 0.6,
          constraintRatio: 0.7,
          resourceFeasibility: 0.8,
          riskScore: 0.3,
          contextConfidence: 0.6,
        },
        true,
        'LOW',
      );
      expect(alts.length).toBeLessThanOrEqual(3);
      expect(alts.every((a) => a.mode !== 'STRATEGIC')).toBe(true);
      for (let i = 1; i < alts.length; i += 1) {
        expect(alts[i - 1].confidence).toBeGreaterThanOrEqual(alts[i].confidence);
      }
    });
  });

  describe('runPlanning', () => {
    it('produces an executable plan for a strong input', () => {
      const outcome = runPlanning({
        mode: 'STRATEGIC',
        objective: 'Grow flourishing',
        goals: [
          { title: 'Raise trust', priority: 5, description: 'x', measurable: true, weight: 1 },
          { title: 'Expand knowledge', priority: 3, description: 'y', measurable: true },
        ],
        constraints: [{ name: 'budget', satisfied: true }],
        contexts: [
          { runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 },
          { runtime: 'REASONING', role: 'REASONING', confidence: 1 },
        ],
        resources: [{ name: 'team', available: true }],
      });
      expect(outcome.readiness).toBe('EXECUTABLE');
      expect(outcome.steps.length).toBe(4);
      expect(outcome.milestones.length).toBe(2);
      expect(outcome.alternatives.length).toBeGreaterThan(0);
      expect(outcome.trace.stages).toHaveLength(10);
      expect(outcome.hasReasoning).toBe(true);
    });

    it('blocks the plan when a required constraint fails', () => {
      const outcome = runPlanning({
        mode: 'OPERATIONAL',
        objective: 'Recover',
        goals: [{ title: 'Stabilize', priority: 1 }],
        constraints: [{ name: 'safety', satisfied: false, required: true }],
        contexts: [{ runtime: 'D16', role: 'KNOWLEDGE', confidence: 1 }],
        resources: [],
      });
      expect(outcome.constraintsSatisfied).toBe(false);
      expect(outcome.readiness).toBe('BLOCKED');
      expect(outcome.violations).toContain('safety');
    });
  });

  describe('validatePlanning', () => {
    it('passes when all six dimensions hold', () => {
      const res = validatePlanning({
        mode: 'STRATEGIC',
        goalConfidence: 0.9,
        goalCount: 2,
        resourceFeasibility: 0.9,
        constraintsSatisfied: true,
        dependencyCyclic: false,
        hasReasoning: true,
        riskLevel: 'LOW',
        hasConstitutionalRef: true,
        founderAuthorityValid: true,
      });
      expect(res.valid).toBe(true);
      expect(res.checks).toHaveLength(6);
    });

    it('fails resource, goal and risk checks for a weak plan', () => {
      const res = validatePlanning({
        mode: 'OPERATIONAL',
        goalConfidence: 0.1,
        goalCount: 0,
        resourceFeasibility: 0.1,
        constraintsSatisfied: false,
        dependencyCyclic: false,
        hasReasoning: false,
        riskLevel: 'CRITICAL',
        hasConstitutionalRef: true,
        founderAuthorityValid: true,
      });
      expect(res.valid).toBe(false);
      const failed = res.checks.filter((c) => !c.valid).map((c) => c.kind);
      expect(failed).toEqual(expect.arrayContaining(['RESOURCE', 'GOAL', 'RISK', 'CONSISTENCY']));
    });

    it('fails the constitutional check for a founder mode without authority', () => {
      const res = validatePlanning({
        mode: 'FOUNDER',
        goalConfidence: 0.9,
        goalCount: 1,
        resourceFeasibility: 0.9,
        constraintsSatisfied: true,
        dependencyCyclic: false,
        hasReasoning: true,
        riskLevel: 'LOW',
        hasConstitutionalRef: true,
        founderAuthorityValid: false,
      });
      expect(res.checks.find((c) => c.kind === 'CONSTITUTIONAL')?.valid).toBe(false);
    });
  });
});

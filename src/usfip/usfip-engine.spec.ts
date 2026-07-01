import {
  evaluateProtocol,
  interpretDirective,
  orderRules,
  selectPolicy,
  validateGovernance,
} from './usfip-engine';

describe('usfip-engine (USFIP)', () => {
  // ------------------------------------------------------- interpretation (B)
  describe('interpretDirective', () => {
    it('normalizes a bare directive with sensible defaults', () => {
      const r = interpretDirective({ founderDirective: '  Establish advantage  ' });
      expect(r.founderDirective).toBe('Establish advantage');
      expect(r.strategicObjective).toBe('Establish advantage');
      expect(r.strategicPriority).toBe('MEDIUM');
      expect(r.strategicHorizon).toBe('MEDIUM');
      expect(r.strategicOutcome).toContain('Establish advantage');
      expect(r.constitutionalRef).toContain('FIC');
    });

    it('preserves explicit priority, horizon and objective', () => {
      const r = interpretDirective({
        founderDirective: 'Scale',
        strategicObjective: 'Scale capital',
        strategicPriority: 'CRITICAL',
        strategicHorizon: 'IMMEDIATE',
      });
      expect(r.strategicObjective).toBe('Scale capital');
      expect(r.strategicPriority).toBe('CRITICAL');
      expect(r.strategicHorizon).toBe('IMMEDIATE');
    });
  });

  // -------------------------------------------------------- protocol engine (C)
  describe('selectPolicy', () => {
    it('returns null when there are no active policies', () => {
      expect(
        selectPolicy([{ id: 'p', status: 'INACTIVE', priority: 5, strategicPriority: 'HIGH' }]),
      ).toBeNull();
    });

    it('prefers higher strategic priority, then explicit priority', () => {
      const winner = selectPolicy([
        { id: 'a', status: 'ACTIVE', priority: 1, strategicPriority: 'HIGH' },
        { id: 'b', status: 'ACTIVE', priority: 9, strategicPriority: 'MEDIUM' },
        { id: 'c', status: 'ACTIVE', priority: 2, strategicPriority: 'HIGH' },
      ]);
      expect(winner?.id).toBe('c');
    });
  });

  describe('orderRules', () => {
    it('filters inactive and orders by ordering then weight', () => {
      const ordered = orderRules([
        { id: 'a', status: 'ACTIVE', ordering: 2, weight: 0.5 },
        { id: 'b', status: 'INACTIVE', ordering: 0, weight: 1 },
        { id: 'c', status: 'ACTIVE', ordering: 1, weight: 0.9 },
        { id: 'd', status: 'ACTIVE', ordering: 1, weight: 0.2 },
      ]);
      expect(ordered.map((r) => r.id)).toEqual(['c', 'd', 'a']);
    });
  });

  describe('evaluateProtocol', () => {
    it('derives a governed execution path with a policy and ordered rules', () => {
      const r = evaluateProtocol({
        priority: 'HIGH',
        horizon: 'SHORT',
        rules: [
          { id: 'r1', status: 'ACTIVE', ordering: 1, weight: 0.8 },
          { id: 'r2', status: 'ACTIVE', ordering: 2, weight: 0.6 },
        ],
        policies: [{ id: 'pol1', status: 'ACTIVE', priority: 1, strategicPriority: 'HIGH' }],
      });
      expect(r.selectedPolicyId).toBe('pol1');
      expect(r.selectedRuleIds).toEqual(['r1', 'r2']);
      expect(r.executionPath[0]).toBe('INTERPRET');
      expect(r.executionPath[r.executionPath.length - 1]).toBe('EXECUTE');
      expect(r.score).toBeGreaterThan(0);
    });

    it('handles the no-policy case without forcing a selection', () => {
      const r = evaluateProtocol({ priority: 'LOW', horizon: 'LONG', rules: [], policies: [] });
      expect(r.selectedPolicyId).toBeNull();
      expect(r.selectedRuleIds).toEqual([]);
      expect(r.reason).toContain('No active policy');
    });
  });

  // ------------------------------------------------------------ governance (D)
  describe('validateGovernance', () => {
    it('requires a founder directive for founder authority', () => {
      const r = validateGovernance({
        founderDirective: '',
        overridden: false,
        activeRuleCount: 1,
        activePolicyCount: 1,
      });
      expect(r.valid).toBe(false);
      expect(r.founderAuthorityValid).toBe(false);
    });

    it('rejects an overridden session', () => {
      const r = validateGovernance({
        founderDirective: 'x',
        overridden: true,
        activeRuleCount: 1,
        activePolicyCount: 0,
      });
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.includes('override'))).toBe(true);
    });

    it('requires at least one active rule or policy', () => {
      const r = validateGovernance({
        founderDirective: 'x',
        overridden: false,
        activeRuleCount: 0,
        activePolicyCount: 0,
      });
      expect(r.valid).toBe(false);
    });

    it('passes a well-formed protocol', () => {
      const r = validateGovernance({
        founderDirective: 'x',
        overridden: false,
        activeRuleCount: 2,
        activePolicyCount: 1,
      });
      expect(r.valid).toBe(true);
      expect(r.founderAuthorityValid).toBe(true);
    });
  });
});

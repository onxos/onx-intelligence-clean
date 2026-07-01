import { arbitrate, planSteps, resolveRoute, validateMerge } from './meta-engine';

describe('meta-engine (D14)', () => {
  // -------------------------------------------------------------------- routing
  describe('resolveRoute', () => {
    it('honours an explicit target', () => {
      const r = resolveRoute({ target: 'CAPITAL' });
      expect(r.target).toBe('CAPITAL');
      expect(r.constitutionalRef).toContain('D13');
      expect(r.score).toBeGreaterThan(0);
    });

    it('resolves an intent by keyword to the correct target', () => {
      expect(resolveRoute({ intent: 'allocate capital to provider' }).target).toBe('CAPITAL');
      expect(resolveRoute({ intent: 'measure the benchmark score' }).target).toBe('MEASUREMENT');
      expect(resolveRoute({ intent: 'compile founder directive' }).target).toBe('INTENT');
    });

    it('falls back to a deterministic default when nothing matches', () => {
      const r = resolveRoute({ intent: 'zzz nothing here' });
      expect(r.target).toBe('INTENT'); // highest default weight
      expect(r.constitutionalRef).toBeTruthy();
    });

    it('applies candidate priority bonuses', () => {
      const r = resolveRoute({
        candidates: [
          { target: 'PROVIDER', priority: 1 },
          { target: 'WORKSPACE', priority: 0 },
        ],
      });
      expect(r.target).toBe('PROVIDER');
    });
  });

  // ---------------------------------------------------------------- arbitration
  describe('arbitrate', () => {
    it('returns DEADLOCK when there are no paths', () => {
      const r = arbitrate('PRIORITY', []);
      expect(r.outcome).toBe('DEADLOCK');
      expect(r.winningPath).toBeNull();
    });

    it('resolves a clear priority winner', () => {
      const r = arbitrate('PRIORITY', [
        { id: 'a', priority: 0.9 },
        { id: 'b', priority: 0.2 },
      ]);
      expect(r.outcome).toBe('RESOLVED');
      expect(r.winningPath).toBe('a');
      expect(r.losingPaths).toEqual(['b']);
      expect(r.constitutionalRef).toBeTruthy();
    });

    it('escalates on a tie', () => {
      const r = arbitrate('AUTHORITY', [
        { id: 'a', authority: 0.5 },
        { id: 'b', authority: 0.5 },
      ]);
      expect(r.outcome).toBe('ESCALATED');
      expect(r.winningPath).toBeNull();
      expect(r.losingPaths).toEqual(['a', 'b']);
    });

    it('averages all dimensions for CONFLICT arbitration', () => {
      const r = arbitrate('CONFLICT', [
        { id: 'a', priority: 1, authority: 1, evidence: 1, capital: 1, execution: 1 },
        { id: 'b', priority: 0, authority: 0, evidence: 0, capital: 0, execution: 0 },
      ]);
      expect(r.winningPath).toBe('a');
    });
  });

  // --------------------------------------------------------------------- merge
  describe('validateMerge', () => {
    it('rejects fewer than two paths', () => {
      const r = validateMerge(['only-one']);
      expect(r.valid).toBe(false);
      expect(r.status).toBe('REJECTED');
    });

    it('rejects duplicate paths', () => {
      const r = validateMerge(['a', 'a']);
      expect(r.valid).toBe(false);
    });

    it('validates two distinct paths', () => {
      const r = validateMerge(['a', 'b']);
      expect(r.valid).toBe(true);
      expect(r.status).toBe('VALIDATED');
    });
  });

  // ----------------------------------------------------------------- planning
  describe('planSteps', () => {
    it('sequences and routes each intent', () => {
      const steps = planSteps([
        { name: 'Load capital', intent: 'allocate capital' },
        { name: 'Run', target: 'RUNTIME' },
      ]);
      expect(steps).toHaveLength(2);
      expect(steps[0].sequence).toBe(1);
      expect(steps[0].target).toBe('CAPITAL');
      expect(steps[1].target).toBe('RUNTIME');
    });
  });
});

import { evaluateAllocationRules } from './capital-rules';

describe('evaluateAllocationRules', () => {
  const baseCapital = {
    currentValue: 100,
    minimumValue: 10,
    preservationScore: 1,
    status: 'ACTIVE' as const,
    authority: 'OPERATIONAL' as const,
  };

  it('allows an allocation within all rule bounds', () => {
    const result = evaluateAllocationRules(baseCapital, { amount: 40 });
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.projectedValue).toBe(60);
  });

  it('rejects a non-positive amount as a constitutional violation', () => {
    const result = evaluateAllocationRules(baseCapital, { amount: 0 });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'CONSTITUTIONAL')).toBe(true);
  });

  it('rejects an allocation that would drive value below zero', () => {
    const result = evaluateAllocationRules(baseCapital, { amount: 200 });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'CONSTITUTIONAL' && v.constitutional)).toBe(
      true,
    );
  });

  it('enforces the minimum capital reserve', () => {
    const result = evaluateAllocationRules(baseCapital, { amount: 95 });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'MINIMUM_CAPITAL')).toBe(true);
  });

  it('enforces the maximum allocation ratio', () => {
    const result = evaluateAllocationRules(baseCapital, { amount: 85, maxAllocationRatio: 0.8 });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'MAXIMUM_ALLOCATION')).toBe(true);
  });

  it('blocks allocation from depleted capital (dependency rule)', () => {
    const result = evaluateAllocationRules({ ...baseCapital, status: 'DEPLETED' }, { amount: 5 });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'DEPENDENCY')).toBe(true);
  });

  it('blocks allocation from archived capital (constitutional rule)', () => {
    const result = evaluateAllocationRules({ ...baseCapital, status: 'ARCHIVED' }, { amount: 5 });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'CONSTITUTIONAL')).toBe(true);
  });

  it('enforces the preservation floor when preservation score < 1', () => {
    const result = evaluateAllocationRules(
      { ...baseCapital, preservationScore: 0.5 },
      { amount: 55 },
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'CAPITAL_PRESERVATION')).toBe(true);
  });

  it('applies a founder override to waive non-constitutional violations', () => {
    const result = evaluateAllocationRules(
      { ...baseCapital, authority: 'SOVEREIGN' },
      { amount: 95, founderOverride: true, overrideAuthority: 'SOVEREIGN' },
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it('never waives a constitutional violation even with a founder override', () => {
    const result = evaluateAllocationRules(
      { ...baseCapital, authority: 'SOVEREIGN' },
      { amount: 200, founderOverride: true, overrideAuthority: 'SOVEREIGN' },
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.every((v) => v.constitutional)).toBe(true);
  });

  it('ignores override requests from insufficient authority', () => {
    const result = evaluateAllocationRules(
      { ...baseCapital, authority: 'OPERATIONAL' },
      { amount: 95, founderOverride: true, overrideAuthority: 'OPERATIONAL' },
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.allowed).toBe(false);
  });
});

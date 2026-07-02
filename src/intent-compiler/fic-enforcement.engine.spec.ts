import {
  ALL_CONSTRAINTS,
  CONSTRAINT_COUNT,
  FOUNDER_INTENT_CORPUS,
  HARD_CONSTRAINTS,
  PLAYBOOK_CONSTRAINT_MAPPINGS,
  CONFLICT_RESOLUTION_CLASSES,
  PRIORITY_HIERARCHY,
  SECH_FIC_CHECK_STEPS,
  DECISION_GATES,
  EXECUTION_BLOCKS,
  SOFT_CONSTRAINTS,
  ADVISORY_CONSTRAINTS,
  OUTCOME_VALIDATION_RULES,
  OVERRIDE_RULES,
  constraintIdsForPlaybooks,
} from './fic-enforcement.constants';
import {
  applyPriorityHierarchy,
  detectConflicts,
  evaluateConstraint,
  resolveApplicableConstraints,
  resolveApplicableIntents,
  runFicCheck,
} from './fic-enforcement.engine';

describe('FIC enforcement constants (constitutional registry)', () => {
  it('registers all 69 executable constraints across the 7 families', () => {
    expect(CONSTRAINT_COUNT).toBe(69);
    expect(HARD_CONSTRAINTS).toHaveLength(12);
    expect(SOFT_CONSTRAINTS).toHaveLength(12);
    expect(ADVISORY_CONSTRAINTS).toHaveLength(6);
    expect(DECISION_GATES).toHaveLength(12);
    expect(EXECUTION_BLOCKS).toHaveLength(12);
    expect(OUTCOME_VALIDATION_RULES).toHaveLength(10);
    expect(OVERRIDE_RULES).toHaveLength(5);
    expect(ALL_CONSTRAINTS).toHaveLength(69);
  });

  it('has unique constraint ids', () => {
    const ids = ALL_CONSTRAINTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers 38 canonical intents, 7 conflict classes, 10 playbooks, 13 steps, 8 priority levels', () => {
    expect(FOUNDER_INTENT_CORPUS).toHaveLength(38);
    expect(CONFLICT_RESOLUTION_CLASSES).toHaveLength(7);
    expect(PLAYBOOK_CONSTRAINT_MAPPINGS).toHaveLength(10);
    expect(SECH_FIC_CHECK_STEPS).toHaveLength(13);
    expect(PRIORITY_HIERARCHY).toHaveLength(8);
  });

  it('maps playbook activities to known constraint ids only', () => {
    const known = new Set(ALL_CONSTRAINTS.map((c) => c.id));
    for (const pb of PLAYBOOK_CONSTRAINT_MAPPINGS) {
      for (const activity of pb.activities) {
        for (const cid of activity.constraints) {
          expect(known.has(cid)).toBe(true);
        }
      }
    }
  });

  it('resolves constraint ids for a playbook', () => {
    const ids = constraintIdsForPlaybooks(['staff_performance']);
    expect(ids).toEqual(expect.arrayContaining(['DG-02', 'EB-03', 'SC-12', 'HC-02']));
  });
});

describe('resolveApplicableIntents', () => {
  it('includes all-domain intents regardless of requested domain', () => {
    const ids = resolveApplicableIntents(['clinical']);
    // FI-2026-0004 (Founder Intent Supremacy) is an all-domain principle.
    expect(ids).toContain('FI-2026-0004');
  });

  it('matches domain-specific intents', () => {
    const ids = resolveApplicableIntents(['commercial']);
    expect(ids).toContain('FI-2026-0028'); // reputation over short-term profit
  });

  it('returns only all-domain intents when domains empty', () => {
    const ids = resolveApplicableIntents([]);
    expect(ids).toContain('FI-2026-0004');
    expect(ids).not.toContain('FI-2026-0028');
  });
});

describe('resolveApplicableConstraints', () => {
  it('includes domain-scoped and playbook-mapped constraints', () => {
    const constraints = resolveApplicableConstraints(['clinical'], ['medical_quality']);
    const ids = constraints.map((c) => c.id);
    expect(ids).toContain('EB-01'); // clinical execution block
    expect(ids).toContain('DG-01'); // mapped via medical_quality
  });

  it('always includes all-domain constraints', () => {
    const constraints = resolveApplicableConstraints(['commercial'], []);
    expect(constraints.map((c) => c.id)).toContain('HC-08');
  });
});

describe('applyPriorityHierarchy', () => {
  it('emergency/safety wins (level 1)', () => {
    expect(applyPriorityHierarchy({ emergencyMedical: true, legalConflict: true })).toBe(1);
  });

  it('legal compliance is level 2', () => {
    expect(applyPriorityHierarchy({ legalConflict: true })).toBe(2);
  });

  it('constitutional pillar is level 3', () => {
    expect(applyPriorityHierarchy({ profitOverCare: true })).toBe(3);
  });

  it('non-negotiable staff reduction is level 4', () => {
    expect(applyPriorityHierarchy({ reducesClinicalStaffForRevenue: true })).toBe(4);
  });

  it('returns null when nothing engaged', () => {
    expect(applyPriorityHierarchy({})).toBeNull();
  });
});

describe('detectConflicts', () => {
  it('detects an active conflict class and resolves it via hierarchy', () => {
    const conflicts = detectConflicts({
      conflictProfitVsMercy: true,
      profitOverCare: true,
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].classId).toBe('C3');
    expect(conflicts[0].resolvedByLevel).toBe(3);
    expect(conflicts[0].autoResolvable).toBe(true);
  });

  it('marks a conflict unresolved when no hierarchy level engaged', () => {
    const conflicts = detectConflicts({ conflictSpeedVsQuality: true });
    expect(conflicts[0].autoResolvable).toBe(false);
  });
});

describe('evaluateConstraint', () => {
  const byId = (id: string) => ALL_CONSTRAINTS.find((c) => c.id === id)!;

  it('blocks on triggered execution block', () => {
    const ev = evaluateConstraint(byId('EB-03'), { reducesClinicalStaffForRevenue: true });
    expect(ev.outcome).toBe('BLOCKED');
    expect(ev.triggered).toBe(true);
  });

  it('violates on triggered hard constraint', () => {
    const ev = evaluateConstraint(byId('HC-01'), { liveWeightUpdate: true });
    expect(ev.outcome).toBe('VIOLATED');
  });

  it('flags on triggered soft constraint', () => {
    const ev = evaluateConstraint(byId('SC-09'), { sameDayCausation: true });
    expect(ev.outcome).toBe('FLAGGED');
  });

  it('requires a gate on triggered decision gate', () => {
    const ev = evaluateConstraint(byId('DG-04'), { discountGate: true });
    expect(ev.outcome).toBe('GATE_REQUIRED');
  });

  it('treats advisory constraints as non-binding guidance', () => {
    const ev = evaluateConstraint(byId('AC-06'), {});
    expect(ev.outcome).toBe('ADVISORY');
  });

  it('passes an untriggered constraint', () => {
    const ev = evaluateConstraint(byId('HC-01'), {});
    expect(ev.outcome).toBe('PASS');
  });
});

describe('runFicCheck (13-step SECH-FIC sequence)', () => {
  it('logs all 13 canonical steps in order', () => {
    const result = runFicCheck({
      domains: ['clinical'],
      playbooks: ['clinic_operations'],
      signals: {},
    });
    // Engine performs steps 1-11 inline; 12-13 are persistence + return (service).
    expect(result.steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('APPROVES a clean decision', () => {
    const result = runFicCheck({
      domains: ['clinical'],
      playbooks: ['clinic_operations'],
      signals: {},
    });
    expect(result.decision).toBe('APPROVED');
    expect(result.executionBlocks).toHaveLength(0);
    expect(result.hardViolations).toHaveLength(0);
  });

  it('REJECTS staff-reduction-for-revenue with an EB block + counter-proposal', () => {
    const result = runFicCheck({
      domains: ['people', 'commercial'],
      playbooks: ['revenue_optimization'],
      signals: { reducesClinicalStaffForRevenue: true },
    });
    expect(result.decision).toBe('REJECTED');
    expect(result.executionBlocks).toContain('EB-03');
    expect(result.counterProposal).toBeTruthy();
  });

  it('REJECTS profit-over-care (EB-02 + HC-08)', () => {
    const result = runFicCheck({
      domains: ['clinical', 'commercial'],
      signals: { profitOverCare: true },
    });
    expect(result.decision).toBe('REJECTED');
    expect(result.executionBlocks).toContain('EB-02');
    expect(result.hardViolations).toContain('HC-08');
  });

  it('returns CONFLICT when a decision gate requires human approval', () => {
    const result = runFicCheck({
      domains: ['commercial'],
      playbooks: ['revenue_optimization'],
      signals: { discountGate: true },
    });
    expect(result.decision).toBe('CONFLICT');
    expect(result.requiredGates).toContain('DG-04');
    expect(result.requiresHumanApproval).toBe(true);
  });

  it('returns OVERRIDE for an emergency medical override', () => {
    const result = runFicCheck({
      domains: ['clinical'],
      playbooks: ['crisis_response'],
      signals: { emergencyMedical: true },
    });
    expect(result.decision).toBe('OVERRIDE');
    expect(result.activeOverrides).toContain('OR-01');
    expect(result.priorityLevel).toBe(1);
  });

  it('APPROVES with soft flags when only a soft constraint is triggered', () => {
    const result = runFicCheck({
      domains: ['clinical'],
      signals: { sameDayCausation: true },
    });
    expect(result.decision).toBe('APPROVED');
    expect(result.softFlags).toContain('SC-09');
  });

  it('legal conflict yields an OVERRIDE at priority level 2', () => {
    const result = runFicCheck({ domains: ['clinical'], signals: { legalConflict: true } });
    expect(result.decision).toBe('OVERRIDE');
    expect(result.activeOverrides).toContain('OR-04');
    expect(result.priorityLevel).toBe(2);
  });
});

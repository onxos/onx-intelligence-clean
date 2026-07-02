/**
 * IW-25 — SECH Integration constants (CCP v1.0 Section 11).
 *
 * The SECH decision router runs the FIC check automatically at four gates.
 * Each gate delegates to FicEnforcementService.runCheck with a distinct
 * checkType; the pre-gates guard promotion/routing/execution, and the single
 * post-gate validates the realised outcome against the OVR rules.
 */

export type SechGatePhase = 'pre' | 'post';

export interface SechGateDef {
  gate: string;
  checkType: string;
  phase: SechGatePhase;
  description: string;
}

/** The 4 SECH gates, in execution order. */
export const SECH_GATES: readonly SechGateDef[] = [
  {
    gate: 'PRE_JUDGMENT',
    checkType: 'pre_judgment',
    phase: 'pre',
    description: 'Before a Judgment is promoted to a higher tier.',
  },
  {
    gate: 'PRE_DECISION',
    checkType: 'pre_decision',
    phase: 'pre',
    description: 'Before a Decision is routed to execution.',
  },
  {
    gate: 'PRE_EXECUTION',
    checkType: 'pre_execution',
    phase: 'pre',
    description: 'Before an autonomous action executes.',
  },
  {
    gate: 'POST_OUTCOME',
    checkType: 'post_outcome',
    phase: 'post',
    description: 'After execution completes — validate the outcome against OVR.',
  },
];

export const SECH_PRE_GATES = SECH_GATES.filter((g) => g.phase === 'pre');
export const SECH_POST_GATE = SECH_GATES.find((g) => g.phase === 'post')!;

/**
 * How long an OVERRIDE disposition remains valid before it must be re-authorised.
 * OR-01 requires Founder notification within 1 hour, so overrides expire in 1h.
 */
export const SECH_OVERRIDE_EXPIRY_MS = 60 * 60 * 1000;

/** FIC decision -> the SECH terminal route status for a stopping gate. */
export const DECISION_TO_ROUTE_STATUS: Record<string, string> = {
  REJECTED: 'REJECTED',
  CONFLICT: 'CONFLICT',
  OVERRIDE: 'OVERRIDE',
  APPROVED: 'APPROVED',
};

/** Terminal statuses that stop the pre-gate sequence immediately. */
export const STOPPING_DECISIONS = ['REJECTED', 'CONFLICT'] as const;

import { FOUNDER_INTENT_CORPUS } from '../intent-compiler/fic-enforcement.constants';
import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';

/**
 * IW-30 — Judgment constants (HC-10: Knowledge != Judgment).
 *
 * A judgment answers "what we should do" from an understanding + Founder Intent
 * alignment + FIC constraint check. It climbs a 3-stage validation ladder:
 * preliminary -> validated (DG-09, SC-05 3+ correct outcomes) -> institutional
 * (DG-10, SC-06 2+ branches).
 */

/** Understanding must be at least "probable" before a judgment may be formed. */
export const MIN_UNDERSTANDING_TIER = ['probable', 'proven'];

/** SC-05: 3+ correct outcomes required to validate a judgment (DG-09). */
export const SC05_MIN_CORRECT_OUTCOMES = 3;

/** SC-06: validated at 2+ branches required to institutionalise (DG-10). */
export const SC06_MIN_BRANCHES = 2;

export const DG_JUDGMENT_PROMOTION = 'DG-09';
export const DG_RULE_INSTITUTIONALIZATION = 'DG-10';

export const JUDGMENT_STATUSES = [
  'preliminary',
  'validated',
  'institutional',
  'overruled',
  'rejected',
] as const;
export type JudgmentStatus = (typeof JUDGMENT_STATUSES)[number];

export const CONSTRAINT_CHECK_RESULTS = ['PASS', 'PARTIAL', 'FAIL'] as const;
export type ConstraintCheckResult = (typeof CONSTRAINT_CHECK_RESULTS)[number];

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Reality tier a judgment holds at each ladder stage. */
export function tierForStatus(status: JudgmentStatus): string {
  switch (status) {
    case 'institutional':
      return 'proven';
    case 'validated':
      return 'probable';
    default:
      return 'speculative';
  }
}

/**
 * Score how well a proposed judgment aligns with the Founder Intent corpus for a
 * domain. Deterministic: baseline 0.6, boosted by the number of applicable
 * intents (capped), so a well-covered domain scores higher.
 */
export function scoreFounderAlignment(
  domain: string,
  relatedIntents: string[] = [],
): {
  alignment: number;
  applicableIntentIds: string[];
} {
  const wanted = domain.trim().toLowerCase();
  const applicable = FOUNDER_INTENT_CORPUS.filter((intent) => {
    const domains = intent.affectedDomains ?? [];
    return domains.includes('all') || domains.some((d) => d.toLowerCase() === wanted);
  });
  const explicit = new Set(relatedIntents.map((r) => r.trim()));
  const explicitBoost = applicable.some((i) => explicit.has(i.intentId)) ? 0.1 : 0;
  const coverage = Math.min(1, applicable.length / 5);
  const alignment = clamp01(0.6 + 0.3 * coverage + explicitBoost);
  return { alignment, applicableIntentIds: applicable.map((i) => i.intentId) };
}

/** Map a SECH route disposition to the FIC constraint-check result. */
export function constraintCheckFromRoute(routeStatus: string): ConstraintCheckResult {
  switch (routeStatus) {
    case 'REJECTED':
      return 'FAIL';
    case 'CONFLICT':
      return 'PARTIAL';
    default:
      return 'PASS';
  }
}

export interface JudgmentGateResult {
  approved: boolean;
  constraintCheck: ConstraintCheckResult;
  ficCheckId: string | null;
  sechRouteId: string | null;
  iurgNodeId: string | null;
  iurgNodeType: string | null;
  reason: string;
}

/** Run judgment formation through the SECH pre_decision gate + resolve IURG node. */
export async function runJudgmentGate(
  sech: SechRouterService,
  iurg: IurgService,
  params: {
    workspaceId: string;
    userId: string;
    domain: string;
    decisionContext: string;
    signals?: Record<string, boolean | number>;
    ctx?: { actorId?: string; requestId?: string; ip?: string; userAgent?: string };
  },
): Promise<JudgmentGateResult> {
  const route = await sech.route(
    params.workspaceId,
    params.userId,
    {
      checkType: 'pre_decision',
      decisionContext: params.decisionContext,
      domains: [params.domain],
      signals: params.signals ?? {},
    },
    params.ctx,
  );
  const constraintCheck = constraintCheckFromRoute(route.status);
  const ficCheckId = route.gateResults?.[0]?.checkId ?? null;
  const approved = constraintCheck === 'PASS';

  let iurgNodeId: string | null = null;
  let iurgNodeType: string | null = null;
  if (approved && ficCheckId) {
    const node = await iurg.findNodeBySourceCheck(params.workspaceId, ficCheckId);
    if (node) {
      iurgNodeId = node.id;
      iurgNodeType = node.nodeType;
    }
  }

  return {
    approved,
    constraintCheck,
    ficCheckId,
    sechRouteId: route.id,
    iurgNodeId,
    iurgNodeType,
    reason: route.status,
  };
}

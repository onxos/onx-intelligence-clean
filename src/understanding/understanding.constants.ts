import { IurgService } from '../iurg/iurg.service';
import { SechRouterService } from '../sech/sech-router.service';

/**
 * IW-29 — Perception -> Understanding constants + shared SECH/IURG gate helper.
 *
 * The 3-transformation bridge (HC-10): T1 Pattern Detection (SC-05 3+
 * occurrences) -> T2 Context Matching (SC-08 2+ sources) -> T3 Meaning
 * Extraction (HC-10 explicit interpretation).
 */

export const PATTERN_TYPES = ['temporal', 'behavioral', 'causal', 'anomalous'] as const;
export type PatternType = (typeof PATTERN_TYPES)[number];

/** SC-05: an observation becomes a pattern only after 3+ occurrences. */
export const SC05_MIN_OCCURRENCES = 3;

/** SC-08: understanding synthesis requires 2+ corroborating sources. */
export const SC08_MIN_SOURCES = 2;

/** HC-03 reality tiers derived from confidence. */
export const REALITY_TIER_THRESHOLDS = { proven: 0.85, probable: 0.6 } as const;

export function resolveRealityTier(confidence: number): 'proven' | 'probable' | 'speculative' {
  if (confidence >= REALITY_TIER_THRESHOLDS.proven) {
    return 'proven';
  }
  if (confidence >= REALITY_TIER_THRESHOLDS.probable) {
    return 'probable';
  }
  return 'speculative';
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export type TransformDisposition = 'APPROVED' | 'REJECTED' | 'CONFLICT';

export interface TransformGateResult {
  disposition: TransformDisposition;
  approved: boolean;
  ficCheckId: string | null;
  sechRouteId: string | null;
  iurgNodeId: string | null;
  iurgNodeType: string | null;
  reason: string;
}

function mapRoute(routeStatus: string): TransformDisposition {
  switch (routeStatus) {
    case 'REJECTED':
      return 'REJECTED';
    case 'CONFLICT':
      return 'CONFLICT';
    case 'OVERRIDE':
    case 'COMPLETED':
    case 'APPROVED':
      return 'APPROVED';
    default:
      return 'REJECTED';
  }
}

/**
 * Run a transformation output through the SECH pre_judgment gate. On APPROVED,
 * resolves the IURG node the FIC check produced so the transformation can link
 * it into the graph.
 */
export async function runTransformGate(
  sech: SechRouterService,
  iurg: IurgService,
  params: {
    workspaceId: string;
    userId: string;
    transform: 'T1' | 'T2' | 'T3';
    domain: string;
    decisionContext: string;
    signals?: Record<string, boolean | number>;
    ctx?: { actorId?: string; requestId?: string; ip?: string; userAgent?: string };
  },
): Promise<TransformGateResult> {
  const route = await sech.route(
    params.workspaceId,
    params.userId,
    {
      checkType: 'pre_judgment',
      decisionContext: `${params.transform}: ${params.decisionContext}`,
      domains: [params.domain],
      signals: params.signals ?? {},
    },
    params.ctx,
  );
  const disposition = mapRoute(route.status);
  const ficCheckId = route.gateResults?.[0]?.checkId ?? null;

  let iurgNodeId: string | null = null;
  let iurgNodeType: string | null = null;
  if (disposition === 'APPROVED' && ficCheckId) {
    const node = await iurg.findNodeBySourceCheck(params.workspaceId, ficCheckId);
    if (node) {
      iurgNodeId = node.id;
      iurgNodeType = node.nodeType;
    }
  }

  return {
    disposition,
    approved: disposition === 'APPROVED',
    ficCheckId,
    sechRouteId: route.id,
    iurgNodeId,
    iurgNodeType,
    reason: route.status,
  };
}

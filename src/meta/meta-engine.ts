import {
  MetaArbitrationOutcome,
  MetaArbitrationType,
  MetaMergeStatus,
  MetaRouteTarget,
} from '@prisma/client';
import {
  ARBITRATION_CONSTITUTIONAL_REF,
  ROUTE_CONSTITUTIONAL_REF,
  ROUTE_TARGET_WEIGHT,
} from './meta.constants';

/**
 * D14 meta-orchestration engine — pure, deterministic, side-effect free.
 * All persistence, audit and evidence concerns live in the service layer.
 */

// ----------------------------------------------------------------------
// Part B — Routing
// ----------------------------------------------------------------------

export type RoutingCandidate = {
  target: MetaRouteTarget;
  priority?: number;
};

export type RoutingResolution = {
  target: MetaRouteTarget;
  score: number;
  reason: string;
  constitutionalRef: string;
};

/** Keyword hints that bias free-text intents toward a routing target. */
const INTENT_HINTS: Array<{ target: MetaRouteTarget; tokens: string[] }> = [
  { target: 'KNOWLEDGE', tokens: ['knowledge', 'object', 'memory', 'fact'] },
  { target: 'LEARNING', tokens: ['learn', 'pattern', 'evolve', 'train'] },
  { target: 'RUNTIME', tokens: ['run', 'execute', 'session', 'runtime'] },
  { target: 'EXCHANGE', tokens: ['exchange', 'transfer', 'message', 'envelope'] },
  { target: 'MEASUREMENT', tokens: ['measure', 'metric', 'benchmark', 'score'] },
  { target: 'CAPITAL', tokens: ['capital', 'allocate', 'fund', 'invest'] },
  { target: 'INTENT', tokens: ['intent', 'founder', 'directive', 'compile'] },
  { target: 'WORKSPACE', tokens: ['workspace', 'tenant', 'governance'] },
  { target: 'PROVIDER', tokens: ['provider', 'tool', 'model', 'vendor'] },
];

function normalize(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Resolve the constitutional routing target for a request. When an explicit
 * target is supplied it is authoritative; otherwise the intent text and any
 * candidate priorities determine the winner deterministically.
 */
export function resolveRoute(input: {
  target?: MetaRouteTarget | null;
  intent?: string | null;
  candidates?: RoutingCandidate[];
}): RoutingResolution {
  if (input.target) {
    return {
      target: input.target,
      score: normalize(ROUTE_TARGET_WEIGHT[input.target]),
      reason: `Explicit routing target ${input.target}`,
      constitutionalRef: ROUTE_CONSTITUTIONAL_REF[input.target],
    };
  }

  const scored = new Map<MetaRouteTarget, number>();
  for (const [target, weight] of Object.entries(ROUTE_TARGET_WEIGHT) as Array<
    [MetaRouteTarget, number]
  >) {
    scored.set(target, weight * 0.5);
  }

  const intent = (input.intent ?? '').toLowerCase();
  if (intent) {
    for (const hint of INTENT_HINTS) {
      if (hint.tokens.some((t) => intent.includes(t))) {
        scored.set(hint.target, (scored.get(hint.target) ?? 0) + 0.4);
      }
    }
  }

  for (const candidate of input.candidates ?? []) {
    const bonus = normalize(candidate.priority ?? 0.5) * 0.5;
    scored.set(candidate.target, (scored.get(candidate.target) ?? 0) + bonus);
  }

  let best: MetaRouteTarget = 'WORKSPACE';
  let bestScore = -1;
  for (const [target, score] of scored) {
    if (score > bestScore) {
      best = target;
      bestScore = score;
    }
  }

  return {
    target: best,
    score: normalize(bestScore),
    reason: intent
      ? `Resolved from intent to ${best}`
      : `Resolved to default constitutional target ${best}`,
    constitutionalRef: ROUTE_CONSTITUTIONAL_REF[best],
  };
}

// ----------------------------------------------------------------------
// Part C — Arbitration
// ----------------------------------------------------------------------

export type ArbitrationPath = {
  id: string;
  label?: string;
  priority?: number;
  authority?: number;
  evidence?: number;
  capital?: number;
  execution?: number;
};

export type ArbitrationResult = {
  type: MetaArbitrationType;
  outcome: MetaArbitrationOutcome;
  winningPath: string | null;
  losingPaths: string[];
  reason: string;
  constitutionalRef: string;
};

function dimensionScore(path: ArbitrationPath, type: MetaArbitrationType): number {
  switch (type) {
    case 'PRIORITY':
      return normalize(path.priority ?? 0);
    case 'AUTHORITY':
      return normalize(path.authority ?? 0);
    case 'EVIDENCE':
      return normalize(path.evidence ?? 0);
    case 'CAPITAL':
      return normalize(path.capital ?? 0);
    case 'EXECUTION':
      return normalize(path.execution ?? 0);
    case 'CONFLICT':
    default: {
      const dims = [
        path.priority,
        path.authority,
        path.evidence,
        path.capital,
        path.execution,
      ].filter((v): v is number => typeof v === 'number');
      if (dims.length === 0) return 0;
      return normalize(dims.reduce((a, b) => a + b, 0) / dims.length);
    }
  }
}

/**
 * Arbitrate competing execution paths along a constitutional dimension and
 * produce a winning path, losing paths, a reason and a constitutional
 * reference. Deadlocks (ties or no paths) are surfaced explicitly.
 */
export function arbitrate(type: MetaArbitrationType, paths: ArbitrationPath[]): ArbitrationResult {
  const constitutionalRef = ARBITRATION_CONSTITUTIONAL_REF[type];
  if (!paths.length) {
    return {
      type,
      outcome: 'DEADLOCK',
      winningPath: null,
      losingPaths: [],
      reason: 'No candidate paths supplied for arbitration',
      constitutionalRef,
    };
  }

  const scored = paths.map((p) => ({ path: p, score: dimensionScore(p, type) }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored[0];
  const tie = scored.length > 1 && scored[1].score === top.score;
  const losing = scored.slice(tie ? 0 : 1).map((s) => s.path.id);

  if (tie) {
    return {
      type,
      outcome: 'ESCALATED',
      winningPath: null,
      losingPaths: losing,
      reason: `Arbitration tie on ${type} at score ${top.score.toFixed(3)} — escalated`,
      constitutionalRef,
    };
  }

  return {
    type,
    outcome: 'RESOLVED',
    winningPath: top.path.id,
    losingPaths: losing,
    reason: `Path ${top.path.id} wins ${type} arbitration with score ${top.score.toFixed(3)}`,
    constitutionalRef,
  };
}

// ----------------------------------------------------------------------
// Part D — Merge validation
// ----------------------------------------------------------------------

export type MergeValidation = {
  valid: boolean;
  status: MetaMergeStatus;
  detail: string;
};

/**
 * Validate a merge request. A merge is valid when it references at least two
 * distinct source paths with no duplicates.
 */
export function validateMerge(sourcePaths: string[]): MergeValidation {
  const cleaned = sourcePaths.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length < 2) {
    return {
      valid: false,
      status: 'REJECTED',
      detail: 'A merge requires at least two source paths',
    };
  }
  const unique = new Set(cleaned);
  if (unique.size !== cleaned.length) {
    return {
      valid: false,
      status: 'REJECTED',
      detail: 'Duplicate source paths are not permitted in a merge',
    };
  }
  return {
    valid: true,
    status: 'VALIDATED',
    detail: `Validated merge of ${cleaned.length} source paths`,
  };
}

// ----------------------------------------------------------------------
// Execution planning
// ----------------------------------------------------------------------

export type PlannedStep = {
  sequence: number;
  name: string;
  target: MetaRouteTarget;
  reason: string;
  constitutionalRef: string;
};

/**
 * Sequence a set of routing intents into ordered, routed execution steps.
 */
export function planSteps(
  intents: Array<{ name: string; target?: MetaRouteTarget | null; intent?: string | null }>,
): PlannedStep[] {
  return intents.map((item, index) => {
    const route = resolveRoute({ target: item.target, intent: item.intent ?? item.name });
    return {
      sequence: index + 1,
      name: item.name,
      target: route.target,
      reason: route.reason,
      constitutionalRef: route.constitutionalRef,
    };
  });
}

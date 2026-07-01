import { FIARAssetClass, FIARAssetStatus } from '@prisma/client';
import {
  CLASS_SOURCE_RUNTIME,
  FIAR_CONSTITUTIONAL_REF,
  FIAR_LIFECYCLE_TRANSITIONS,
  FUTURE_ASSET_CLASSES,
  LIFECYCLE_TARGET_STATUS,
  MAX_GRAPH_DEPTH,
  FiarLifecycleTransition,
} from './fiar.constants';

/**
 * FIAR registry engine — pure, deterministic, side-effect free.
 * Persistence, audit and evidence live in the service layer.
 *
 * The engine resolves the source runtime for a class, validates lifecycle
 * transitions, builds the dependency graph, derives lineage and validates an
 * asset against governance policy. It never reasons, plans or decides.
 */

// ----------------------------------------------------------------------
// Part B / E — classification helpers
// ----------------------------------------------------------------------

/** Resolve the constitutional runtime that owns a class's underlying data. */
export function resolveSourceRuntime(assetClass: FIARAssetClass): string {
  return CLASS_SOURCE_RUNTIME[assetClass] ?? 'unknown';
}

/** True when the class is reserved for a future (not-yet-implemented) runtime. */
export function isFutureClass(assetClass: FIARAssetClass): boolean {
  return FUTURE_ASSET_CLASSES.includes(assetClass);
}

// ----------------------------------------------------------------------
// Part D — lifecycle
// ----------------------------------------------------------------------

export type LifecycleResolution = {
  allowed: boolean;
  currentStatus: FIARAssetStatus;
  targetStatus: FIARAssetStatus;
  reason: string;
};

/**
 * Resolve a lifecycle transition verb against the current asset status.
 * Returns whether the transition is permitted and the target status.
 */
export function resolveLifecycleTransition(
  currentStatus: FIARAssetStatus,
  transition: FiarLifecycleTransition,
): LifecycleResolution {
  const targetStatus = LIFECYCLE_TARGET_STATUS[transition];
  const allowedTargets = FIAR_LIFECYCLE_TRANSITIONS[currentStatus] ?? [];
  const allowed = allowedTargets.includes(targetStatus);
  return {
    allowed,
    currentStatus,
    targetStatus,
    reason: allowed
      ? `${currentStatus} -> ${targetStatus}`
      : `Transition ${transition} (${currentStatus} -> ${targetStatus}) is not permitted`,
  };
}

/** Next version number for a versioned asset mutation. */
export function nextVersion(current: number): number {
  return (Number.isFinite(current) && current > 0 ? current : 0) + 1;
}

// ----------------------------------------------------------------------
// Part C — dependency graph + lineage
// ----------------------------------------------------------------------

export type GraphEdge = {
  assetId: string;
  targetAssetId: string;
  kind: string;
};

export type DependencyGraph = {
  root: string;
  nodes: string[];
  edges: GraphEdge[];
  depth: number;
  cyclic: boolean;
};

/**
 * Build the outgoing dependency graph reachable from a root asset. Follows
 * every active edge (DEPENDS_ON / COMPOSES / REFERENCES / DERIVES_FROM /
 * REPLACES / RELATES_TO) breadth-first with a cycle guard.
 */
export function buildDependencyGraph(rootId: string, edges: GraphEdge[]): DependencyGraph {
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.assetId) ?? [];
    list.push(edge);
    adjacency.set(edge.assetId, list);
  }

  const nodes = new Set<string>([rootId]);
  const collectedEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  const visited = new Set<string>();
  let cyclic = false;
  let depth = 0;

  let frontier: string[] = [rootId];
  while (frontier.length && depth < MAX_GRAPH_DEPTH) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      if (visited.has(nodeId)) {
        cyclic = true;
        continue;
      }
      visited.add(nodeId);
      for (const edge of adjacency.get(nodeId) ?? []) {
        const edgeKey = `${edge.assetId}->${edge.targetAssetId}:${edge.kind}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          collectedEdges.push(edge);
        }
        nodes.add(edge.targetAssetId);
        if (visited.has(edge.targetAssetId)) {
          cyclic = true;
        } else {
          next.push(edge.targetAssetId);
        }
      }
    }
    frontier = next;
    if (next.length) depth += 1;
  }

  return {
    root: rootId,
    nodes: Array.from(nodes),
    edges: collectedEdges,
    depth,
    cyclic,
  };
}

export type Lineage = {
  root: string;
  ancestors: string[];
  depth: number;
  constitutionalRef: string;
};

/**
 * Derive lineage for an asset by walking DERIVES_FROM / REPLACES edges from the
 * asset toward its ancestors (the assets it was derived from or replaced).
 */
export function deriveLineage(rootId: string, edges: GraphEdge[]): Lineage {
  const lineageKinds = new Set(['DERIVES_FROM', 'REPLACES']);
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!lineageKinds.has(edge.kind)) continue;
    const list = adjacency.get(edge.assetId) ?? [];
    list.push(edge.targetAssetId);
    adjacency.set(edge.assetId, list);
  }

  const ancestors: string[] = [];
  const seen = new Set<string>([rootId]);
  let frontier = adjacency.get(rootId) ?? [];
  let depth = 0;
  while (frontier.length && depth < MAX_GRAPH_DEPTH) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      ancestors.push(nodeId);
      next.push(...(adjacency.get(nodeId) ?? []));
    }
    frontier = next;
    depth += 1;
  }

  return {
    root: rootId,
    ancestors,
    depth,
    constitutionalRef: FIAR_CONSTITUTIONAL_REF.LINEAGE,
  };
}

// ----------------------------------------------------------------------
// Part F — governance validation
// ----------------------------------------------------------------------

export type AssetValidation = {
  valid: boolean;
  issues: string[];
  future: boolean;
  constitutionalRef: string;
};

/**
 * Validate an asset against a governance policy: ownership presence, a
 * cross-runtime reference (when required) and class allow-listing. Future
 * classes are flagged but not treated as invalid.
 */
export function validateAsset(input: {
  assetClass: FIARAssetClass;
  hasActiveOwnership: boolean;
  referenceId?: string | null;
  requireOwnership?: boolean;
  requireReference?: boolean;
  allowedClasses?: string[] | null;
}): AssetValidation {
  const issues: string[] = [];
  const requireOwnership = input.requireOwnership ?? true;
  const requireReference = input.requireReference ?? false;

  if (requireOwnership && !input.hasActiveOwnership) {
    issues.push('Asset has no active ownership assignment');
  }
  if (requireReference && !input.referenceId?.trim()) {
    issues.push('Asset has no cross-runtime reference');
  }
  if (
    input.allowedClasses &&
    input.allowedClasses.length > 0 &&
    !input.allowedClasses.includes(input.assetClass)
  ) {
    issues.push(`Asset class ${input.assetClass} is not permitted by policy`);
  }

  return {
    valid: issues.length === 0,
    issues,
    future: isFutureClass(input.assetClass),
    constitutionalRef: FIAR_CONSTITUTIONAL_REF.ASSET,
  };
}

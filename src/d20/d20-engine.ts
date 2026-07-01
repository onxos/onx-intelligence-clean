import {
  DeploymentEnvironment,
  ImplementationDependencyKind,
  ImplementationUnitKind,
} from '@prisma/client';
import {
  BUILD_STAGES,
  type BuildStage,
  type CompatibilityLevel,
  MAX_GRAPH_DEPTH,
} from './d20.constants';

/**
 * D20 engine — pure, deterministic, side-effect free.
 *
 * Provides dependency-graph construction, cycle detection, dependency
 * validation, compatibility verification, build validation and deployment
 * validation. It documents and validates how ONX Intelligence is built,
 * assembled and deployed — it never introduces intelligence capabilities and
 * never executes anything.
 */

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// ----------------------------------------------------------------------
// Signal shapes
// ----------------------------------------------------------------------

export type UnitRef = {
  id: string;
  name: string;
  kind: ImplementationUnitKind;
};

export type DependencyEdge = {
  fromUnitId: string;
  toUnitId: string;
  kind: ImplementationDependencyKind;
  required: boolean;
  satisfied: boolean;
};

// ----------------------------------------------------------------------
// Part B / D — dependency graph + cycle detection
// ----------------------------------------------------------------------

export type GraphEdge = { from: string; to: string; kind: ImplementationDependencyKind };

export type DependencyGraph = {
  nodes: string[];
  edges: GraphEdge[];
  adjacency: Record<string, string[]>;
  cyclic: boolean;
  cycles: string[][];
  depth: number;
  orphanEdges: GraphEdge[];
};

/**
 * Build the directed dependency graph and detect cycles. Edges whose target is
 * not a known node are reported as orphan edges (missing modules).
 */
export function buildDependencyGraph(units: UnitRef[], edges: DependencyEdge[]): DependencyGraph {
  const nodes = units.map((u) => u.id);
  const nodeSet = new Set(nodes);
  const adjacency: Record<string, string[]> = {};
  for (const id of nodes) adjacency[id] = [];

  const graphEdges: GraphEdge[] = [];
  const orphanEdges: GraphEdge[] = [];
  for (const e of edges) {
    const edge: GraphEdge = { from: e.fromUnitId, to: e.toUnitId, kind: e.kind };
    if (!nodeSet.has(e.fromUnitId) || !nodeSet.has(e.toUnitId)) {
      orphanEdges.push(edge);
      continue;
    }
    graphEdges.push(edge);
    adjacency[e.fromUnitId].push(e.toUnitId);
  }

  const { cyclic, cycles } = detectCycles(nodes, adjacency);
  const depth = cyclic ? MAX_GRAPH_DEPTH : longestPath(nodes, adjacency);

  return { nodes, edges: graphEdges, adjacency, cyclic, cycles, depth, orphanEdges };
}

/** Detect cycles via DFS colouring. Returns the cyclic flag and the cycles found. */
export function detectCycles(
  nodes: string[],
  adjacency: Record<string, string[]>,
): { cyclic: boolean; cycles: string[][] } {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color: Record<string, number> = {};
  for (const n of nodes) color[n] = WHITE;
  const cycles: string[][] = [];
  const stack: string[] = [];

  const visit = (node: string, guard: number): void => {
    if (guard > MAX_GRAPH_DEPTH) return;
    color[node] = GRAY;
    stack.push(node);
    for (const next of adjacency[node] ?? []) {
      if (color[next] === GRAY) {
        const start = stack.indexOf(next);
        cycles.push(stack.slice(start >= 0 ? start : 0).concat(next));
      } else if (color[next] === WHITE) {
        visit(next, guard + 1);
      }
    }
    stack.pop();
    color[node] = BLACK;
  };

  for (const n of nodes) {
    if (color[n] === WHITE) visit(n, 0);
  }
  return { cyclic: cycles.length > 0, cycles };
}

/** Longest path length over a DAG (0 when there are no edges). */
function longestPath(nodes: string[], adjacency: Record<string, string[]>): number {
  const memo: Record<string, number> = {};
  const dfs = (node: string, guard: number): number => {
    if (guard > MAX_GRAPH_DEPTH) return 0;
    if (memo[node] !== undefined) return memo[node];
    let best = 0;
    for (const next of adjacency[node] ?? []) {
      best = Math.max(best, 1 + dfs(next, guard + 1));
    }
    memo[node] = best;
    return best;
  };
  let depth = 0;
  for (const n of nodes) depth = Math.max(depth, dfs(n, 0));
  return depth;
}

// ----------------------------------------------------------------------
// Part D — dependency validation
// ----------------------------------------------------------------------

export type DependencyValidation = {
  valid: boolean;
  cyclic: boolean;
  total: number;
  satisfiedCount: number;
  requiredCount: number;
  unsatisfiedRequired: string[];
  missingTargets: string[];
  issues: string[];
};

/**
 * Validate the dependency set: required dependencies must be satisfied, targets
 * must exist and the graph must be acyclic.
 */
export function validateDependencies(
  units: UnitRef[],
  edges: DependencyEdge[],
): DependencyValidation {
  const graph = buildDependencyGraph(units, edges);
  const byId = new Map(units.map((u) => [u.id, u]));
  const unsatisfiedRequired: string[] = [];
  const missingTargets: string[] = [];
  let satisfiedCount = 0;
  let requiredCount = 0;

  for (const e of edges) {
    if (e.required) requiredCount += 1;
    if (e.satisfied) satisfiedCount += 1;
    if (e.required && !e.satisfied) {
      unsatisfiedRequired.push(`${label(byId, e.fromUnitId)} -> ${label(byId, e.toUnitId)}`);
    }
    if (!byId.has(e.toUnitId) || !byId.has(e.fromUnitId)) {
      missingTargets.push(`${e.fromUnitId} -> ${e.toUnitId}`);
    }
  }

  const issues: string[] = [];
  if (graph.cyclic) issues.push('Dependency graph contains a cycle');
  for (const u of unsatisfiedRequired) issues.push(`Unsatisfied required dependency: ${u}`);
  for (const m of missingTargets) issues.push(`Dependency references an unknown unit: ${m}`);

  return {
    valid: issues.length === 0,
    cyclic: graph.cyclic,
    total: edges.length,
    satisfiedCount,
    requiredCount,
    unsatisfiedRequired,
    missingTargets,
    issues,
  };
}

function label(byId: Map<string, UnitRef>, id: string): string {
  return byId.get(id)?.name ?? id;
}

// ----------------------------------------------------------------------
// Part C / D — compatibility verification
// ----------------------------------------------------------------------

export type CompatibilityEntry = {
  module: string;
  level: CompatibilityLevel;
  note?: string | null;
};

export type CompatibilityReport = {
  overall: CompatibilityLevel;
  total: number;
  compatibleCount: number;
  degraded: string[];
  incompatible: string[];
};

/** Roll a set of compatibility declarations into an overall level (worst wins). */
export function verifyCompatibility(entries: CompatibilityEntry[]): CompatibilityReport {
  const degraded: string[] = [];
  const incompatible: string[] = [];
  let compatibleCount = 0;
  for (const e of entries) {
    if (e.level === 'INCOMPATIBLE') incompatible.push(e.module);
    else if (e.level === 'DEGRADED') degraded.push(e.module);
    else compatibleCount += 1;
  }
  const overall: CompatibilityLevel = incompatible.length
    ? 'INCOMPATIBLE'
    : degraded.length
      ? 'DEGRADED'
      : 'COMPATIBLE';
  return { overall, total: entries.length, compatibleCount, degraded, incompatible };
}

// ----------------------------------------------------------------------
// Part C — build validation
// ----------------------------------------------------------------------

export type BuildInput = {
  stages?: string[];
  artifacts?: string[];
  dependency: DependencyValidation;
  compatibility: CompatibilityReport;
};

export type BuildEvaluation = {
  valid: boolean;
  status: 'VALIDATED' | 'FAILED';
  stages: BuildStage[];
  missingStages: BuildStage[];
  artifactCount: number;
  issues: string[];
};

/**
 * Validate a build profile: the canonical build stages must be present, its
 * dependencies must validate and it must not be constitutionally incompatible.
 */
export function evaluateBuild(input: BuildInput): BuildEvaluation {
  const declared = new Set((input.stages ?? []).map((s) => s.toUpperCase()));
  const stages: BuildStage[] = declared.size
    ? [...BUILD_STAGES].filter((s) => declared.has(s))
    : [...BUILD_STAGES];
  const missingStages: BuildStage[] = [...BUILD_STAGES].filter((s) => !stages.includes(s));

  const issues: string[] = [];
  if (missingStages.length) issues.push(`Missing build stages: ${missingStages.join(', ')}`);
  if (!input.dependency.valid) issues.push('Build dependencies did not validate');
  if (input.compatibility.overall === 'INCOMPATIBLE') {
    issues.push('Build contains incompatible modules');
  }

  const valid = issues.length === 0;
  return {
    valid,
    status: valid ? 'VALIDATED' : 'FAILED',
    stages,
    missingStages,
    artifactCount: input.artifacts?.length ?? 0,
    issues,
  };
}

// ----------------------------------------------------------------------
// Part E — deployment validation
// ----------------------------------------------------------------------

export type DeploymentInput = {
  environment: DeploymentEnvironment;
  buildValid: boolean;
  dependencyValid: boolean;
  rollbackMetadataPresent: boolean;
};

export type DeploymentEvaluation = {
  valid: boolean;
  status: 'VALIDATED' | 'FAILED';
  rollbackReady: boolean;
  issues: string[];
};

/**
 * Validate a deployment profile: the build and dependencies must validate and a
 * PRODUCTION deployment additionally requires rollback metadata.
 */
export function evaluateDeployment(input: DeploymentInput): DeploymentEvaluation {
  const issues: string[] = [];
  if (!input.buildValid) issues.push('Referenced build profile is not valid');
  if (!input.dependencyValid) issues.push('Dependencies did not validate');
  const rollbackReady = input.rollbackMetadataPresent;
  if (input.environment === 'PRODUCTION' && !rollbackReady) {
    issues.push('Production deployment requires rollback metadata');
  }
  const valid = issues.length === 0;
  return { valid, status: valid ? 'VALIDATED' : 'FAILED', rollbackReady, issues };
}

// ----------------------------------------------------------------------
// Aggregate implementation validation
// ----------------------------------------------------------------------

export type ImplementationValidationInput = {
  unitCount: number;
  boundaryCount: number;
  dependency: DependencyValidation;
  compatibility: CompatibilityReport;
  hasConstitutionalRef: boolean;
};

export type ValidationCheck = {
  kind: 'REGISTRY' | 'BOUNDARY' | 'DEPENDENCY' | 'COMPATIBILITY' | 'CONSTITUTIONAL';
  valid: boolean;
  issue: string | null;
};

export type ImplementationValidationResult = {
  valid: boolean;
  checks: ValidationCheck[];
  issues: string[];
};

/**
 * Aggregate governance validation across the registry, boundaries, dependency
 * graph, compatibility matrix and constitutional reference.
 */
export function validateImplementation(
  input: ImplementationValidationInput,
): ImplementationValidationResult {
  const registryValid = input.unitCount > 0;
  const boundaryValid = input.boundaryCount > 0;
  const dependencyValid = input.dependency.valid;
  const compatibilityValid = input.compatibility.overall !== 'INCOMPATIBLE';
  const constitutionalValid = input.hasConstitutionalRef;

  const checks: ValidationCheck[] = [
    {
      kind: 'REGISTRY',
      valid: registryValid,
      issue: registryValid ? null : 'No implementation units registered',
    },
    {
      kind: 'BOUNDARY',
      valid: boundaryValid,
      issue: boundaryValid ? null : 'No implementation boundaries declared',
    },
    {
      kind: 'DEPENDENCY',
      valid: dependencyValid,
      issue: dependencyValid
        ? null
        : input.dependency.issues.join('; ') || 'Dependency validation failed',
    },
    {
      kind: 'COMPATIBILITY',
      valid: compatibilityValid,
      issue: compatibilityValid ? null : 'Incompatible modules present',
    },
    {
      kind: 'CONSTITUTIONAL',
      valid: constitutionalValid,
      issue: constitutionalValid ? null : 'Missing constitutional reference',
    },
  ];

  const issues = checks.filter((c) => !c.valid && c.issue).map((c) => c.issue as string);
  return { valid: checks.every((c) => c.valid), checks, issues };
}

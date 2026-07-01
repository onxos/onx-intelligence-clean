import {
  buildDependencyGraph,
  clamp01,
  detectCycles,
  evaluateBuild,
  evaluateDeployment,
  validateDependencies,
  validateImplementation,
  verifyCompatibility,
  type CompatibilityEntry,
  type DependencyEdge,
  type UnitRef,
} from './d20-engine';
import { BUILD_STAGES } from './d20.constants';

const units: UnitRef[] = [
  { id: 'a', name: 'Reasoning', kind: 'ENGINE' },
  { id: 'b', name: 'Planning', kind: 'ENGINE' },
  { id: 'c', name: 'Decision', kind: 'ENGINE' },
];

function edge(from: string, to: string, over: Partial<DependencyEdge> = {}): DependencyEdge {
  return {
    fromUnitId: from,
    toUnitId: to,
    kind: 'REQUIRED',
    required: true,
    satisfied: true,
    ...over,
  };
}

describe('d20-engine', () => {
  describe('clamp01', () => {
    it('clamps values into [0,1]', () => {
      expect(clamp01(-2)).toBe(0);
      expect(clamp01(5)).toBe(1);
      expect(clamp01(0.3)).toBeCloseTo(0.3);
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });

  describe('buildDependencyGraph', () => {
    it('builds adjacency and reports acyclic for a DAG', () => {
      const graph = buildDependencyGraph(units, [edge('c', 'b'), edge('b', 'a')]);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.cyclic).toBe(false);
      expect(graph.depth).toBe(2);
      expect(graph.adjacency['c']).toEqual(['b']);
    });

    it('detects a cycle', () => {
      const graph = buildDependencyGraph(units, [edge('a', 'b'), edge('b', 'a')]);
      expect(graph.cyclic).toBe(true);
      expect(graph.cycles.length).toBeGreaterThan(0);
    });

    it('reports orphan edges to unknown units', () => {
      const graph = buildDependencyGraph(units, [edge('a', 'zzz')]);
      expect(graph.orphanEdges).toHaveLength(1);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('detectCycles', () => {
    it('returns false for an empty adjacency', () => {
      const result = detectCycles(['a', 'b'], { a: [], b: [] });
      expect(result.cyclic).toBe(false);
    });
  });

  describe('validateDependencies', () => {
    it('is valid for a satisfied acyclic set', () => {
      const v = validateDependencies(units, [edge('c', 'b'), edge('b', 'a')]);
      expect(v.valid).toBe(true);
      expect(v.cyclic).toBe(false);
    });

    it('flags unsatisfied required dependencies', () => {
      const v = validateDependencies(units, [edge('c', 'b', { satisfied: false })]);
      expect(v.valid).toBe(false);
      expect(v.unsatisfiedRequired).toHaveLength(1);
    });

    it('flags cyclic dependency sets', () => {
      const v = validateDependencies(units, [edge('a', 'b'), edge('b', 'a')]);
      expect(v.valid).toBe(false);
      expect(v.cyclic).toBe(true);
    });

    it('tolerates unsatisfied optional dependencies', () => {
      const v = validateDependencies(units, [
        edge('c', 'b', { required: false, satisfied: false }),
      ]);
      expect(v.valid).toBe(true);
    });
  });

  describe('verifyCompatibility', () => {
    it('rolls up to COMPATIBLE when everything is compatible', () => {
      const entries: CompatibilityEntry[] = [
        { module: 'REASONING', level: 'COMPATIBLE' },
        { module: 'PLANNING', level: 'COMPATIBLE' },
      ];
      expect(verifyCompatibility(entries).overall).toBe('COMPATIBLE');
    });

    it('downgrades to DEGRADED then INCOMPATIBLE (worst wins)', () => {
      expect(verifyCompatibility([{ module: 'X', level: 'DEGRADED' }]).overall).toBe('DEGRADED');
      expect(
        verifyCompatibility([
          { module: 'X', level: 'DEGRADED' },
          { module: 'Y', level: 'INCOMPATIBLE' },
        ]).overall,
      ).toBe('INCOMPATIBLE');
    });
  });

  describe('evaluateBuild', () => {
    const dependency = validateDependencies(units, [edge('c', 'b')]);
    const compatibility = verifyCompatibility([{ module: 'REASONING', level: 'COMPATIBLE' }]);

    it('validates when all stages are present and deps validate', () => {
      const result = evaluateBuild({ stages: [...BUILD_STAGES], dependency, compatibility });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('VALIDATED');
      expect(result.missingStages).toHaveLength(0);
    });

    it('fails when stages are missing', () => {
      const result = evaluateBuild({ stages: ['COMPILE'], dependency, compatibility });
      expect(result.valid).toBe(false);
      expect(result.missingStages.length).toBeGreaterThan(0);
    });

    it('fails on incompatible modules', () => {
      const incompatible = verifyCompatibility([{ module: 'X', level: 'INCOMPATIBLE' }]);
      const result = evaluateBuild({
        stages: [...BUILD_STAGES],
        dependency,
        compatibility: incompatible,
      });
      expect(result.valid).toBe(false);
    });

    it('defaults to the canonical stages when none are declared', () => {
      const result = evaluateBuild({ dependency, compatibility });
      expect(result.stages).toEqual([...BUILD_STAGES]);
    });
  });

  describe('evaluateDeployment', () => {
    it('validates a non-production deployment with a valid build', () => {
      const result = evaluateDeployment({
        environment: 'STAGING',
        buildValid: true,
        dependencyValid: true,
        rollbackMetadataPresent: false,
      });
      expect(result.valid).toBe(true);
    });

    it('requires rollback metadata for production', () => {
      const result = evaluateDeployment({
        environment: 'PRODUCTION',
        buildValid: true,
        dependencyValid: true,
        rollbackMetadataPresent: false,
      });
      expect(result.valid).toBe(false);
      expect(result.rollbackReady).toBe(false);
    });

    it('validates production with rollback metadata', () => {
      const result = evaluateDeployment({
        environment: 'PRODUCTION',
        buildValid: true,
        dependencyValid: true,
        rollbackMetadataPresent: true,
      });
      expect(result.valid).toBe(true);
      expect(result.rollbackReady).toBe(true);
    });

    it('fails when the build is invalid', () => {
      const result = evaluateDeployment({
        environment: 'STAGING',
        buildValid: false,
        dependencyValid: true,
        rollbackMetadataPresent: true,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateImplementation', () => {
    it('passes all five checks for a well-formed implementation', () => {
      const dependency = validateDependencies(units, [edge('c', 'b')]);
      const compatibility = verifyCompatibility([{ module: 'REASONING', level: 'COMPATIBLE' }]);
      const result = validateImplementation({
        unitCount: 3,
        boundaryCount: 2,
        dependency,
        compatibility,
        hasConstitutionalRef: true,
      });
      expect(result.checks).toHaveLength(5);
      expect(result.valid).toBe(true);
    });

    it('fails registry and boundary checks when empty', () => {
      const dependency = validateDependencies([], []);
      const compatibility = verifyCompatibility([]);
      const result = validateImplementation({
        unitCount: 0,
        boundaryCount: 0,
        dependency,
        compatibility,
        hasConstitutionalRef: false,
      });
      expect(result.valid).toBe(false);
      const failed = result.checks.filter((c) => !c.valid).map((c) => c.kind);
      expect(failed).toEqual(expect.arrayContaining(['REGISTRY', 'BOUNDARY', 'CONSTITUTIONAL']));
    });
  });
});

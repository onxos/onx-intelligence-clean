import { FiarLifecycleTransition } from './fiar.constants';
import {
  buildDependencyGraph,
  deriveLineage,
  isFutureClass,
  nextVersion,
  resolveLifecycleTransition,
  resolveSourceRuntime,
  validateAsset,
  type GraphEdge,
} from './fiar-engine';

describe('fiar-engine', () => {
  describe('resolveSourceRuntime', () => {
    it('maps canonical classes to their owning runtime', () => {
      expect(resolveSourceRuntime('KNOWLEDGE')).toBe('D16');
      expect(resolveSourceRuntime('INTENT')).toBe('FIC');
      expect(resolveSourceRuntime('PROTOCOL')).toBe('USFIP');
      expect(resolveSourceRuntime('CAPITAL')).toBe('D13');
      expect(resolveSourceRuntime('EXCHANGE')).toBe('D19');
    });
  });

  describe('isFutureClass', () => {
    it('flags reasoning/planning/decision as future', () => {
      expect(isFutureClass('REASONING')).toBe(true);
      expect(isFutureClass('PLANNING')).toBe(true);
      expect(isFutureClass('DECISION')).toBe(true);
      expect(isFutureClass('KNOWLEDGE')).toBe(false);
    });
  });

  describe('resolveLifecycleTransition', () => {
    it('permits valid transitions', () => {
      expect(resolveLifecycleTransition('DRAFT', FiarLifecycleTransition.ACTIVATE).allowed).toBe(
        true,
      );
      expect(resolveLifecycleTransition('ACTIVE', FiarLifecycleTransition.DEPRECATE).allowed).toBe(
        true,
      );
      expect(resolveLifecycleTransition('ACTIVE', FiarLifecycleTransition.REPLACE).allowed).toBe(
        true,
      );
      expect(
        resolveLifecycleTransition('DEPRECATED', FiarLifecycleTransition.ARCHIVE).allowed,
      ).toBe(true);
    });

    it('rejects invalid and terminal transitions', () => {
      expect(resolveLifecycleTransition('DRAFT', FiarLifecycleTransition.DEPRECATE).allowed).toBe(
        false,
      );
      expect(resolveLifecycleTransition('ARCHIVED', FiarLifecycleTransition.ACTIVATE).allowed).toBe(
        false,
      );
      expect(
        resolveLifecycleTransition('OVERRIDDEN', FiarLifecycleTransition.ACTIVATE).allowed,
      ).toBe(false);
    });

    it('resolves the target status', () => {
      expect(
        resolveLifecycleTransition('ACTIVE', FiarLifecycleTransition.ARCHIVE).targetStatus,
      ).toBe('ARCHIVED');
    });
  });

  describe('nextVersion', () => {
    it('increments and guards non-positive input', () => {
      expect(nextVersion(1)).toBe(2);
      expect(nextVersion(0)).toBe(1);
      expect(nextVersion(NaN)).toBe(1);
    });
  });

  describe('buildDependencyGraph', () => {
    const edges: GraphEdge[] = [
      { assetId: 'a', targetAssetId: 'b', kind: 'DEPENDS_ON' },
      { assetId: 'b', targetAssetId: 'c', kind: 'COMPOSES' },
      { assetId: 'a', targetAssetId: 'd', kind: 'REFERENCES' },
    ];

    it('collects reachable nodes and edges from the root', () => {
      const graph = buildDependencyGraph('a', edges);
      expect(graph.root).toBe('a');
      expect(graph.nodes.sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(graph.edges.length).toBe(3);
      expect(graph.cyclic).toBe(false);
    });

    it('detects cycles without infinite looping', () => {
      const cyclic: GraphEdge[] = [
        { assetId: 'a', targetAssetId: 'b', kind: 'DEPENDS_ON' },
        { assetId: 'b', targetAssetId: 'a', kind: 'DEPENDS_ON' },
      ];
      const graph = buildDependencyGraph('a', cyclic);
      expect(graph.cyclic).toBe(true);
      expect(graph.nodes.sort()).toEqual(['a', 'b']);
    });

    it('returns just the root when it has no outgoing edges', () => {
      const graph = buildDependencyGraph('z', edges);
      expect(graph.nodes).toEqual(['z']);
      expect(graph.edges).toEqual([]);
    });
  });

  describe('deriveLineage', () => {
    it('walks DERIVES_FROM and REPLACES edges to ancestors', () => {
      const edges: GraphEdge[] = [
        { assetId: 'v3', targetAssetId: 'v2', kind: 'REPLACES' },
        { assetId: 'v2', targetAssetId: 'v1', kind: 'DERIVES_FROM' },
        { assetId: 'v3', targetAssetId: 'x', kind: 'DEPENDS_ON' },
      ];
      const lineage = deriveLineage('v3', edges);
      expect(lineage.ancestors).toEqual(['v2', 'v1']);
      expect(lineage.ancestors).not.toContain('x');
    });

    it('returns empty ancestors for a root asset', () => {
      const lineage = deriveLineage('root', []);
      expect(lineage.ancestors).toEqual([]);
    });
  });

  describe('validateAsset', () => {
    it('passes when ownership present and no reference required', () => {
      const result = validateAsset({
        assetClass: 'KNOWLEDGE',
        hasActiveOwnership: true,
      });
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.future).toBe(false);
    });

    it('flags missing ownership', () => {
      const result = validateAsset({
        assetClass: 'KNOWLEDGE',
        hasActiveOwnership: false,
        requireOwnership: true,
      });
      expect(result.valid).toBe(false);
      expect(result.issues.join(' ')).toContain('ownership');
    });

    it('flags missing reference when required', () => {
      const result = validateAsset({
        assetClass: 'KNOWLEDGE',
        hasActiveOwnership: true,
        requireReference: true,
        referenceId: null,
      });
      expect(result.valid).toBe(false);
      expect(result.issues.join(' ')).toContain('reference');
    });

    it('flags a class not permitted by policy', () => {
      const result = validateAsset({
        assetClass: 'TOOL',
        hasActiveOwnership: true,
        allowedClasses: ['KNOWLEDGE', 'CAPITAL'],
      });
      expect(result.valid).toBe(false);
      expect(result.issues.join(' ')).toContain('not permitted');
    });

    it('marks future classes without failing validation', () => {
      const result = validateAsset({
        assetClass: 'REASONING',
        hasActiveOwnership: true,
      });
      expect(result.valid).toBe(true);
      expect(result.future).toBe(true);
    });
  });
});

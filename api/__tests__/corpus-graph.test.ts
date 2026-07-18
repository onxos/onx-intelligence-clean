import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearIucSnapshots, replaceIurgObjects } from "../lib/iurg-store";
import { buildCorpusObjects } from "../lib/corpus";
import { buildCorpusGraph, relatedByQuery, relatedRecords } from "../lib/corpus-graph";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";

const caller = appRouter.createCaller({} as any);
const built = buildCorpusObjects(CURATED_VET_CORPUS);

describe("buildCorpusGraph (deterministic, provenance-derived)", () => {
  it("creates record/authority/domain nodes and cites-authority edges", () => {
    const graph = buildCorpusGraph(built);
    expect(graph.stats.recordNodes).toBe(built.length);
    expect(graph.stats.authorityNodes).toBeGreaterThanOrEqual(5);
    expect(graph.stats.domainNodes).toBeGreaterThanOrEqual(1);
    // Every curated record is provenance-valid, so each cites exactly one authority.
    expect(graph.stats.byEdgeType.CITES_AUTHORITY).toBe(built.length);
    expect(graph.stats.byEdgeType.IN_DOMAIN).toBe(built.length);
    expect(graph.stats.topAuthorities[0].records).toBeGreaterThan(0);
  });

  it("connects records that cite the same authority (SHARES_AUTHORITY)", () => {
    const graph = buildCorpusGraph(built);
    expect(graph.stats.byEdgeType.SHARES_AUTHORITY).toBeGreaterThan(0);
  });

  it("is fully deterministic", () => {
    const a = buildCorpusGraph(built);
    const b = buildCorpusGraph(built);
    expect(a.stats).toEqual(b.stats);
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.edges.length).toBe(b.edges.length);
  });
});

describe("graph-augmented cited retrieval", () => {
  it("relatedByQuery returns a cited seed and cited neighbours (excluding the seed)", () => {
    const res = relatedByQuery(built, "parvovirus", 5);
    expect(res.seed).not.toBeNull();
    expect(res.seed!.citation).toBeTruthy();
    expect(res.related.length).toBeGreaterThan(0);
    for (const r of res.related) {
      expect(r.id).not.toBe(res.seed!.id);
      expect(r.provenanceValid).toBe(true);
      expect(r.citation).toBeTruthy();
    }
  });

  it("relatedRecords ranks by relation strength and respects the limit", () => {
    const seedId = built[0].id!;
    const related = relatedRecords(built, seedId, 3);
    expect(related.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < related.length; i++) {
      expect(related[i - 1].relation).toBeGreaterThanOrEqual(related[i].relation);
    }
    expect(related.every((r) => r.id !== seedId)).toBe(true);
  });

  it("returns an empty result for an unknown seed", () => {
    expect(relatedRecords(built, "corpus-does-not-exist", 5)).toEqual([]);
  });
});

describe.sequential("corpus graph router integration", () => {
  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
  });

  it("iuc.corpusGraph reports measured graph stats over persisted objects", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusGraph();
    expect(res.stats.recordNodes).toBe(built.length);
    expect(res.stats.edges).toBeGreaterThan(0);
    // stats-only by default
    expect((res as { nodes?: unknown }).nodes).toBeUndefined();

    const full = await caller.iuc.corpusGraph({ includeElements: true });
    expect(Array.isArray(full.nodes)).toBe(true);
    expect(full.nodes!.length).toBe(res.stats.recordNodes + res.stats.authorityNodes + res.stats.domainNodes);
  });

  it("iuc.corpusRelated returns a cited seed + graph neighbours", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusRelated({ query: "feline vaccine", limit: 5 });
    expect(res.seed).not.toBeNull();
    expect(res.related.length).toBeGreaterThan(0);
    expect(res.related.every((r) => r.citation)).toBe(true);
  });
});

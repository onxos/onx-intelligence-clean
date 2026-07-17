import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearIucSnapshots, replaceIurgObjects } from "../lib/iurg-store";
import { buildCorpusObjects, type CorpusSeed } from "../lib/corpus";
import { bm25Search, buildInvertedIndex, indexLookup, indexSearchCorpus, indexStats } from "../lib/corpus-index";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";

const caller = appRouter.createCaller({} as any);
const built = buildCorpusObjects(CURATED_VET_CORPUS);

describe("buildInvertedIndex (deterministic term->postings)", () => {
  it("indexes every non-empty document with a real vocabulary", () => {
    const index = buildInvertedIndex(built);
    expect(index.docCount).toBe(built.length);
    expect(index.termCount).toBeGreaterThan(50);
    expect(index.avgDocLength).toBeGreaterThan(0);
    expect(index.docLengths.size).toBe(built.length);
  });

  it("keeps postings sorted by id and df consistent with postings length", () => {
    const index = buildInvertedIndex(built);
    for (const [term, postings] of index.postings) {
      expect(index.df.get(term)).toBe(postings.length);
      const ids = postings.map((p) => p.id);
      expect(ids).toEqual([...ids].sort());
    }
  });

  it("indexLookup returns postings for a present term and nothing for OOV", () => {
    const index = buildInvertedIndex(built);
    expect(indexLookup(index, "parvovirus").length).toBeGreaterThan(0);
    expect(indexLookup(index, "zzzqqqxyzzy")).toEqual([]);
  });

  it("indexStats reports measured structure size, top terms sorted by df", () => {
    const stats = indexStats(buildInvertedIndex(built));
    expect(stats.docCount).toBe(built.length);
    expect(stats.postingsCount).toBeGreaterThan(stats.docCount);
    for (let i = 1; i < stats.topTerms.length; i++) {
      expect(stats.topTerms[i - 1].df).toBeGreaterThanOrEqual(stats.topTerms[i].df);
    }
  });
});

describe("bm25Search (indexed retrieval, cited + selective)", () => {
  it("returns cited hits ranked by BM25, examining only matching docs", () => {
    const result = indexSearchCorpus(built, "canine parvovirus", 5);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.candidates).toBeGreaterThan(0);
    // An index only touches docs containing a query term — far fewer than all.
    expect(result.candidates).toBeLessThan(built.length);
    for (let i = 1; i < result.hits.length; i++) {
      expect(result.hits[i - 1].score).toBeGreaterThanOrEqual(result.hits[i].score);
    }
    expect(result.hits[0].citation).toBeTruthy();
    expect(result.hits[0].matchedTerms.length).toBeGreaterThan(0);
  });

  it("is deterministic across runs", () => {
    const a = indexSearchCorpus(built, "feline vaccine", 5);
    const b = indexSearchCorpus(built, "feline vaccine", 5);
    expect(a.hits.map((h) => [h.id, h.score])).toEqual(b.hits.map((h) => [h.id, h.score]));
    expect(a.candidates).toBe(b.candidates);
  });

  it("returns nothing for an out-of-vocabulary / empty query", () => {
    const index = buildInvertedIndex(built);
    expect(bm25Search(index, built, "zzzqqq xyzzy", 5)).toMatchObject({ candidates: 0, hits: [] });
    expect(bm25Search(index, built, "   ", 5).hits).toEqual([]);
  });
});

describe.sequential("corpus index router integration", () => {
  const restrictedSeed: CorpusSeed = {
    contentText: "Founder constitutional directive codenamed zeta governs restricted sovereignty escalations",
    type: "UNDERSTANDING",
    verification: "CONFIRMED",
    provenance: { type: "AUTHORED", citation: "ONX Constitution: Directive Zeta", sourceAuthority: "ONX Founder" },
    sources: 3,
    trust: 0.95,
    domainTag: "GOVERNANCE",
    accessTier: "RESTRICTED",
  };
  const withRestricted = buildCorpusObjects([...CURATED_VET_CORPUS, restrictedSeed]);

  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
  });

  it("iuc.corpusIndexSearch returns cited BM25 hits with a candidate count", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusIndexSearch({ query: "parvovirus", limit: 5 });
    expect(res.model).toBe("bm25");
    expect(res.returned).toBeGreaterThan(0);
    expect(res.candidates).toBeGreaterThan(0);
    expect(res.candidates).toBeLessThan(res.searched);
    expect(res.results.every((r) => r.citation)).toBe(true);
  });

  it("enforces clearance: restricted records are unreachable under PUBLIC", async () => {
    await replaceIurgObjects(withRestricted);
    const asPublic = await caller.iuc.corpusIndexSearch({ query: "zeta", clearance: "PUBLIC" });
    expect(asPublic.results.length).toBe(0);
    const asRestricted = await caller.iuc.corpusIndexSearch({ query: "zeta", clearance: "RESTRICTED" });
    expect(asRestricted.results.length).toBeGreaterThan(0);
    expect(asRestricted.results[0].citation).toMatch(/zeta/i);
  });

  it("iuc.corpusIndexStats reports measured index structure", async () => {
    await replaceIurgObjects(built);
    const stats = await caller.iuc.corpusIndexStats();
    expect(stats.docCount).toBe(built.length);
    expect(stats.termCount).toBeGreaterThan(50);
    expect(stats.avgDocLength).toBeGreaterThan(0);
  });
});

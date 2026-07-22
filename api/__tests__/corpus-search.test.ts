// ============================================================
// CORPUS SEARCH — STE-K-01 tests (deterministic BM25, zero LLM)
// Fixture-based proofs: relevance ordering, IDF rarity weighting,
// Arabic normalization, snippet highlighting, index invalidation
// after ingest, and edge cases (empty query / no results).
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";

// Enable the bridge so the ingest→invalidation proof can run;
// fail-closed rejection is covered in bridge-contract.test.ts.
import { vi } from "vitest";
vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      bridgeEnabled: true,
      bridgeSharedSecret: "test-bridge-secret",
    },
  };
});

import {
  buildBm25Index,
  searchBuiltIndex,
  tokenizeNormalize,
  searchCorpus,
  BM25_K1,
  BM25_B,
  type CorpusSearchDoc,
} from "../lib/corpus-search";
import { appRouter } from "../router";
import { __resetCorpusIngestMemoryForTests } from "../corpus-query-router";

const doc = (id: string, title: string, body: string, domain = "SCIENCE"): CorpusSearchDoc =>
  ({ id, domain, title, body });

describe("corpus search engine (STE-K-01)", () => {
  it("uses the canonical BM25 parameters", () => {
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
  });

  it("ranks a document matching two query terms above a one-term match", () => {
    const index = buildBm25Index([
      doc("d1", "entropy basics", "entropy explains disorder in systems"),
      doc("d2", "entropy and information", "entropy meets information theory here"),
      doc("d3", "unrelated", "gardening tips for spring flowers"),
    ]);
    const result = searchBuiltIndex(index, "entropy information");
    expect(result.engine).toBe("BM25");
    expect(result.totalMatches).toBe(2);
    expect(result.hits[0].id).toBe("d2"); // two matching terms
    expect(result.hits[1].id).toBe("d1"); // one matching term
    expect(result.hits[0].score).toBeGreaterThan(result.hits[1].score);
  });

  it("weights the rarer term higher (IDF): rare-term doc beats common-term doc", () => {
    // "common" appears in 4 docs, "quasar" in 1 → IDF(quasar) >> IDF(common).
    const corpus = [
      doc("c1", "a", "common words fill this text"),
      doc("c2", "b", "common phrasing again common"),
      doc("c3", "c", "another common entry"),
      doc("rare", "d", "a quasar shines far away"),
      doc("c4", "e", "yet more common filler common text"),
    ];
    const index = buildBm25Index(corpus);
    const result = searchBuiltIndex(index, "common quasar");
    expect(result.hits[0].id).toBe("rare");
  });

  it("normalizes Arabic: undiacritized query finds diacritized text with alef/yaa/taa variants", () => {
    expect(tokenizeNormalize("مَقَاصِدُ الشَّرِيعَةِ الإسلامى")).toEqual([
      "مقاصد",
      "الشريعه",
      "الاسلامي",
    ]);
    const index = buildBm25Index([
      doc("ar1", "أُصُولُ الْفِقْهِ", "بحثٌ في مَقَاصِدِ الشَّرِيعَةِ الْإِسْلَامِيَّةِ"),
      doc("ar2", "علم الفلك", "دراسة النجوم والمجرات"),
    ]);
    const result = searchBuiltIndex(index, "اصول مقاصد الشريعه");
    expect(result.totalMatches).toBe(1);
    expect(result.hits[0].id).toBe("ar1");
    expect(result.hits[0].snippet).toContain("«");
  });

  it("returns highlighted snippets and honors domain filter + limit/offset", () => {
    const corpus = [
      doc("s1", "solar power", "solar panels convert sunlight to power", "ENERGY"),
      doc("s2", "solar wind", "the solar wind streams from the sun", "SCIENCE"),
      doc("s3", "solar storage", "batteries store solar power overnight", "ENERGY"),
    ];
    const index = buildBm25Index(corpus);

    const energyOnly = searchBuiltIndex(index, "solar", { domain: "ENERGY" });
    expect(energyOnly.totalMatches).toBe(2);
    expect(energyOnly.hits.every((h) => h.domain === "ENERGY")).toBe(true);
    expect(energyOnly.hits[0].snippet).toContain("«solar»");
    expect(energyOnly.hits[0]).not.toHaveProperty("body");

    const paged = searchBuiltIndex(index, "solar", { limit: 1, offset: 1 });
    expect(paged.hits).toHaveLength(1);
    expect(paged.totalMatches).toBe(3);
    const all = searchBuiltIndex(index, "solar", { limit: 3 });
    expect(paged.hits[0].id).toBe(all.hits[1].id);
  });

  it("handles edge cases: empty query, punctuation-only query, no results", () => {
    const index = buildBm25Index([doc("d1", "title", "body text")]);
    expect(searchBuiltIndex(index, "").hits).toEqual([]);
    expect(searchBuiltIndex(index, "  !!! ").totalMatches).toBe(0);
    const miss = searchBuiltIndex(index, "zzzznotfound");
    expect(miss.totalMatches).toBe(0);
    expect(miss.hits).toEqual([]);
    expect(miss.indexedDocs).toBe(1);
  });

  describe("rankedSearch endpoint + index invalidation", () => {
    beforeEach(() => {
      __resetCorpusIngestMemoryForTests();
      delete process.env.DATABASE_URL;
    });

    it("rankedSearch is PUBLIC read — works with no bridge key", async () => {
      // STE-K-REAL: no templated seed — ingest a real SCIENCE unit first.
      const bridge = appRouter.createCaller({
        req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
      } as never);
      await bridge.corpusQuery.ingest({
        units: [{
          domain: "SCIENCE",
          title: "Entropy principles in closed systems",
          body: "Entropy principles describe the irreversible dispersal of energy in closed systems over time.",
          source: "ste-k-01-test",
        }],
      });
      const caller = appRouter.createCaller({ req: { headers: new Headers() } } as never);
      const result = await caller.corpusQuery.rankedSearch({
        query: "entropy principles",
        domain: "SCIENCE",
        limit: 5,
      });
      expect(result.access).toBe("PUBLIC_READ");
      expect(result.engine).toBe("BM25");
      expect(result.indexedDocs).toBeGreaterThanOrEqual(1);
      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.hits[0].domain).toBe("SCIENCE");
      expect(result.hits[0].snippet).toContain("«");
    });

    it("ingest invalidates the index: new unit is findable immediately after", async () => {
      const publicCaller = appRouter.createCaller({ req: { headers: new Headers() } } as never);
      const before = await publicCaller.corpusQuery.rankedSearch({ query: "xylographic manuscripts" });
      expect(before.totalMatches).toBe(0);

      const bridgeCaller = appRouter.createCaller({
        req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
      } as never);
      await bridgeCaller.corpusQuery.ingest({
        units: [{
          domain: "HISTORY",
          title: "Xylographic manuscripts of the archive",
          body: "A study of xylographic manuscripts recovered from the eastern archive.",
          source: "ste-k-01-test",
        }],
      });

      const after = await publicCaller.corpusQuery.rankedSearch({ query: "xylographic manuscripts" });
      expect(after.totalMatches).toBe(1);
      expect(after.hits[0].domain).toBe("HISTORY");
      expect(after.hits[0].snippet).toContain("«xylographic»");
      expect(after.indexedDocs).toBe(before.indexedDocs + 1);
    });
  });
});

// searchCorpus is exercised indirectly above via the router; keep a
// direct edge-case proof that an empty query never builds pressure.
describe("searchCorpus singleton", () => {
  it("returns an empty result shape for an empty query", async () => {
    const result = await searchCorpus("");
    expect(result.hits).toEqual([]);
    expect(result.engine).toBe("BM25");
  });
});

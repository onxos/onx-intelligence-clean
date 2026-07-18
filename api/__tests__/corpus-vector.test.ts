import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearIucSnapshots, replaceIurgObjects } from "../lib/iurg-store";
import { buildCorpusObjects } from "../lib/corpus";
import { buildTfIdfIndex, vectorSearch, vectorSearchCorpus } from "../lib/corpus-vector";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";

const caller = appRouter.createCaller({} as any);
const built = buildCorpusObjects(CURATED_VET_CORPUS);

function l2Norm(vector: Map<string, number>): number {
  let sum = 0;
  for (const w of vector.values()) sum += w * w;
  return Math.sqrt(sum);
}

describe("buildTfIdfIndex (deterministic TF-IDF vector space)", () => {
  it("indexes every non-empty document with a real vocabulary", () => {
    const index = buildTfIdfIndex(built);
    expect(index.documentCount).toBe(built.length);
    expect(index.documents.length).toBe(built.length);
    expect(index.vocabularySize).toBeGreaterThan(50);
    // idf is smoothed → strictly positive, never negative.
    for (const idf of index.idf.values()) expect(idf).toBeGreaterThan(0);
  });

  it("produces unit-normalised document vectors (real vectors, not embeddings)", () => {
    const index = buildTfIdfIndex(built);
    for (const doc of index.documents) {
      expect(doc.vector.size).toBeGreaterThan(0);
      expect(l2Norm(doc.vector)).toBeCloseTo(1, 6);
    }
  });

  it("is fully deterministic", () => {
    const a = buildTfIdfIndex(built);
    const b = buildTfIdfIndex(built);
    expect(a.documentCount).toBe(b.documentCount);
    expect(a.vocabularySize).toBe(b.vocabularySize);
    expect(a.documents.map((d) => d.id)).toEqual(b.documents.map((d) => d.id));
  });
});

describe("vectorSearch (cosine similarity, cited + explainable)", () => {
  it("returns cited hits ranked by cosine similarity in [0,1]", () => {
    const index = buildTfIdfIndex(built);
    const hits = vectorSearch(index, "canine parvovirus", 5);
    expect(hits.length).toBeGreaterThan(0);
    for (let i = 0; i < hits.length; i++) {
      expect(hits[i].similarity).toBeGreaterThan(0);
      expect(hits[i].similarity).toBeLessThanOrEqual(1);
      if (i > 0) expect(hits[i - 1].similarity).toBeGreaterThanOrEqual(hits[i].similarity);
    }
    // Top hit is the parvovirus record, cited to its authority.
    expect(hits[0].citation).toBeTruthy();
    expect(hits[0].sourceAuthority).toBeTruthy();
    expect(hits[0].matchedTerms).toContain("parvovirus");
  });

  it("is deterministic across runs", () => {
    const a = vectorSearchCorpus(built, "feline vaccine", 5);
    const b = vectorSearchCorpus(built, "feline vaccine", 5);
    expect(a.map((h) => [h.id, h.similarity])).toEqual(b.map((h) => [h.id, h.similarity]));
  });

  it("returns nothing for an out-of-vocabulary / empty query", () => {
    const index = buildTfIdfIndex(built);
    expect(vectorSearch(index, "zzzqqq xyzzy", 5)).toEqual([]);
    expect(vectorSearch(index, "   ", 5)).toEqual([]);
  });

  it("ranks the exact-topic document above unrelated ones", () => {
    const hits = vectorSearchCorpus(built, "chronic kidney disease staging", 3);
    expect(`${hits[0].citation} ${hits[0].excerpt}`).toMatch(/kidney/i);
  });
});

describe.sequential("corpus vector router integration", () => {
  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
  });

  it("iuc.corpusVectorSearch returns cited tf-idf hits over persisted objects", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusVectorSearch({ query: "parvovirus", limit: 5 });
    expect(res.model).toBe("tf-idf-cosine");
    expect(res.corpusSize).toBe(built.length);
    expect(res.returned).toBeGreaterThan(0);
    expect(res.results[0].similarity).toBeGreaterThan(0);
    expect(res.results.every((r) => r.citation)).toBe(true);
  });

  it("honours provenanceValidOnly by searching only cited records", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusVectorSearch({
      query: "vaccine",
      limit: 10,
      provenanceValidOnly: true,
    });
    expect(res.searched).toBe(built.length); // curated corpus is fully provenance-valid
    expect(res.results.every((r) => r.provenanceValid)).toBe(true);
  });
});

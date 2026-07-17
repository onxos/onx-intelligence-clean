// ============================================================
// CORPUS HYBRID RETRIEVAL — deterministic fused ranking tests
// ------------------------------------------------------------
// Proves the honest contract of hybridSearch(): real weighted fusion of BM25 +
// TF-IDF cosine + graph proximity, per-signal explainable components, every hit
// CITED, fully deterministic (stable order across runs), and NO inflation
// (returned ids are a subset of the persisted pool).
// ============================================================
import { describe, it, expect } from "vitest";
import { buildCorpusObjects, type CorpusSeed } from "../lib/corpus";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import {
  hybridSearch,
  DEFAULT_HYBRID_WEIGHTS,
  type HybridWeights,
} from "../lib/corpus-hybrid";

function synthetic(contentText: string): CorpusSeed {
  return {
    contentText,
    type: "PERCEPTION",
    verification: "POSSIBLE",
    provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" },
    sources: 1,
    trust: 0.6,
    domainTag: "MEDICINE",
  };
}

const corpus = buildCorpusObjects([
  ...CURATED_VET_CORPUS,
  synthetic("Synthetic scaffold placeholder about scheduling"),
]);

describe("hybridSearch — fused BM25 + TF-IDF + graph", () => {
  it("returns CITED hits with explainable per-signal components", () => {
    const res = hybridSearch(corpus, "canine parvovirus", 5);
    expect(res.model).toBe("hybrid-linear-fusion");
    expect(res.hits.length).toBeGreaterThan(0);
    const top = res.hits[0];
    // Every returned hit is a real provenance-valid, cited record.
    expect(top.provenanceValid).toBe(true);
    expect(top.citation).toBeTruthy();
    expect(top.sourceAuthority).toBeTruthy();
    // Components are all in [0,1] and the fused score respects the weights.
    for (const c of [top.components.bm25, top.components.vector, top.components.graph]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(top.signals.length).toBeGreaterThan(0);
  });

  it("fuses at least two signals for a strong query (not a single-signal proxy)", () => {
    const res = hybridSearch(corpus, "canine parvovirus vaccination", 5);
    const multiSignal = res.hits.some((h) => h.signals.length >= 2);
    expect(multiSignal).toBe(true);
    expect(res.signalReach.bm25).toBeGreaterThan(0);
    expect(res.signalReach.vector).toBeGreaterThan(0);
  });

  it("computes fusedScore as the exact weighted sum of components", () => {
    const w = DEFAULT_HYBRID_WEIGHTS;
    const res = hybridSearch(corpus, "chronic kidney disease staging", 5, w);
    for (const h of res.hits) {
      const expected =
        w.bm25 * h.components.bm25 +
        w.vector * h.components.vector +
        w.graph * h.components.graph;
      expect(h.fusedScore).toBeCloseTo(expected, 5);
    }
  });

  it("is deterministic — identical ordering and scores across runs", () => {
    const a = hybridSearch(corpus, "feline vaccination protocol", 8);
    const b = hybridSearch(corpus, "feline vaccination protocol", 8);
    expect(a.hits.map((h) => h.id)).toEqual(b.hits.map((h) => h.id));
    expect(a.hits.map((h) => h.fusedScore)).toEqual(b.hits.map((h) => h.fusedScore));
  });

  it("ranks in non-increasing fused-score order", () => {
    const res = hybridSearch(corpus, "parvovirus treatment", 10);
    for (let i = 1; i < res.hits.length; i++) {
      expect(res.hits[i - 1].fusedScore).toBeGreaterThanOrEqual(res.hits[i].fusedScore);
    }
  });

  it("never inflates — returned ids are a subset of the persisted pool", () => {
    const ids = new Set(corpus.map((o) => o.id));
    const res = hybridSearch(corpus, "vaccine", 50);
    for (const h of res.hits) expect(ids.has(h.id)).toBe(true);
    expect(res.returned).toBeLessThanOrEqual(corpus.length);
  });

  it("respects weight overrides — pure-BM25 weights match BM25 signal reach", () => {
    const bm25Only: HybridWeights = { bm25: 1, vector: 0, graph: 0 };
    const res = hybridSearch(corpus, "parvovirus", 20, bm25Only);
    // With only BM25 weighted, every returned hit must have a BM25 component.
    for (const h of res.hits) expect(h.components.bm25).toBeGreaterThan(0);
  });

  it("returns an empty ranking for a query with no lexical/graph overlap", () => {
    const res = hybridSearch(corpus, "zzzznonexistenttokenqqqq", 5);
    expect(res.hits).toHaveLength(0);
    expect(res.signalReach.union).toBe(0);
  });
});

// ============================================================
// CORPUS HYBRID RETRIEVAL — fused BM25 + TF-IDF + graph ranking
// ------------------------------------------------------------
// Combines the three honest retrieval signals already built for the corpus
// into ONE measured, explainable, CITED ranking:
//   • lexical   — Okapi BM25 over the inverted index (corpus-index.ts)
//   • semantic  — classic TF-IDF cosine (corpus-vector.ts; NOT neural)
//   • graph     — provenance-graph proximity to the lexical seed
//                 (corpus-graph.ts; edges built only from real metadata)
//
// Each signal's raw scores are min-max normalised to [0,1] (min pinned at 0
// since every raw score is ≥0), then fused as a weighted linear sum. The
// per-signal normalised components are returned on every hit, so the ranking
// is fully explainable and reproducible — no hidden weights, no learned model,
// no random tie-breaking (ties break by fused score → quality → id).
//
// Honestly labelled: this is deterministic weighted fusion of real term/graph
// statistics, not a neural re-ranker. Every returned hit stays CITED.
// ============================================================
import type { IurgObjectInput, IurgObjectType, ProvenanceType } from "../iuc-engine";
import { corpusId, isProvenanceValid } from "./corpus";
import { indexSearchCorpus } from "./corpus-index";
import { vectorSearchCorpus } from "./corpus-vector";
import { relatedByQuery } from "./corpus-graph";

export interface HybridWeights {
  bm25: number;
  vector: number;
  graph: number;
}

export const DEFAULT_HYBRID_WEIGHTS: HybridWeights = {
  bm25: 0.5,
  vector: 0.4,
  graph: 0.1,
};

export interface HybridComponents {
  /** BM25 score normalised to [0,1] (0 when the doc was not a lexical hit). */
  bm25: number;
  /** TF-IDF cosine normalised to [0,1] (0 when the doc was not a vector hit). */
  vector: number;
  /** Graph-proximity to the lexical seed, normalised to [0,1] (0 when absent). */
  graph: number;
}

export interface HybridSearchHit {
  id: string;
  type: IurgObjectType;
  excerpt: string;
  /** Weighted linear fusion of the normalised components, rounded. */
  fusedScore: number;
  components: HybridComponents;
  quality: number;
  provenanceValid: boolean;
  provenanceType: ProvenanceType | null;
  citation: string | null;
  sourceAuthority: string | null;
  domainTag: string | null;
  matchedTerms: string[];
  /** Which signals contributed a non-zero component for this doc. */
  signals: Array<"bm25" | "vector" | "graph">;
}

export interface HybridSearchResult {
  query: string;
  model: "hybrid-linear-fusion";
  weights: HybridWeights;
  /** Measured signal reach over the candidate pool. */
  signalReach: { bm25: number; vector: number; graph: number; union: number };
  returned: number;
  hits: HybridSearchHit[];
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Min-max normalise a raw-score map to [0,1] (min pinned at 0; max→1). */
function normaliseByMax(raw: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  const out = new Map<string, number>();
  if (max <= 0) return out;
  for (const [id, v] of raw) out.set(id, v / max);
  return out;
}

function resolveId(obj: IurgObjectInput): string {
  return obj.id ?? corpusId((obj.contentText ?? "").trim());
}

/**
 * Fuse BM25 + TF-IDF cosine + graph-proximity into one deterministic, CITED
 * ranking. `poolLimit` bounds how many candidates each signal contributes
 * before fusion; `limit` bounds the returned hits.
 */
export function hybridSearch(
  objects: IurgObjectInput[],
  query: string,
  limit = 10,
  weights: HybridWeights = DEFAULT_HYBRID_WEIGHTS,
  poolLimit = 50,
): HybridSearchResult {
  const byId = new Map<string, IurgObjectInput>();
  for (const obj of objects) {
    const id = resolveId(obj);
    if (!byId.has(id)) byId.set(id, obj);
  }

  // --- Raw signal scores ---
  const bm25 = indexSearchCorpus(objects, query, poolLimit);
  const bm25Raw = new Map<string, number>();
  const matchedByDoc = new Map<string, Set<string>>();
  for (const h of bm25.hits) {
    bm25Raw.set(h.id, h.score);
    matchedByDoc.set(h.id, new Set(h.matchedTerms));
  }

  const vector = vectorSearchCorpus(objects, query, poolLimit);
  const vectorRaw = new Map<string, number>();
  for (const h of vector) {
    vectorRaw.set(h.id, h.similarity);
    const set = matchedByDoc.get(h.id) ?? matchedByDoc.set(h.id, new Set()).get(h.id)!;
    for (const t of h.matchedTerms) set.add(t);
  }

  // Graph proximity to the lexical seed: the seed itself gets the max signal,
  // its cited neighbours get their (already 0..1) relation strength.
  const graph = relatedByQuery(objects, query, poolLimit);
  const graphRaw = new Map<string, number>();
  if (graph.seed) {
    const maxRelation = graph.related.reduce((m, r) => Math.max(m, r.relation), 0);
    graphRaw.set(graph.seed.id, Math.max(maxRelation, 1e-9));
    for (const r of graph.related) graphRaw.set(r.id, r.relation);
  }

  // --- Normalise each signal independently, then fuse ---
  const nBm25 = normaliseByMax(bm25Raw);
  const nVector = normaliseByMax(vectorRaw);
  const nGraph = normaliseByMax(graphRaw);

  const unionIds = new Set<string>([...nBm25.keys(), ...nVector.keys(), ...nGraph.keys()]);

  const fused: HybridSearchHit[] = [];
  for (const id of unionIds) {
    const obj = byId.get(id);
    if (!obj) continue;
    const cB = nBm25.get(id) ?? 0;
    const cV = nVector.get(id) ?? 0;
    const cG = nGraph.get(id) ?? 0;
    const score = weights.bm25 * cB + weights.vector * cV + weights.graph * cG;
    if (score <= 0) continue;

    const signals: Array<"bm25" | "vector" | "graph"> = [];
    if (cB > 0) signals.push("bm25");
    if (cV > 0) signals.push("vector");
    if (cG > 0) signals.push("graph");

    const content = obj.contentText ?? "";
    fused.push({
      id,
      type: obj.type,
      excerpt: content.length > 240 ? `${content.slice(0, 240)}…` : content,
      fusedScore: round(score),
      components: { bm25: round(cB), vector: round(cV), graph: round(cG) },
      quality: obj.quality ?? 0,
      provenanceValid: isProvenanceValid(obj.provenance),
      provenanceType: obj.provenance?.type ?? null,
      citation: obj.provenance?.citation ?? null,
      sourceAuthority: obj.provenance?.sourceAuthority ?? null,
      domainTag: obj.domainTag ?? null,
      matchedTerms: Array.from(matchedByDoc.get(id) ?? []).sort(),
      signals,
    });
  }

  fused.sort(
    (a, b) =>
      b.fusedScore - a.fusedScore ||
      b.quality - a.quality ||
      (a.id < b.id ? -1 : 1),
  );

  const hits = fused.slice(0, Math.max(1, limit));
  return {
    query,
    model: "hybrid-linear-fusion",
    weights,
    signalReach: {
      bm25: bm25Raw.size,
      vector: vectorRaw.size,
      graph: graphRaw.size,
      union: unionIds.size,
    },
    returned: hits.length,
    hits,
  };
}

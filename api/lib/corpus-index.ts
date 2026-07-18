// ============================================================
// CORPUS INVERTED INDEX — term->postings index + BM25 retrieval
// ------------------------------------------------------------
// Honest indexing structure for scalable retrieval: a classic inverted index
// (term -> postings list of {docId, termFrequency}) plus Okapi BM25 ranking.
//   - Real IR data structure, deterministic, no fabricated data.
//   - Retrieval touches ONLY documents that contain a query term (gathered from
//     the postings), instead of scanning the whole corpus — the point of an
//     index. Candidate count is reported so the efficiency gain is measurable.
//   - Ranking is standard Okapi BM25 (k1=1.5, b=0.75) with a non-negative idf.
//   - Hits stay CITED (citation + source authority) and explainable
//     (matchedTerms), so indexed retrieval remains verifiable.
// Pure & DB-free → fully unit-testable.
// ============================================================
import { corpusId, isProvenanceValid, lexicalTokens } from "./corpus";
import type { IurgObjectInput, IurgObjectType, ProvenanceType } from "../iuc-engine";

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface Posting {
  id: string;
  tf: number;
}

export interface InvertedIndex {
  /** term -> postings (sorted by doc id for determinism). */
  postings: Map<string, Posting[]>;
  df: Map<string, number>;
  docLengths: Map<string, number>;
  docCount: number;
  avgDocLength: number;
  termCount: number;
}

/** Build a deterministic inverted index over the corpus. */
export function buildInvertedIndex(objects: IurgObjectInput[]): InvertedIndex {
  const postings = new Map<string, Posting[]>();
  const df = new Map<string, number>();
  const docLengths = new Map<string, number>();
  let totalLength = 0;
  let docCount = 0;

  for (const obj of objects) {
    const content = (obj.contentText ?? "").trim();
    if (!content) continue;
    const id = obj.id ?? corpusId(content);
    const tokens = lexicalTokens(content);
    if (tokens.length === 0) continue;

    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);

    for (const [term, freq] of tf) {
      (postings.get(term) ?? postings.set(term, []).get(term)!).push({ id, tf: freq });
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    docLengths.set(id, tokens.length);
    totalLength += tokens.length;
    docCount += 1;
  }

  for (const list of postings.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    postings,
    df,
    docLengths,
    docCount,
    avgDocLength: docCount > 0 ? totalLength / docCount : 0,
    termCount: postings.size,
  };
}

/** Postings for a term (empty when absent). */
export function indexLookup(index: InvertedIndex, term: string): Posting[] {
  return index.postings.get(term) ?? [];
}

export interface IndexStats {
  docCount: number;
  termCount: number;
  avgDocLength: number;
  postingsCount: number;
  topTerms: Array<{ term: string; df: number }>;
}

/** Measured index stats (honest, no inflation). */
export function indexStats(index: InvertedIndex): IndexStats {
  let postingsCount = 0;
  for (const list of index.postings.values()) postingsCount += list.length;
  const topTerms = Array.from(index.df.entries())
    .map(([term, df]) => ({ term, df }))
    .sort((a, b) => b.df - a.df || (a.term < b.term ? -1 : 1))
    .slice(0, 10);
  return {
    docCount: index.docCount,
    termCount: index.termCount,
    avgDocLength: round(index.avgDocLength, 2),
    postingsCount,
    topTerms,
  };
}

export interface IndexSearchHit {
  id: string;
  type: IurgObjectType;
  excerpt: string;
  score: number;
  quality: number;
  provenanceValid: boolean;
  provenanceType: ProvenanceType | null;
  citation: string | null;
  sourceAuthority: string | null;
  domainTag: string | null;
  matchedTerms: string[];
}

export interface IndexSearchResult {
  query: string;
  /** Documents actually examined (union of postings for query terms). */
  candidates: number;
  hits: IndexSearchHit[];
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** BM25 idf — non-negative variant: ln(1 + (N - df + 0.5) / (df + 0.5)). */
function bm25Idf(docCount: number, df: number): number {
  return Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
}

/**
 * Okapi BM25 retrieval over the inverted index. Only documents containing a
 * query term are scored (gathered from postings), and the examined-candidate
 * count is returned so the index's selectivity is measurable. Hits are CITED.
 */
export function bm25Search(
  index: InvertedIndex,
  objects: IurgObjectInput[],
  query: string,
  limit = 10,
): IndexSearchResult {
  const queryTerms = Array.from(new Set(lexicalTokens(query))).filter((t) => index.postings.has(t));
  if (queryTerms.length === 0) return { query, candidates: 0, hits: [] };

  const byId = new Map<string, IurgObjectInput>();
  for (const obj of objects) {
    const id = obj.id ?? corpusId((obj.contentText ?? "").trim());
    if (!byId.has(id)) byId.set(id, obj);
  }

  const scores = new Map<string, number>();
  const matched = new Map<string, Set<string>>();

  for (const term of queryTerms) {
    const idf = bm25Idf(index.docCount, index.df.get(term) ?? 0);
    for (const { id, tf } of index.postings.get(term)!) {
      const docLen = index.docLengths.get(id) ?? 0;
      const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * docLen) / (index.avgDocLength || 1));
      const contribution = idf * ((tf * (BM25_K1 + 1)) / (denom || 1));
      scores.set(id, (scores.get(id) ?? 0) + contribution);
      (matched.get(id) ?? matched.set(id, new Set()).get(id)!).add(term);
    }
  }

  const hits = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, Math.max(1, limit))
    .map(([id, score]) => {
      const obj = byId.get(id)!;
      const content = obj.contentText ?? "";
      return {
        id,
        type: obj.type,
        excerpt: content.length > 240 ? `${content.slice(0, 240)}…` : content,
        score: round(score),
        quality: obj.quality ?? 0,
        provenanceValid: isProvenanceValid(obj.provenance),
        provenanceType: obj.provenance?.type ?? null,
        citation: obj.provenance?.citation ?? null,
        sourceAuthority: obj.provenance?.sourceAuthority ?? null,
        domainTag: obj.domainTag ?? null,
        matchedTerms: Array.from(matched.get(id) ?? []).sort(),
      };
    });

  return { query, candidates: scores.size, hits };
}

/** Convenience: build the index and BM25-search in one call. */
export function indexSearchCorpus(
  objects: IurgObjectInput[],
  query: string,
  limit = 10,
): IndexSearchResult {
  return bm25Search(buildInvertedIndex(objects), objects, query, limit);
}

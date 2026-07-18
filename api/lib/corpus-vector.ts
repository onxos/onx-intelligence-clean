// ============================================================
// CORPUS VECTOR — TF-IDF lexical vector-space retrieval
// ------------------------------------------------------------
// The "vector" half of vector+graph retrieval, implemented HONESTLY as the
// classic IR vector-space model (Salton TF-IDF + cosine similarity):
//   - NOT neural embeddings. No fabricated float vectors, no external model,
//     no randomness. Every dimension is a real corpus term with a real weight.
//   - tf: sublinear 1 + ln(count); idf: smoothed ln((N+1)/(df+1)) + 1.
//   - Documents are unit-normalised sparse TF-IDF vectors; ranking is exact
//     cosine similarity between the query vector and each document vector.
//   - Results stay CITED (each hit carries its citation + source authority) and
//     explainable (matchedTerms), so retrieval is verifiable, not opaque.
// Pure, deterministic & DB-free → fully unit-testable.
// ============================================================
import { corpusId, isProvenanceValid, lexicalTokens } from "./corpus";
import type { IurgObjectInput, IurgObjectType, ProvenanceType } from "../iuc-engine";

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Raw term-frequency map for one document (term -> count). */
function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
}

interface IndexedDocument {
  id: string;
  obj: IurgObjectInput;
  /** Unit-normalised sparse TF-IDF weights (term -> weight, ||v|| = 1). */
  vector: Map<string, number>;
}

export interface TfIdfIndex {
  documents: IndexedDocument[];
  idf: Map<string, number>;
  documentCount: number;
  vocabularySize: number;
}

/**
 * Build a deterministic TF-IDF index over the corpus. Documents with no
 * significant terms are skipped (they cannot be represented in the vector
 * space). Reseeding is idempotent because everything derives from content.
 */
export function buildTfIdfIndex(objects: IurgObjectInput[]): TfIdfIndex {
  const docTokens: Array<{ id: string; obj: IurgObjectInput; tf: Map<string, number> }> = [];
  const df = new Map<string, number>();

  for (const obj of objects) {
    const content = (obj.contentText ?? "").trim();
    if (!content) continue;
    const tokens = lexicalTokens(content);
    if (tokens.length === 0) continue;
    const tf = termFrequencies(tokens);
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    docTokens.push({ id: obj.id ?? corpusId(content), obj, tf });
  }

  const documentCount = docTokens.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    // Smoothed idf (never negative): ln((N + 1) / (df + 1)) + 1.
    idf.set(term, Math.log((documentCount + 1) / (count + 1)) + 1);
  }

  const documents: IndexedDocument[] = docTokens.map(({ id, obj, tf }) => {
    const weights = new Map<string, number>();
    let sumSquares = 0;
    for (const [term, count] of tf) {
      const weight = (1 + Math.log(count)) * (idf.get(term) ?? 0);
      if (weight <= 0) continue;
      weights.set(term, weight);
      sumSquares += weight * weight;
    }
    const norm = Math.sqrt(sumSquares) || 1;
    const vector = new Map<string, number>();
    for (const [term, weight] of weights) vector.set(term, weight / norm);
    return { id, obj, vector };
  });

  return { documents, idf, documentCount, vocabularySize: idf.size };
}

/** Unit-normalised TF-IDF query vector in the index's term space. */
function queryVector(index: TfIdfIndex, query: string): Map<string, number> {
  const tf = termFrequencies(lexicalTokens(query));
  const weights = new Map<string, number>();
  let sumSquares = 0;
  for (const [term, count] of tf) {
    const idf = index.idf.get(term);
    if (idf === undefined) continue; // out-of-vocabulary term contributes nothing
    const weight = (1 + Math.log(count)) * idf;
    if (weight <= 0) continue;
    weights.set(term, weight);
    sumSquares += weight * weight;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  const vector = new Map<string, number>();
  for (const [term, weight] of weights) vector.set(term, weight / norm);
  return vector;
}

export interface VectorSearchHit {
  id: string;
  type: IurgObjectType;
  excerpt: string;
  /** Cosine similarity in [0,1] between the query and document TF-IDF vectors. */
  similarity: number;
  quality: number;
  provenanceValid: boolean;
  provenanceType: ProvenanceType | null;
  citation: string | null;
  sourceAuthority: string | null;
  domainTag: string | null;
  matchedTerms: string[];
}

/**
 * Rank corpus documents by exact cosine similarity to the query in the TF-IDF
 * vector space. Ties break by quality then id → fully deterministic. Zero-
 * similarity documents are excluded. Each hit stays CITED and explainable.
 */
export function vectorSearch(index: TfIdfIndex, query: string, limit = 10): VectorSearchHit[] {
  const qVector = queryVector(index, query);
  if (qVector.size === 0) return [];

  const scored = index.documents.map((doc) => {
    // Cosine similarity = dot product of two unit vectors. Iterate the smaller.
    const [small, large] = qVector.size <= doc.vector.size ? [qVector, doc.vector] : [doc.vector, qVector];
    let dot = 0;
    const matched: string[] = [];
    for (const [term, weight] of small) {
      const other = large.get(term);
      if (other === undefined) continue;
      dot += weight * other;
      if (qVector.has(term) && doc.vector.has(term)) matched.push(term);
    }
    return { doc, similarity: dot, matched };
  });

  return scored
    .filter((entry) => entry.similarity > 0)
    .sort((a, b) =>
      b.similarity - a.similarity ||
      (b.doc.obj.quality ?? 0) - (a.doc.obj.quality ?? 0) ||
      (a.doc.id < b.doc.id ? -1 : 1),
    )
    .slice(0, Math.max(1, limit))
    .map(({ doc, similarity, matched }) => {
      const content = doc.obj.contentText ?? "";
      return {
        id: doc.id,
        type: doc.obj.type,
        excerpt: content.length > 240 ? `${content.slice(0, 240)}…` : content,
        similarity: round(similarity),
        quality: doc.obj.quality ?? 0,
        provenanceValid: isProvenanceValid(doc.obj.provenance),
        provenanceType: doc.obj.provenance?.type ?? null,
        citation: doc.obj.provenance?.citation ?? null,
        sourceAuthority: doc.obj.provenance?.sourceAuthority ?? null,
        domainTag: doc.obj.domainTag ?? null,
        matchedTerms: matched.sort(),
      };
    });
}

/** Convenience: build the index and search in one call (for one-off queries). */
export function vectorSearchCorpus(
  objects: IurgObjectInput[],
  query: string,
  limit = 10,
): VectorSearchHit[] {
  return vectorSearch(buildTfIdfIndex(objects), query, limit);
}

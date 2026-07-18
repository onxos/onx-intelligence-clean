// ============================================================
// CORPUS SEARCH — STE-K-01 "Deterministic ranked retrieval"
// Pure BM25 (k1=1.2, b=0.75) over the corpus stores (in-memory
// knowledge store + ingested units + postgres corpus). Zero LLM,
// zero external calls — fully deterministic (D-19 envelope).
//
// Arabic-aware normalization: strips diacritics/tatweel, unifies
// alef forms (أإآٱ→ا), alef maqsura (ى→ي) and taa marbuta (ة→ه).
// English: lowercase + unicode word boundaries.
//
// The inverted index is built lazily on first search from the
// registered document sources and invalidated whenever a source
// mutates (ingest / add).
// ============================================================

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export interface CorpusSearchDoc {
  id: string;
  domain: string;
  title: string;
  body: string;
}

export interface CorpusSearchHit {
  id: string;
  domain: string;
  title: string;
  score: number;
  snippet: string;
}

export interface CorpusSearchOptions {
  domain?: string;
  limit?: number;
  offset?: number;
}

export interface CorpusSearchResult {
  engine: "BM25";
  k1: number;
  b: number;
  indexedDocs: number;
  totalMatches: number;
  hits: CorpusSearchHit[];
}

// Token = letters/digits plus Arabic combining marks (kept inside
// the token so diacritics never split a word, then stripped).
const TOKEN_RE = /[\p{L}\p{N}\p{M}\u0640]+/gu;

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\p{M}/gu, "") // Arabic diacritics / combining marks (incl. superscript alef)
    .replace(/\u0640/g, "") // tatweel
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627") // أ إ آ ٱ → ا
    .replace(/\u0649/g, "\u064A") // ى → ي
    .replace(/\u0629/g, "\u0647"); // ة → ه
}

export function tokenizeNormalize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const normalized = normalizeToken(match[0]);
    if (normalized.length > 0) tokens.push(normalized);
  }
  return tokens;
}

// --- Inverted index -----------------------------------------

interface IndexedDoc {
  doc: CorpusSearchDoc;
  length: number; // real token count of title+body
}

export interface Bm25Index {
  docs: IndexedDoc[];
  postings: Map<string, Map<number, number>>; // term → docIdx → tf
  avgDocLength: number;
}

export function buildBm25Index(docs: CorpusSearchDoc[]): Bm25Index {
  const indexed: IndexedDoc[] = [];
  const postings = new Map<string, Map<number, number>>();
  let totalLength = 0;

  docs.forEach((doc, docIdx) => {
    const tokens = tokenizeNormalize(`${doc.title}\n${doc.body}`);
    indexed.push({ doc, length: tokens.length });
    totalLength += tokens.length;
    for (const term of tokens) {
      let perDoc = postings.get(term);
      if (!perDoc) {
        perDoc = new Map();
        postings.set(term, perDoc);
      }
      perDoc.set(docIdx, (perDoc.get(docIdx) ?? 0) + 1);
    }
  });

  return {
    docs: indexed,
    postings,
    avgDocLength: indexed.length > 0 ? totalLength / indexed.length : 0,
  };
}

// --- Snippet with match highlighting ------------------------

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 120;

function buildSnippet(text: string, terms: Set<string>): string | null {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    if (terms.has(normalizeToken(match[0]))) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  if (ranges.length === 0) return null;

  const first = ranges[0];
  const windowStart = Math.max(0, first.start - SNIPPET_BEFORE);
  const windowEnd = Math.min(text.length, first.start + SNIPPET_AFTER);
  const inWindow = ranges.filter((r) => r.start >= windowStart && r.end <= windowEnd);

  // Mark matches with «…» guillemets, assembling left-to-right.
  let snippet = windowStart > 0 ? "…" : "";
  let cursor = windowStart;
  for (const r of inWindow) {
    snippet += text.slice(cursor, r.start) + "«" + text.slice(r.start, r.end) + "»";
    cursor = r.end;
  }
  snippet += text.slice(cursor, windowEnd);
  if (windowEnd < text.length) snippet += "…";
  return snippet;
}

// --- BM25 scoring over a built index ------------------------

export function searchBuiltIndex(
  index: Bm25Index,
  query: string,
  options: CorpusSearchOptions = {},
): CorpusSearchResult {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const queryTerms = Array.from(new Set(tokenizeNormalize(query)));
  const base: CorpusSearchResult = {
    engine: "BM25",
    k1: BM25_K1,
    b: BM25_B,
    indexedDocs: index.docs.length,
    totalMatches: 0,
    hits: [],
  };
  if (queryTerms.length === 0 || index.docs.length === 0) return base;

  const n = index.docs.length;
  const scores = new Map<number, number>();
  for (const term of queryTerms) {
    const perDoc = index.postings.get(term);
    if (!perDoc) continue;
    const df = perDoc.size;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (const [docIdx, tf] of perDoc) {
      const { doc, length } = index.docs[docIdx];
      if (options.domain && doc.domain !== options.domain) continue;
      const denom =
        tf + BM25_K1 * (1 - BM25_B + (BM25_B * length) / (index.avgDocLength || 1));
      const contribution = idf * ((tf * (BM25_K1 + 1)) / denom);
      scores.set(docIdx, (scores.get(docIdx) ?? 0) + contribution);
    }
  }

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || (index.docs[a[0]].doc.id < index.docs[b[0]].doc.id ? -1 : 1))
    .slice(offset, offset + limit);

  const termSet = new Set(queryTerms);
  const hits: CorpusSearchHit[] = ranked.map(([docIdx, score]) => {
    const { doc } = index.docs[docIdx];
    const snippet =
      buildSnippet(doc.body, termSet) ??
      buildSnippet(doc.title, termSet) ??
      doc.body.slice(0, SNIPPET_AFTER);
    return {
      id: doc.id,
      domain: doc.domain,
      title: doc.title,
      score: Math.round(score * 10000) / 10000,
      snippet,
    };
  });

  return { ...base, totalMatches: scores.size, hits };
}

// --- Lazy singleton index over registered sources ------------

export type CorpusDocLoader = () => Promise<CorpusSearchDoc[]> | CorpusSearchDoc[];

const sources = new Map<string, CorpusDocLoader>();
let cachedIndex: Bm25Index | null = null;

// STE-K-10: downstream caches (e.g. the corpus content manifest /
// disclosure) derive from the exact same sources as the search
// index. They subscribe here so a single ingest/add invalidates
// BOTH the index AND every derived-truth cache — no stale DEMO/REAL
// disclosure can survive a corpus mutation.
const invalidationListeners: Array<() => void> = [];

export function onCorpusInvalidated(fn: () => void): void {
  invalidationListeners.push(fn);
}

function fireInvalidation(): void {
  for (const fn of invalidationListeners) fn();
}

export function registerCorpusSource(name: string, loader: CorpusDocLoader): void {
  sources.set(name, loader);
  cachedIndex = null;
  fireInvalidation();
}

// Called on every mutation of any source (ingest / knowledge.add)
// so the next search rebuilds against the true current corpus.
export function invalidateCorpusSearchIndex(): void {
  cachedIndex = null;
  fireInvalidation();
}

export function isCorpusSearchIndexBuilt(): boolean {
  return cachedIndex !== null;
}

// STE-K-10: materialize every registered source's documents (the
// exact set the BM25 index is built from). Used by the corpus
// content manifest + verify:corpus gate. Deterministic given a
// fixed corpus (order follows source registration + loader order).
export async function collectCorpusDocs(): Promise<CorpusSearchDoc[]> {
  const all: CorpusSearchDoc[] = [];
  for (const loader of sources.values()) {
    all.push(...(await loader()));
  }
  return all;
}

export async function searchCorpus(
  query: string,
  options: CorpusSearchOptions = {},
): Promise<CorpusSearchResult> {
  if (!cachedIndex) {
    cachedIndex = buildBm25Index(await collectCorpusDocs());
  }
  return searchBuiltIndex(cachedIndex, query, options);
}

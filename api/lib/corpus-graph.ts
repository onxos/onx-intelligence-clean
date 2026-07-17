// ============================================================
// CORPUS GRAPH — deterministic knowledge graph + graph-augmented retrieval
// ------------------------------------------------------------
// The "graph" half of vector+graph retrieval, built ONLY from real provenance
// metadata (no fabricated embeddings, no randomness):
//   Nodes: record | authority (provenance.sourceAuthority) | domain (domainTag)
//   Edges: CITES_AUTHORITY (record→authority), IN_DOMAIN (record→domain),
//          SHARES_AUTHORITY (record↔record, same cited authority),
//          SHARES_TERM (record↔record, ≥2 shared significant terms, weight=#shared)
// relatedRecords()/relatedByQuery() traverse the graph to return CITED neighbours
// ranked by edge weight + neighbour quality — verifiable, provenance-aware.
// Fully deterministic & DB-free → unit-testable.
// ============================================================
import { isProvenanceValid, searchCorpus, significantTerms } from "./corpus";
import type { IurgObjectInput, IurgObjectType, ProvenanceType } from "../iuc-engine";

export type CorpusNodeKind = "record" | "authority" | "domain";

export interface CorpusGraphNode {
  id: string;
  kind: CorpusNodeKind;
  label: string;
  type?: IurgObjectType;
  provenanceType?: ProvenanceType | null;
  provenanceValid?: boolean;
  quality?: number;
}

export type CorpusEdgeType = "CITES_AUTHORITY" | "IN_DOMAIN" | "SHARES_AUTHORITY" | "SHARES_TERM";

export interface CorpusGraphEdge {
  from: string;
  to: string;
  type: CorpusEdgeType;
  weight: number;
}

export interface CorpusGraphStats {
  recordNodes: number;
  authorityNodes: number;
  domainNodes: number;
  edges: number;
  byEdgeType: Record<CorpusEdgeType, number>;
  topAuthorities: Array<{ authority: string; records: number }>;
  topDomains: Array<{ domain: string; records: number }>;
}

export interface CorpusGraph {
  nodes: CorpusGraphNode[];
  edges: CorpusGraphEdge[];
  stats: CorpusGraphStats;
}

const AUTHORITY_PREFIX = "authority:";
const DOMAIN_PREFIX = "domain:";
const MIN_SHARED_TERMS = 2;

interface BuildOptions {
  /** Cap SHARES_TERM edges to keep the graph bounded on large corpora. */
  maxTermEdges?: number;
}

function recordEntries(objects: IurgObjectInput[]): Array<{ id: string; obj: IurgObjectInput }> {
  const entries: Array<{ id: string; obj: IurgObjectInput }> = [];
  for (const obj of objects) {
    if (!obj.id || !(obj.contentText ?? "").trim()) continue;
    entries.push({ id: obj.id, obj });
  }
  return entries;
}

/** Build the deterministic corpus knowledge graph from real provenance metadata. */
export function buildCorpusGraph(objects: IurgObjectInput[], opts: BuildOptions = {}): CorpusGraph {
  const maxTermEdges = opts.maxTermEdges ?? 5000;
  const entries = recordEntries(objects);

  const nodes = new Map<string, CorpusGraphNode>();
  const edges: CorpusGraphEdge[] = [];
  const byEdgeType: Record<CorpusEdgeType, number> = {
    CITES_AUTHORITY: 0, IN_DOMAIN: 0, SHARES_AUTHORITY: 0, SHARES_TERM: 0,
  };

  const authorityToRecords = new Map<string, string[]>();
  const domainToRecords = new Map<string, string[]>();
  const termToRecords = new Map<string, string[]>();

  const addEdge = (from: string, to: string, type: CorpusEdgeType, weight: number) => {
    edges.push({ from, to, type, weight });
    byEdgeType[type] += 1;
  };

  for (const { id, obj } of entries) {
    nodes.set(id, {
      id,
      kind: "record",
      label: (obj.contentText ?? "").slice(0, 80),
      type: obj.type,
      provenanceType: obj.provenance?.type ?? null,
      provenanceValid: isProvenanceValid(obj.provenance),
      quality: obj.quality ?? 0,
    });

    const authority = obj.provenance && obj.provenance.type !== "SYNTHETIC"
      ? obj.provenance.sourceAuthority.trim()
      : "";
    if (authority) {
      const authorityId = `${AUTHORITY_PREFIX}${authority}`;
      if (!nodes.has(authorityId)) nodes.set(authorityId, { id: authorityId, kind: "authority", label: authority });
      addEdge(id, authorityId, "CITES_AUTHORITY", 1);
      (authorityToRecords.get(authority) ?? authorityToRecords.set(authority, []).get(authority)!).push(id);
    }

    const domain = (obj.domainTag ?? "").trim();
    if (domain) {
      const domainId = `${DOMAIN_PREFIX}${domain}`;
      if (!nodes.has(domainId)) nodes.set(domainId, { id: domainId, kind: "domain", label: domain });
      addEdge(id, domainId, "IN_DOMAIN", 1);
      (domainToRecords.get(domain) ?? domainToRecords.set(domain, []).get(domain)!).push(id);
    }

    for (const term of significantTerms(obj.contentText ?? "")) {
      (termToRecords.get(term) ?? termToRecords.set(term, []).get(term)!).push(id);
    }
  }

  // SHARES_AUTHORITY — connect records citing the same authority (undirected, id-ordered).
  for (const records of authorityToRecords.values()) {
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        addEdge(records[i], records[j], "SHARES_AUTHORITY", 1);
      }
    }
  }

  // SHARES_TERM — connect records sharing >= MIN_SHARED_TERMS significant terms.
  const sharedCount = new Map<string, number>();
  for (const records of termToRecords.values()) {
    if (records.length < 2) continue;
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i];
        const b = records[j];
        const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
        sharedCount.set(key, (sharedCount.get(key) ?? 0) + 1);
      }
    }
  }
  const termPairs = Array.from(sharedCount.entries())
    .filter(([, count]) => count >= MIN_SHARED_TERMS)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, maxTermEdges);
  for (const [key, count] of termPairs) {
    const [from, to] = key.split("\u0000");
    addEdge(from, to, "SHARES_TERM", count);
  }

  const topAuthorities = Array.from(authorityToRecords.entries())
    .map(([authority, records]) => ({ authority, records: records.length }))
    .sort((a, b) => b.records - a.records || (a.authority < b.authority ? -1 : 1))
    .slice(0, 10);
  const topDomains = Array.from(domainToRecords.entries())
    .map(([domain, records]) => ({ domain, records: records.length }))
    .sort((a, b) => b.records - a.records || (a.domain < b.domain ? -1 : 1))
    .slice(0, 10);

  const nodeList = Array.from(nodes.values());
  return {
    nodes: nodeList,
    edges,
    stats: {
      recordNodes: nodeList.filter((n) => n.kind === "record").length,
      authorityNodes: nodeList.filter((n) => n.kind === "authority").length,
      domainNodes: nodeList.filter((n) => n.kind === "domain").length,
      edges: edges.length,
      byEdgeType,
      topAuthorities,
      topDomains,
    },
  };
}

export interface RelatedRecord {
  id: string;
  type: IurgObjectType;
  excerpt: string;
  relation: number;
  quality: number;
  provenanceValid: boolean;
  sharedAuthority: boolean;
  sharedDomain: boolean;
  sharedTerms: number;
  citation: string | null;
  sourceAuthority: string | null;
}

const RELATION_WEIGHT: Record<CorpusEdgeType, number> = {
  SHARES_AUTHORITY: 6, SHARES_TERM: 3, IN_DOMAIN: 1, CITES_AUTHORITY: 0,
};

/**
 * Graph-augmented retrieval: return records connected to `recordId` in the
 * corpus graph, ranked by summed edge weight + neighbour quality. Each neighbour
 * carries its citation, so graph traversal stays verifiable (cited).
 */
export function relatedRecords(
  objects: IurgObjectInput[],
  recordId: string,
  limit = 5,
): RelatedRecord[] {
  const byId = new Map(objects.filter((o) => o.id).map((o) => [o.id as string, o]));
  const seed = byId.get(recordId);
  if (!seed) return [];

  const graph = buildCorpusGraph(objects);
  const seedAuthority = seed.provenance && seed.provenance.type !== "SYNTHETIC" ? seed.provenance.sourceAuthority.trim() : "";
  const seedDomain = (seed.domainTag ?? "").trim();

  interface Acc { relation: number; sharedAuthority: boolean; sharedDomain: boolean; sharedTerms: number; }
  const acc = new Map<string, Acc>();
  const bump = (other: string, add: number, patch: Partial<Acc>) => {
    const cur = acc.get(other) ?? { relation: 0, sharedAuthority: false, sharedDomain: false, sharedTerms: 0 };
    cur.relation += add;
    if (patch.sharedAuthority) cur.sharedAuthority = true;
    if (patch.sharedDomain) cur.sharedDomain = true;
    if (patch.sharedTerms) cur.sharedTerms = Math.max(cur.sharedTerms, patch.sharedTerms);
    acc.set(other, cur);
  };

  for (const edge of graph.edges) {
    let other: string | null = null;
    if (edge.from === recordId) other = edge.to;
    else if (edge.to === recordId) other = edge.from;
    if (!other || other.startsWith(AUTHORITY_PREFIX) || other.startsWith(DOMAIN_PREFIX)) continue;
    if (edge.type === "SHARES_AUTHORITY") bump(other, RELATION_WEIGHT.SHARES_AUTHORITY, { sharedAuthority: true });
    else if (edge.type === "SHARES_TERM") bump(other, RELATION_WEIGHT.SHARES_TERM * edge.weight, { sharedTerms: edge.weight });
  }

  // Domain relation isn't a record↔record edge; add it from seed metadata.
  if (seedDomain) {
    for (const obj of objects) {
      if (!obj.id || obj.id === recordId) continue;
      if ((obj.domainTag ?? "").trim() === seedDomain) bump(obj.id, RELATION_WEIGHT.IN_DOMAIN, { sharedDomain: true });
    }
  }

  return Array.from(acc.entries())
    .map(([id, a]) => {
      const obj = byId.get(id)!;
      const content = obj.contentText ?? "";
      const authority = obj.provenance?.sourceAuthority?.trim() ?? "";
      return {
        id,
        type: obj.type,
        excerpt: content.length > 200 ? `${content.slice(0, 200)}…` : content,
        relation: Math.round((a.relation + (obj.quality ?? 0) * 4) * 100) / 100,
        quality: obj.quality ?? 0,
        provenanceValid: isProvenanceValid(obj.provenance),
        sharedAuthority: a.sharedAuthority || (!!seedAuthority && authority === seedAuthority),
        sharedDomain: a.sharedDomain,
        sharedTerms: a.sharedTerms,
        citation: obj.provenance?.citation ?? null,
        sourceAuthority: obj.provenance?.sourceAuthority ?? null,
      };
    })
    .sort((a, b) => b.relation - a.relation || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(1, limit));
}

export interface RelatedByQuery {
  query: string;
  seed: { id: string; excerpt: string; citation: string | null; sourceAuthority: string | null } | null;
  related: RelatedRecord[];
}

/**
 * Query-driven graph retrieval: lexically pick the best-matching seed record,
 * then return its cited graph neighbours. Combines search + graph traversal.
 */
export function relatedByQuery(objects: IurgObjectInput[], query: string, limit = 5): RelatedByQuery {
  const top = searchCorpus(objects, query, 1)[0];
  if (!top) return { query, seed: null, related: [] };
  return {
    query,
    seed: { id: top.id, excerpt: top.excerpt, citation: top.citation, sourceAuthority: top.sourceAuthority },
    related: relatedRecords(objects, top.id, limit),
  };
}

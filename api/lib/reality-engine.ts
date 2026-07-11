// ============================================================
// REALITY ENGINE (B5) — العقل الحضاري
// Deterministic, keyless, DB-free pipeline that turns raw input
// into a knowledge graph and surfaces contradictions:
//
//   ingest → clean → extract (entities/relations) → ontology
//          → knowledge graph → contradiction detection
//
// Every fact carries a confidence (source reliability × extraction
// certainty) and a validity scope (from / to / domain). Two facts
// only contradict when their validity scopes overlap — time- or
// domain-scoped truths are allowed to coexist.
//
// Builds on existing deterministic layers (extends, does not replace):
//   - conflict-engine.ts : resolveConflict + priority hierarchy
//   - persistent-memory.ts (B4) : MemoryStore + deterministicEmbedding
//   - intelligence-object.ts (B4) : linking contradictions to reasoning
//
// No consciousness / awareness claims. Pure functions + one engine
// class that stores facts (with provenance) in a swappable MemoryStore.
// ============================================================

import {
  resolveConflict,
  type HierarchyLevel,
  type ConflictCategory,
} from "../conflict-engine";
import {
  InMemoryMemoryStore,
  deterministicEmbedding,
  cosineSimilarity,
  type MemoryStore,
  type Provenance,
  type MemoryExport,
} from "./persistent-memory";
import {
  createIntelligenceObject,
  linkInsight,
  type IntelligenceObject,
} from "./intelligence-object";

// --- Errors (code embedded in message so `.toThrow(/CODE/)` matches) ---
export class RealityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "RealityError";
    this.code = code;
  }
}

// --- Validity scope: when a fact is held to be true ---
export interface ValidityScope {
  /** ISO-8601 start (inclusive). Absent = unbounded past. */
  from?: string;
  /** ISO-8601 end (inclusive). Absent = unbounded future. */
  to?: string;
  /** Optional domain/context label. Different domains never conflict. */
  domain?: string;
}

// --- Ingest ---
export interface RawInput {
  id: string;
  /** Free-ish text; parsed when no explicit triple is given. */
  text?: string;
  /** Explicit subject|predicate|object (highest extraction certainty). */
  triple?: { subject: string; predicate: string; object: string };
  provenance: Provenance;
  validityScope?: ValidityScope;
  /** Optional governance level, enabling hierarchy-based resolution. */
  authorityLevel?: HierarchyLevel;
}

export interface CleanedInput extends RawInput {
  /** Normalised text (whitespace-collapsed, trimmed). */
  text: string;
}

// --- Extraction ---
export interface ExtractedFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  /** provenance.confidence × extractionCertainty, clamped to [0,1]. */
  confidence: number;
  extractionCertainty: number;
  validityScope?: ValidityScope;
  provenance: Provenance;
  authorityLevel?: HierarchyLevel;
  /** Set once validated against the ontology. */
  ontologyStatus?: "KNOWN" | "UNKNOWN_PREDICATE";
  sourceId: string;
}

// --- Ontology ---
export interface PredicateDef {
  /** At most one object per subject → different objects contradict. */
  functional: boolean;
  /** Predicate id that this predicate negates (e.g. "is-not" negates "is"). */
  negates?: string;
}

export interface Ontology {
  entityTypes: string[];
  predicates: Record<string, PredicateDef>;
}

export function defaultOntology(): Ontology {
  return {
    entityTypes: ["Entity", "Place", "Person", "Organization", "Concept"],
    predicates: {
      is: { functional: false },
      "is-not": { functional: false, negates: "is" },
      "instance-of": { functional: false },
      "located-in": { functional: false },
      "capital-of": { functional: true },
      "born-in": { functional: true },
      "population-of": { functional: true },
      "founded-in": { functional: true },
    },
  };
}

// --- Knowledge graph ---
export interface GraphNode {
  id: string;
  types: string[];
  degree: number;
}
export interface GraphEdge {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  validityScope?: ValidityScope;
  provenance: Provenance;
  ontologyStatus: "KNOWN" | "UNKNOWN_PREDICATE";
}
export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- Contradiction detection ---
export type ContradictionKind = "FUNCTIONAL_CONFLICT" | "NEGATION";
export interface Contradiction {
  kind: ContradictionKind;
  subject: string;
  predicate: string;
  factA: string;
  factB: string;
  objectA: string;
  objectB: string;
  scopesOverlap: boolean;
  resolution: {
    preferred: "A" | "B" | "NONE";
    by: "HIERARCHY" | "CONFIDENCE" | "UNRESOLVED";
    rationale: string;
  };
}

// --- Full pipeline report ---
export interface RealityReport {
  ingested: number;
  cleaned: number;
  facts: ExtractedFact[];
  unextracted: string[];
  unknownPredicates: string[];
  graph: KnowledgeGraph;
  contradictions: Contradiction[];
}

const MAX_CONFIDENCE = 1;
const MIN_CONFIDENCE = 0;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return MIN_CONFIDENCE;
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, n));
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------
// 1) INGEST — fail-closed validation of required fields
// ---------------------------------------------------------------
export function ingest(inputs: RawInput[]): RawInput[] {
  if (!Array.isArray(inputs)) {
    throw new RealityError("INGEST_NOT_ARRAY", "المدخل يجب أن يكون مصفوفة");
  }
  const seen = new Set<string>();
  for (const raw of inputs) {
    if (!raw || typeof raw !== "object") {
      throw new RealityError("INGEST_BAD_ITEM", "عنصر إدخال غير صالح");
    }
    if (!raw.id || typeof raw.id !== "string") {
      throw new RealityError("INGEST_MISSING_ID", "كل إدخال يتطلب معرّفاً");
    }
    if (seen.has(raw.id)) {
      throw new RealityError("INGEST_DUP_ID", `معرّف مكرر: ${raw.id}`);
    }
    seen.add(raw.id);
    const hasText = typeof raw.text === "string" && collapse(raw.text).length > 0;
    const hasTriple =
      !!raw.triple &&
      !!raw.triple.subject &&
      !!raw.triple.predicate &&
      !!raw.triple.object;
    if (!hasText && !hasTriple) {
      throw new RealityError(
        "INGEST_EMPTY",
        `الإدخال ${raw.id} بلا نص ولا ثلاثية`,
      );
    }
    validateProvenance(raw.id, raw.provenance);
  }
  return inputs;
}

function validateProvenance(id: string, p: Provenance | undefined): void {
  if (!p || typeof p !== "object") {
    throw new RealityError("INGEST_NO_PROVENANCE", `الإدخال ${id} بلا provenance`);
  }
  if (!p.source || !p.method || !p.recordedAt) {
    throw new RealityError(
      "INGEST_BAD_PROVENANCE",
      `provenance ناقص في ${id} (source/method/recordedAt)`,
    );
  }
  if (typeof p.confidence !== "number" || p.confidence < 0 || p.confidence > 1) {
    throw new RealityError(
      "INGEST_BAD_CONFIDENCE",
      `confidence خارج [0,1] في ${id}`,
    );
  }
}

// ---------------------------------------------------------------
// 2) CLEAN — normalise text, drop empties, dedupe identical facts
// ---------------------------------------------------------------
export function cleanInputs(inputs: RawInput[]): CleanedInput[] {
  const out: CleanedInput[] = [];
  const seenContent = new Set<string>();
  for (const raw of inputs) {
    const text = collapse(raw.text ?? "");
    const key = raw.triple
      ? `T:${normalizeEntity(raw.triple.subject)}|${normalizePredicate(
          raw.triple.predicate,
        )}|${normalizeEntity(raw.triple.object)}`
      : `X:${text.toLowerCase()}`;
    if (seenContent.has(key)) continue;
    seenContent.add(key);
    out.push({ ...raw, text });
  }
  return out;
}

function normalizeEntity(s: string): string {
  return collapse(s).toLowerCase();
}
function normalizePredicate(s: string): string {
  return collapse(s).toLowerCase().replace(/\s+/g, "-");
}

// ---------------------------------------------------------------
// 3) EXTRACT — derive (subject, predicate, object) triples
//    Explicit triple → certainty 1.0
//    Pipe syntax  "s | p | o" → 0.9
//    Copula pattern (is / is-not / هو / ليس) → 0.75
// ---------------------------------------------------------------
const COPULA_MARKERS: Array<{ re: RegExp; predicate: string }> = [
  { re: /\bis not\b/i, predicate: "is-not" },
  { re: /\bis\b/i, predicate: "is" },
  { re: /\s(?:ليست|ليس)\s/, predicate: "is-not" },
  { re: /\s(?:هو|هي)\s/, predicate: "is" },
];

interface ParsedTriple {
  subject: string;
  predicate: string;
  object: string;
  certainty: number;
}

export function parseText(text: string): ParsedTriple | null {
  const t = collapse(text);
  if (!t) return null;

  // pipe syntax: subject | predicate | object
  if (t.includes("|")) {
    const parts = t.split("|").map((p) => collapse(p));
    if (parts.length === 3 && parts.every((p) => p.length > 0)) {
      return {
        subject: parts[0],
        predicate: normalizePredicate(parts[1]),
        object: parts[2],
        certainty: 0.9,
      };
    }
    return null;
  }

  // copula patterns
  for (const marker of COPULA_MARKERS) {
    const m = marker.re.exec(t);
    if (m && m.index > 0) {
      const subject = collapse(t.slice(0, m.index));
      const object = collapse(t.slice(m.index + m[0].length));
      if (subject && object) {
        return { subject, predicate: marker.predicate, object, certainty: 0.75 };
      }
    }
  }
  return null;
}

export function extractFacts(inputs: CleanedInput[]): {
  facts: ExtractedFact[];
  unextracted: string[];
} {
  const facts: ExtractedFact[] = [];
  const unextracted: string[] = [];
  for (const c of inputs) {
    let subject: string;
    let predicate: string;
    let object: string;
    let certainty: number;
    if (c.triple) {
      subject = collapse(c.triple.subject);
      predicate = normalizePredicate(c.triple.predicate);
      object = collapse(c.triple.object);
      certainty = 1;
    } else {
      const parsed = parseText(c.text);
      if (!parsed) {
        unextracted.push(c.id);
        continue;
      }
      subject = parsed.subject;
      predicate = parsed.predicate;
      object = parsed.object;
      certainty = parsed.certainty;
    }
    facts.push({
      id: `fact-${c.id}`,
      subject,
      predicate,
      object,
      extractionCertainty: certainty,
      confidence: clamp01(c.provenance.confidence * certainty),
      validityScope: c.validityScope,
      provenance: c.provenance,
      authorityLevel: c.authorityLevel,
      sourceId: c.id,
    });
  }
  return { facts, unextracted };
}

// ---------------------------------------------------------------
// 4) ONTOLOGY — validate predicates; flag unknown ones (not fail-open)
// ---------------------------------------------------------------
export function applyOntology(
  facts: ExtractedFact[],
  ontology: Ontology,
): { facts: ExtractedFact[]; unknownPredicates: string[] } {
  const unknown = new Set<string>();
  const out = facts.map((f) => {
    const known = Object.prototype.hasOwnProperty.call(
      ontology.predicates,
      f.predicate,
    );
    if (!known) unknown.add(f.predicate);
    return { ...f, ontologyStatus: known ? "KNOWN" : "UNKNOWN_PREDICATE" } as ExtractedFact;
  });
  return { facts: out, unknownPredicates: [...unknown].sort() };
}

// ---------------------------------------------------------------
// 5) KNOWLEDGE GRAPH — deterministic node/edge construction
// ---------------------------------------------------------------
export function buildKnowledgeGraph(facts: ExtractedFact[]): KnowledgeGraph {
  const nodeMap = new Map<string, GraphNode>();
  const ensure = (id: string): GraphNode => {
    const key = normalizeEntity(id);
    let n = nodeMap.get(key);
    if (!n) {
      n = { id, types: [], degree: 0 };
      nodeMap.set(key, n);
    }
    return n;
  };
  const edges: GraphEdge[] = [];
  for (const f of facts) {
    const s = ensure(f.subject);
    const o = ensure(f.object);
    s.degree += 1;
    o.degree += 1;
    if (f.predicate === "instance-of" && !o.types.includes(f.object)) {
      // object of instance-of is a type label on the subject node
      if (!s.types.includes(f.object)) s.types.push(f.object);
    }
    edges.push({
      id: f.id,
      subject: f.subject,
      predicate: f.predicate,
      object: f.object,
      confidence: f.confidence,
      validityScope: f.validityScope,
      provenance: f.provenance,
      ontologyStatus: f.ontologyStatus ?? "KNOWN",
    });
  }
  const nodes = [...nodeMap.values()].sort((a, b) =>
    normalizeEntity(a.id).localeCompare(normalizeEntity(b.id)),
  );
  edges.sort((a, b) => a.id.localeCompare(b.id));
  return { nodes, edges };
}

// ---------------------------------------------------------------
// 6) CONTRADICTION DETECTION — scope-aware + confidence/hierarchy
// ---------------------------------------------------------------
function boundToTime(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? fallback : t;
}

export function scopesOverlap(a?: ValidityScope, b?: ValidityScope): boolean {
  // Different explicit domains never overlap (domain-scoped truths coexist).
  if (a?.domain && b?.domain && a.domain !== b.domain) return false;
  const aFrom = boundToTime(a?.from, -Infinity);
  const aTo = boundToTime(a?.to, Infinity);
  const bFrom = boundToTime(b?.from, -Infinity);
  const bTo = boundToTime(b?.to, Infinity);
  return aFrom <= bTo && bFrom <= aTo;
}

function resolvePair(a: ExtractedFact, b: ExtractedFact): Contradiction["resolution"] {
  // Prefer governance hierarchy when both facts carry an authority level.
  if (a.authorityLevel && b.authorityLevel) {
    const category: ConflictCategory = "C2";
    const res = resolveConflict({
      category,
      sideA: { label: a.id, level: a.authorityLevel },
      sideB: { label: b.id, level: b.authorityLevel },
    });
    if (res.winner === "A" || res.winner === "B") {
      return {
        preferred: res.winner,
        by: "HIERARCHY",
        rationale: res.rationale,
      };
    }
    // equal levels → fall through to confidence
  }
  if (a.confidence > b.confidence) {
    return {
      preferred: "A",
      by: "CONFIDENCE",
      rationale: `ثقة أعلى (${a.confidence.toFixed(3)} > ${b.confidence.toFixed(3)})`,
    };
  }
  if (b.confidence > a.confidence) {
    return {
      preferred: "B",
      by: "CONFIDENCE",
      rationale: `ثقة أعلى (${b.confidence.toFixed(3)} > ${a.confidence.toFixed(3)})`,
    };
  }
  return {
    preferred: "NONE",
    by: "UNRESOLVED",
    rationale: "تعارض غير محسوم — ثقة متساوية ولا مستوى حوكمة يفصل",
  };
}

export function detectContradictions(
  facts: ExtractedFact[],
  ontology: Ontology,
): Contradiction[] {
  const out: Contradiction[] = [];
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i];
      const b = facts[j];
      if (normalizeEntity(a.subject) !== normalizeEntity(b.subject)) continue;

      const kind = classifyPair(a, b, ontology);
      if (!kind) continue;

      const overlap = scopesOverlap(a.validityScope, b.validityScope);
      if (!overlap) continue; // scoped truths coexist — not a contradiction

      out.push({
        kind,
        subject: a.subject,
        predicate: a.predicate,
        factA: a.id,
        factB: b.id,
        objectA: a.object,
        objectB: b.object,
        scopesOverlap: overlap,
        resolution: resolvePair(a, b),
      });
    }
  }
  return out;
}

function classifyPair(
  a: ExtractedFact,
  b: ExtractedFact,
  ontology: Ontology,
): ContradictionKind | null {
  const defA = ontology.predicates[a.predicate];
  const defB = ontology.predicates[b.predicate];

  // Negation: one predicate negates the other, same object.
  const aNegatesB = defA?.negates === b.predicate;
  const bNegatesA = defB?.negates === a.predicate;
  if (
    (aNegatesB || bNegatesA) &&
    normalizeEntity(a.object) === normalizeEntity(b.object)
  ) {
    return "NEGATION";
  }

  // Functional conflict: same functional predicate, different object.
  if (
    a.predicate === b.predicate &&
    defA?.functional &&
    normalizeEntity(a.object) !== normalizeEntity(b.object)
  ) {
    return "FUNCTIONAL_CONFLICT";
  }
  return null;
}

/**
 * Reuse of the B4 lifecycle: turn a detected contradiction into an
 * IntelligenceObject seeded with the reasoning question, optionally
 * linking a pre-existing insight (insight-*). Integration, not duplication.
 */
export function contradictionToIntelligenceObject(
  c: Contradiction,
  insightId?: string,
): IntelligenceObject {
  const question = `تعارض (${c.kind}) حول «${c.subject}» في «${c.predicate}»: «${c.objectA}» مقابل «${c.objectB}» — أيهما يُعتمد؟`;
  let obj = createIntelligenceObject(`io-${c.factA}-${c.factB}`, question);
  if (insightId) obj = linkInsight(obj, insightId);
  return obj;
}

// ---------------------------------------------------------------
// PIPELINE ORCHESTRATOR (pure)
// ---------------------------------------------------------------
export function runRealityPipeline(
  inputs: RawInput[],
  ontology: Ontology = defaultOntology(),
): RealityReport {
  const ingested = ingest(inputs);
  const cleaned = cleanInputs(ingested);
  const extracted = extractFacts(cleaned);
  const validated = applyOntology(extracted.facts, ontology);
  const graph = buildKnowledgeGraph(validated.facts);
  const contradictions = detectContradictions(validated.facts, ontology);
  return {
    ingested: ingested.length,
    cleaned: cleaned.length,
    facts: validated.facts,
    unextracted: extracted.unextracted,
    unknownPredicates: validated.unknownPredicates,
    graph,
    contradictions,
  };
}

// ---------------------------------------------------------------
// ENGINE — stateful facade that persists facts (with provenance)
// through a swappable MemoryStore (deterministic in-memory default).
// ---------------------------------------------------------------
export interface RealityEngineOptions {
  ontology?: Ontology;
  store?: MemoryStore;
}

const FACT_KIND = "reality-fact";

export class RealityEngine {
  private readonly ontology: Ontology;
  private readonly store: MemoryStore;
  private facts: ExtractedFact[] = [];

  constructor(opts: RealityEngineOptions = {}) {
    this.ontology = opts.ontology ?? defaultOntology();
    this.store = opts.store ?? new InMemoryMemoryStore();
  }

  /** Ingest → clean → extract → ontology → persist. Returns the new facts. */
  async ingest(inputs: RawInput[]): Promise<{ facts: ExtractedFact[]; unextracted: string[]; unknownPredicates: string[] }> {
    const report = runRealityPipeline(inputs, this.ontology);
    for (const f of report.facts) {
      await this.store.put({
        id: f.id,
        kind: FACT_KIND,
        content: JSON.stringify({
          subject: f.subject,
          predicate: f.predicate,
          object: f.object,
          confidence: f.confidence,
          validityScope: f.validityScope ?? null,
          ontologyStatus: f.ontologyStatus,
        }),
        provenance: f.provenance,
      });
      this.facts.push(f);
    }
    return {
      facts: report.facts,
      unextracted: report.unextracted,
      unknownPredicates: report.unknownPredicates,
    };
  }

  /** Correct a stored fact's object; supersedes the old record (audit-preserving). */
  async correctFact(
    factId: string,
    newObject: string,
    provenance: Provenance,
  ): Promise<ExtractedFact> {
    const idx = this.facts.findIndex((f) => f.id === factId);
    if (idx === -1) {
      throw new RealityError("FACT_NOT_FOUND", `لا توجد حقيقة ${factId}`);
    }
    const prev = this.facts[idx];
    const rec = await this.store.correct(factId, {
      content: JSON.stringify({
        subject: prev.subject,
        predicate: prev.predicate,
        object: collapse(newObject),
        confidence: clamp01(provenance.confidence * prev.extractionCertainty),
        validityScope: prev.validityScope ?? null,
        ontologyStatus: prev.ontologyStatus,
      }),
      provenance,
    });
    const corrected: ExtractedFact = {
      ...prev,
      id: rec.id,
      object: collapse(newObject),
      provenance,
      confidence: clamp01(provenance.confidence * prev.extractionCertainty),
    };
    this.facts[idx] = corrected;
    return corrected;
  }

  /** Intentionally forget a fact (tagged soft-delete) and drop it from the live graph. */
  async forgetFact(factId: string, reason: string): Promise<void> {
    const idx = this.facts.findIndex((f) => f.id === factId);
    if (idx === -1) {
      throw new RealityError("FACT_NOT_FOUND", `لا توجد حقيقة ${factId}`);
    }
    if (!reason || !collapse(reason)) {
      throw new RealityError("FORGET_NO_REASON", "النسيان المقصود يتطلب سبباً");
    }
    await this.store.forget(factId, reason);
    this.facts.splice(idx, 1);
  }

  graph(): KnowledgeGraph {
    return buildKnowledgeGraph(this.facts);
  }

  contradictions(): Contradiction[] {
    return detectContradictions(this.facts, this.ontology);
  }

  listFacts(): ExtractedFact[] {
    return [...this.facts];
  }

  /** Full audit export from the MemoryStore (includes corrected + forgotten). */
  export(): Promise<MemoryExport> {
    return this.store.export();
  }

  /**
   * Similarity ranking of stored facts against a query, using the B4
   * deterministic embedding. Keyless and reproducible.
   */
  similarFacts(query: string): Array<{ fact: ExtractedFact; similarity: number }> {
    const q = deterministicEmbedding(query);
    return this.facts
      .map((f) => ({
        fact: f,
        similarity: cosineSimilarity(
          q,
          deterministicEmbedding(`${f.subject} ${f.predicate} ${f.object}`),
        ),
      }))
      .sort((a, b) => b.similarity - a.similarity);
  }
}

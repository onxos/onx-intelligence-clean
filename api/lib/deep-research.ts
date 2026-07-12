// ============================================================
// DEEP RESEARCH LOOP — K1
//
// A governed, deterministic research capability with EXPLICIT states:
//   plan → collect → validate → contradict → report
//
// Design principles (charter):
//   • Deterministic & keyless — no network, no Math.random, no Date.now.
//     The caller supplies `now`; retrieval happens through an injectable
//     provider PORT (the GatewayProvider swap-point pattern from B2).
//   • Reuse, not duplication — contradiction handling delegates ENTIRELY
//     to the B5 reality pipeline (`runRealityPipeline`/`detectContradictions`)
//     by turning source claims into RawInput with provenance. No new
//     contradiction logic lives here.
//   • Fail-closed — sources that fail validation are excluded and counted;
//     claims with no source are rejected (citation is mandatory).
//   • Bounded — recursion depth is capped by a documented maximum.
// ============================================================
import {
  runRealityPipeline,
  type RawInput,
  type Contradiction,
  type ContradictionKind,
  type Ontology,
} from "./reality-engine";
import { stableHash } from "./orchestrator-engine";

// --- Errors (code embedded in message so `.toThrow(/CODE/)` matches) ---
export class DeepResearchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "DeepResearchError";
    this.code = code;
  }
}

// --- Documented, deterministic defaults ---
/** A source below this reliability is excluded (fail-closed). */
export const DEFAULT_RELIABILITY_THRESHOLD = 0.5;
/** Recursion is never deeper than this; a documented, finite bound. */
export const DEFAULT_MAX_DEPTH = 2;
/** The closed facet set a question is decomposed into at plan time. */
export const DEFAULT_FACETS = [
  "التعريف والنطاق",
  "الأدلة والبيانات",
  "التناقضات والحدود",
];
/** Deterministic fallback timestamp when the caller omits `now`. */
const EPOCH = "1970-01-01T00:00:00.000Z";

// ============================================================
// Types
// ============================================================
export interface SourceClaim {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  text?: string;
}

export interface ResearchSource {
  id: string;
  title: string;
  /** ISO-8601 publication date. Must be valid and not in the future. */
  publishedAt: string;
  /** Source reliability in [0,1]. */
  reliability: number;
  claims: SourceClaim[];
}

export interface SubQuery {
  id: string;
  question: string;
  facet: string;
  depth: number;
}

export interface ResearchPlan {
  question: string;
  maxDepth: number;
  subQueries: SubQuery[];
}

/** The swappable retrieval PORT — deterministic mock in tests/CI, real
 *  backend later. Mirrors B2's GatewayProvider injection pattern. */
export type SourceProvider = (query: SubQuery) => Promise<ResearchSource[]>;

export interface ExcludedSource {
  id: string;
  reasons: string[];
}

export interface ValidationOutcome {
  accepted: ResearchSource[];
  excluded: ExcludedSource[];
}

/** A claim aggregated across the sources that assert it. */
export interface CandidateClaim {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  text?: string;
  /** The source id(s) that assert this claim (citation). */
  sourceIds: string[];
  /** Max reliability among the asserting sources (drives resolution). */
  confidence?: number;
}

export interface CitedClaim {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  text?: string;
  sourceIds: string[];
}

export interface ReportContradiction {
  kind: ContradictionKind;
  subject: string;
  predicate: string;
  objectA: string;
  objectB: string;
  claimA: string;
  claimB: string;
  resolved: boolean;
  resolution: string;
}

export interface ReportStats {
  subQueries: number;
  sourcesCollected: number;
  sourcesAccepted: number;
  sourcesExcluded: number;
  claims: number;
  maxDepthReached: number;
}

export interface ResearchReport {
  question: string;
  maxDepth: number;
  claims: CitedClaim[];
  rejectedClaims: { id: string; reason: string }[];
  contradictions: ReportContradiction[];
  unresolvedCount: number;
  excludedSources: ExcludedSource[];
  stats: ReportStats;
}

export interface PlanOptions {
  facets?: string[];
  maxDepth?: number;
  depth?: number;
}

export interface RunOptions {
  facets?: string[];
  maxDepth?: number;
  reliabilityThreshold?: number;
  now?: string;
  ontology?: Ontology;
}

// ============================================================
// Local, deterministic normalisation (kept private to this module —
// mirrors reality-engine's internal normalisation for stable keys).
// ============================================================
function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function normEntity(s: string): string {
  return collapse(s).toLowerCase();
}
function normPredicate(s: string): string {
  return collapse(s).toLowerCase().replace(/\s+/g, "-");
}
function claimKey(subject: string, predicate: string, object: string): string {
  return `${normEntity(subject)}|${normPredicate(predicate)}|${normEntity(object)}`;
}

// ============================================================
// STATE 1 — plan (closed, deterministic decomposition)
// ============================================================
export function planResearch(
  question: string,
  opts: PlanOptions = {},
): ResearchPlan {
  const q = collapse(question ?? "");
  if (!q) {
    throw new DeepResearchError("EMPTY_QUESTION", "سؤال البحث فارغ");
  }
  const facets = opts.facets ?? DEFAULT_FACETS;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const depth = opts.depth ?? 1;

  // A CLOSED list: exactly one sub-query per facet, fixed at plan time.
  const subQueries: SubQuery[] = facets.map((facet) => {
    const sub = `${q} — ${facet}`;
    return {
      id: `sq-${stableHash(`${sub}|${depth}`)}`,
      question: sub,
      facet,
      depth,
    };
  });

  return { question: q, maxDepth, subQueries };
}

// ============================================================
// STATE 2 — collect (through the injectable provider port only)
// ============================================================
export async function collectSources(
  subQueries: SubQuery[],
  provider: SourceProvider,
): Promise<ResearchSource[]> {
  if (typeof provider !== "function") {
    throw new DeepResearchError("NO_PROVIDER", "مزوّد المصادر غير محقون");
  }
  const out: ResearchSource[] = [];
  for (const q of subQueries) {
    const sources = await provider(q);
    if (Array.isArray(sources)) out.push(...sources);
  }
  return out;
}

/** Build a deterministic static provider from a fixture map keyed by
 *  sub-query id. Returns `[]` for unknown queries (no network). */
export function makeStaticProvider(
  byQueryId: Record<string, ResearchSource[]>,
): SourceProvider {
  return async (q: SubQuery) => byQueryId[q.id] ?? [];
}

// ============================================================
// STATE 3 — validate (fail-closed)
// ============================================================
export interface ValidateOptions {
  now?: string;
  reliabilityThreshold?: number;
}

function validClaim(c: SourceClaim): boolean {
  return (
    !!c &&
    typeof c.id === "string" &&
    collapse(c.id).length > 0 &&
    collapse(c.subject ?? "").length > 0 &&
    collapse(c.predicate ?? "").length > 0 &&
    collapse(c.object ?? "").length > 0
  );
}

export function validateSources(
  sources: ResearchSource[],
  opts: ValidateOptions = {},
): ValidationOutcome {
  const now = opts.now ?? EPOCH;
  const threshold = opts.reliabilityThreshold ?? DEFAULT_RELIABILITY_THRESHOLD;
  const nowMs = Date.parse(now);

  const accepted: ResearchSource[] = [];
  const excluded: ExcludedSource[] = [];

  for (const s of sources) {
    const reasons: string[] = [];

    if (!s || typeof s !== "object") {
      excluded.push({ id: "?", reasons: ["مصدر غير صالح (not an object)"] });
      continue;
    }
    // Field completeness.
    if (!s.id || collapse(s.id).length === 0) reasons.push("حقل ناقص: id");
    if (!s.title || collapse(s.title).length === 0) {
      reasons.push("حقل ناقص: title");
    }
    // Reliability threshold (documented, fail-closed).
    if (
      typeof s.reliability !== "number" ||
      Number.isNaN(s.reliability) ||
      s.reliability < 0 ||
      s.reliability > 1
    ) {
      reasons.push("reliability خارج [0,1]");
    } else if (s.reliability < threshold) {
      reasons.push(
        `reliability دون العتبة (${s.reliability} < ${threshold})`,
      );
    }
    // Date consistency: parseable ISO date, not in the future vs `now`.
    const pubMs = Date.parse(s.publishedAt ?? "");
    if (Number.isNaN(pubMs)) {
      reasons.push("publishedAt ليس تاريخاً صالحاً (invalid date)");
    } else if (!Number.isNaN(nowMs) && pubMs > nowMs) {
      reasons.push("publishedAt في المستقبل (future date)");
    }
    // At least one well-formed claim.
    if (!Array.isArray(s.claims) || s.claims.length === 0) {
      reasons.push("لا توجد ادعاءات (no claims)");
    } else if (!s.claims.every(validClaim)) {
      reasons.push("ادعاء غير مكتمل (incomplete claim triple)");
    }

    if (reasons.length > 0) {
      excluded.push({ id: s?.id ?? "?", reasons });
    } else {
      accepted.push(s);
    }
  }

  return { accepted, excluded };
}

// ============================================================
// extract — flatten accepted sources into aggregated candidate claims.
// Claims with the same (subject|predicate|object) are merged, combining
// their citing source ids and taking the max reliability as confidence.
// ============================================================
export function extractClaims(accepted: ResearchSource[]): CandidateClaim[] {
  const byKey = new Map<string, CandidateClaim>();
  for (const s of accepted) {
    if (!Array.isArray(s.claims)) continue;
    for (const c of s.claims) {
      if (!validClaim(c)) continue;
      const key = claimKey(c.subject, c.predicate, c.object);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.sourceIds.includes(s.id)) existing.sourceIds.push(s.id);
        existing.confidence = Math.max(
          existing.confidence ?? 0,
          s.reliability,
        );
      } else {
        byKey.set(key, {
          id: `claim-${stableHash(key)}`,
          subject: collapse(c.subject),
          predicate: collapse(c.predicate),
          object: collapse(c.object),
          text: c.text,
          sourceIds: [s.id],
          confidence: s.reliability,
        });
      }
    }
  }
  // Deterministic ordering by id.
  return [...byKey.values()]
    .map((c) => ({ ...c, sourceIds: [...c.sourceIds].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ============================================================
// STATE 4 — contradict (REUSE of the B5 reality pipeline)
// ============================================================
export interface ContradictionOptions {
  now?: string;
  ontology?: Ontology;
}

function stripFactPrefix(id: string): string {
  return id.replace(/^fact-/, "");
}

export function detectResearchContradictions(
  candidates: CandidateClaim[],
  opts: ContradictionOptions = {},
): ReportContradiction[] {
  const now = opts.now ?? EPOCH;
  // Turn each candidate claim into a RawInput with provenance, then let the
  // B5 pipeline do ALL of the contradiction work — no logic duplicated here.
  const inputs: RawInput[] = candidates.map((c) => ({
    id: c.id,
    triple: { subject: c.subject, predicate: c.predicate, object: c.object },
    provenance: {
      source: c.sourceIds.join(",") || "unknown",
      method: "deep-research",
      recordedAt: now,
      confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
    },
  }));

  const report = runRealityPipeline(inputs, opts.ontology);
  return report.contradictions.map((c: Contradiction) => ({
    kind: c.kind,
    subject: c.subject,
    predicate: c.predicate,
    objectA: c.objectA,
    objectB: c.objectB,
    claimA: stripFactPrefix(c.factA),
    claimB: stripFactPrefix(c.factB),
    resolved: c.resolution.by !== "UNRESOLVED",
    resolution: `${c.resolution.by}: ${c.resolution.rationale}`,
  }));
}

// ============================================================
// STATE 5 — report (mandatory citation, surfaced contradictions)
// ============================================================
export interface ReportOptions {
  now?: string;
  maxDepth?: number;
  subQueries?: number;
  sourcesCollected?: number;
  sourcesAccepted?: number;
  maxDepthReached?: number;
}

export function buildReport(
  question: string,
  candidates: CandidateClaim[],
  contradictions: ReportContradiction[],
  excluded: ExcludedSource[],
  opts: ReportOptions = {},
): ResearchReport {
  const claims: CitedClaim[] = [];
  const rejectedClaims: { id: string; reason: string }[] = [];

  for (const c of candidates) {
    if (Array.isArray(c.sourceIds) && c.sourceIds.length > 0) {
      claims.push({
        id: c.id,
        subject: c.subject,
        predicate: c.predicate,
        object: c.object,
        text: c.text,
        sourceIds: [...c.sourceIds].sort(),
      });
    } else {
      // Citation is mandatory — an uncited claim is rejected, never reported.
      rejectedClaims.push({
        id: c.id,
        reason: "ادعاء بلا مصدر — الاستشهاد إلزامي (citation required)",
      });
    }
  }
  claims.sort((a, b) => a.id.localeCompare(b.id));

  // Dedupe excluded sources by id (deterministic order).
  const excludedById = new Map<string, ExcludedSource>();
  for (const e of excluded) {
    if (!excludedById.has(e.id)) excludedById.set(e.id, e);
  }
  const excludedSources = [...excludedById.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const unresolvedCount = contradictions.filter((c) => !c.resolved).length;

  return {
    question: collapse(question),
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    claims,
    rejectedClaims,
    contradictions,
    unresolvedCount,
    excludedSources,
    stats: {
      subQueries: opts.subQueries ?? 0,
      sourcesCollected: opts.sourcesCollected ?? 0,
      sourcesAccepted: opts.sourcesAccepted ?? 0,
      sourcesExcluded: excludedSources.length,
      claims: claims.length,
      maxDepthReached: opts.maxDepthReached ?? 0,
    },
  };
}

// ============================================================
// The full loop — bounded, deterministic recursion.
// ============================================================
export async function runDeepResearch(
  question: string,
  provider: SourceProvider,
  opts: RunOptions = {},
): Promise<ResearchReport> {
  const now = opts.now ?? EPOCH;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const facets = opts.facets ?? DEFAULT_FACETS;
  const threshold = opts.reliabilityThreshold ?? DEFAULT_RELIABILITY_THRESHOLD;

  // Fail-closed up front: an empty question never starts a run.
  planResearch(question, { facets, maxDepth });

  const acceptedById = new Map<string, ResearchSource>();
  const excluded: ExcludedSource[] = [];
  let sourcesCollected = 0;
  let subQueryCount = 0;
  let maxDepthReached = 0;

  async function gather(q: string, depth: number): Promise<void> {
    maxDepthReached = Math.max(maxDepthReached, depth);
    const plan = planResearch(q, { facets, maxDepth, depth });
    subQueryCount += plan.subQueries.length;

    const sources = await collectSources(plan.subQueries, provider);
    sourcesCollected += sources.length;

    const outcome = validateSources(sources, {
      now,
      reliabilityThreshold: threshold,
    });
    for (const s of outcome.accepted) {
      if (!acceptedById.has(s.id)) acceptedById.set(s.id, s);
    }
    for (const e of outcome.excluded) excluded.push(e);

    if (depth < maxDepth) {
      for (const sq of plan.subQueries) {
        await gather(sq.question, depth + 1);
      }
    }
  }

  await gather(collapse(question), 1);

  const accepted = [...acceptedById.values()];
  const candidates = extractClaims(accepted);
  const contradictions = detectResearchContradictions(candidates, {
    now,
    ontology: opts.ontology,
  });

  return buildReport(question, candidates, contradictions, excluded, {
    now,
    maxDepth,
    subQueries: subQueryCount,
    sourcesCollected,
    sourcesAccepted: accepted.length,
    maxDepthReached,
  });
}

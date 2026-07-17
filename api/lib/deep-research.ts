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
import { createHash } from "node:crypto";
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

// --- Documented, deterministic defaults & governance bounds ---
/** A source below this reliability is excluded (fail-closed). */
export const DEFAULT_RELIABILITY_THRESHOLD = 0.5;
/** Default recursion depth when the caller omits one. */
export const DEFAULT_MAX_DEPTH = 2;
/**
 * HARD, server-owned ceiling on recursion depth. The loop fans out as
 * facets^depth, so an unbounded caller-supplied depth is a DoS vector; the
 * effective depth is always `Math.min(requested, MAX_DEPTH_HARD_CAP)`. A
 * caller can never exceed this, regardless of input.
 */
export const MAX_DEPTH_HARD_CAP = 3;
/**
 * HARD ceiling on the total number of sources collected across the whole
 * run. Collection stops once this is reached (fail-closed against a provider
 * that returns an unbounded stream). Documented, server-owned bound.
 */
export const MAX_TOTAL_SOURCES = 500;
/** The closed facet set a question is decomposed into at plan time. */
export const DEFAULT_FACETS = [
  "التعريف والنطاق",
  "الأدلة والبيانات",
  "التناقضات والحدود",
];

/**
 * Explicit provenance of the retrieval backend behind a run:
 *   • "live"        — a real, networked retrieval backend produced the data.
 *   • "demo"        — a deterministic, server-owned illustrative provider.
 *   • "unavailable" — no backend is wired; the report is honestly empty.
 * This is surfaced on every report so an empty result is never silently
 * mistaken for "researched and found nothing".
 */
export type ProviderStatus = "live" | "demo" | "unavailable";

/**
 * Fail-closed clock guard. There is NO fabricated-time fallback: a run
 * without a valid, server-owned ISO timestamp is rejected outright so that
 * validation (future-dating) and provenance can never be stamped with a
 * fake epoch.
 */
function assertClock(now?: string): string {
  if (typeof now !== "string" || collapse(now).length === 0) {
    throw new DeepResearchError(
      "NO_CLOCK",
      "الساعة (now) مطلوبة — لا زمن افتراضي (fail-closed)",
    );
  }
  if (Number.isNaN(Date.parse(now))) {
    throw new DeepResearchError("NO_CLOCK", `الساعة (now) غير صالحة: ${now}`);
  }
  return now;
}

/**
 * Deterministic SHA-256 content hash of a source, over a canonical,
 * order-stable serialization — lets an auditor verify exactly what was
 * gathered without trusting the engine's self-report.
 */
export function computeSourceHash(s: ResearchSource): string {
  const canonical = JSON.stringify({
    id: s?.id ?? null,
    title: s?.title ?? null,
    publishedAt: s?.publishedAt ?? null,
    reliability: typeof s?.reliability === "number" ? s.reliability : null,
    claims: Array.isArray(s?.claims)
      ? [...s.claims]
          .map((c) => ({
            id: c?.id ?? null,
            subject: c?.subject ?? null,
            predicate: c?.predicate ?? null,
            object: c?.object ?? null,
            text: c?.text ?? null,
          }))
          .sort((a, b) =>
            `${a.subject}|${a.predicate}|${a.object}`.localeCompare(
              `${b.subject}|${b.predicate}|${b.object}`,
            ),
          )
      : null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

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
  /** True when a hard governance cap (depth or total sources) was hit. */
  capHit: boolean;
}

/** An auditable digest of a single collected source. */
export interface SourceDigest {
  id: string;
  sourceHash: string;
  status: "accepted" | "excluded";
}

export interface ResearchReport {
  question: string;
  maxDepth: number;
  /** The server-owned hard ceiling that bounded this run. */
  maxDepthCap: number;
  /** Explicit provenance of the retrieval backend (never assumed "live"). */
  providerStatus: ProviderStatus;
  claims: CitedClaim[];
  rejectedClaims: { id: string; reason: string }[];
  contradictions: ReportContradiction[];
  unresolvedCount: number;
  excludedSources: ExcludedSource[];
  /** Content hashes of every collected source, for independent audit. */
  sources: SourceDigest[];
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
  /** Server-owned clock (ISO). REQUIRED — no fabricated fallback. */
  now?: string;
  ontology?: Ontology;
  /** Declared provenance of the injected provider. Defaults to "demo". */
  providerStatus?: ProviderStatus;
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
  const now = assertClock(opts.now);
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
  const now = assertClock(opts.now);
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
  maxDepth?: number;
  maxDepthCap?: number;
  providerStatus?: ProviderStatus;
  subQueries?: number;
  sourcesCollected?: number;
  sourcesAccepted?: number;
  maxDepthReached?: number;
  sources?: SourceDigest[];
  capHit?: boolean;
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

  const sources = [...(opts.sources ?? [])].sort((a, b) =>
    a.id === b.id ? a.status.localeCompare(b.status) : a.id.localeCompare(b.id),
  );

  const unresolvedCount = contradictions.filter((c) => !c.resolved).length;

  return {
    question: collapse(question),
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxDepthCap: opts.maxDepthCap ?? MAX_DEPTH_HARD_CAP,
    providerStatus: opts.providerStatus ?? "demo",
    claims,
    rejectedClaims,
    contradictions,
    unresolvedCount,
    excludedSources,
    sources,
    stats: {
      subQueries: opts.subQueries ?? 0,
      sourcesCollected: opts.sourcesCollected ?? 0,
      sourcesAccepted: opts.sourcesAccepted ?? 0,
      sourcesExcluded: excludedSources.length,
      claims: claims.length,
      maxDepthReached: opts.maxDepthReached ?? 0,
      capHit: opts.capHit ?? false,
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
  // Server-owned clock, fail-closed — no fabricated epoch fallback.
  const now = assertClock(opts.now);
  // Depth is HARD-clamped to the server-owned ceiling; a caller can never
  // exceed MAX_DEPTH_HARD_CAP (guards the facets^depth fan-out / DoS).
  const requestedDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxDepth = Math.min(Math.max(1, requestedDepth), MAX_DEPTH_HARD_CAP);
  const facets = opts.facets ?? DEFAULT_FACETS;
  const threshold = opts.reliabilityThreshold ?? DEFAULT_RELIABILITY_THRESHOLD;
  const providerStatus: ProviderStatus = opts.providerStatus ?? "demo";

  // Fail-closed up front: an empty question never starts a run.
  planResearch(question, { facets, maxDepth });

  const acceptedById = new Map<string, ResearchSource>();
  const excluded: ExcludedSource[] = [];
  const digestById = new Map<string, SourceDigest>();
  let sourcesCollected = 0;
  let subQueryCount = 0;
  let maxDepthReached = 0;
  let capHit = false;

  async function gather(q: string, depth: number): Promise<void> {
    maxDepthReached = Math.max(maxDepthReached, depth);
    const plan = planResearch(q, { facets, maxDepth, depth });
    subQueryCount += plan.subQueries.length;

    const collected = await collectSources(plan.subQueries, provider);

    // HARD total-source cap — stop admitting sources once the ceiling is hit.
    const remaining = MAX_TOTAL_SOURCES - sourcesCollected;
    const sources = collected.slice(0, Math.max(0, remaining));
    if (sources.length < collected.length) capHit = true;
    sourcesCollected += sources.length;

    const outcome = validateSources(sources, {
      now,
      reliabilityThreshold: threshold,
    });
    const acceptedSet = new Set(outcome.accepted);
    for (const s of outcome.accepted) {
      if (!acceptedById.has(s.id)) acceptedById.set(s.id, s);
    }
    for (const e of outcome.excluded) excluded.push(e);
    // Auditable digest of every collected source (accepted or excluded).
    for (const s of sources) {
      const id = s?.id && collapse(s.id).length > 0 ? s.id : "?";
      const status: SourceDigest["status"] = acceptedSet.has(s)
        ? "accepted"
        : "excluded";
      const key = `${id}:${status}`;
      if (!digestById.has(key)) {
        digestById.set(key, { id, sourceHash: computeSourceHash(s), status });
      }
    }

    if (depth < maxDepth && sourcesCollected < MAX_TOTAL_SOURCES) {
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
    maxDepth,
    maxDepthCap: MAX_DEPTH_HARD_CAP,
    providerStatus,
    subQueries: subQueryCount,
    sourcesCollected,
    sourcesAccepted: accepted.length,
    maxDepthReached,
    sources: [...digestById.values()],
    capHit,
  });
}

// ============================================================
// Server-owned providers (the swap-point). A production tRPC surface MUST
// use one of these — it never accepts caller-supplied fixtures.
// ============================================================
/** No live backend is wired: yields nothing → an honest, empty report. */
export function makeUnavailableProvider(): SourceProvider {
  return async () => [];
}

/** A deterministic, server-owned illustrative provider. Its data is clearly
 *  labelled DEMO so it is never mistaken for live retrieval. */
export function makeDemoProvider(): SourceProvider {
  return async (q: SubQuery) => {
    if (q.facet === DEFAULT_FACETS[1]) {
      return [
        {
          id: `demo-${q.id}`,
          title: `DEMO: مصدر توضيحي (${q.facet})`,
          publishedAt: "2020-01-01T00:00:00.000Z",
          reliability: 0.8,
          claims: [
            {
              id: `demo-cl-${q.id}`,
              subject: "onx",
              predicate: "is",
              object: "demo",
            },
          ],
        },
      ];
    }
    return [];
  };
}

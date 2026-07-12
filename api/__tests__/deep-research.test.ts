// ============================================================
// DEEP RESEARCH LOOP — K1 (plan → collect → validate → contradict → report)
//
// A real, governed research capability with EXPLICIT states:
//   1. plan     — a research question → a CLOSED list of sub-queries
//                 (fixed at plan time; no runtime expansion).
//   2. collect  — sources via an injectable provider PORT (deterministic
//                 mock; no network, no keys) — the swap-point for a real
//                 retrieval backend later (GatewayProvider pattern, B2).
//   3. validate — fail-closed source validation (field completeness, date
//                 consistency, documented reliability threshold); an
//                 incomplete/untrustworthy source is EXCLUDED and counted.
//   4. contradict — REUSES B5 `runRealityPipeline`/`detectContradictions`
//                 by turning source claims into RawInput with provenance —
//                 NO new contradiction logic here.
//   5. report   — every claim is bound to its source id(s) (citation is
//                 MANDATORY: a claim with no source is rejected), and
//                 unresolved contradictions are SURFACED, never hidden.
//
// Recursion is bounded by a documented max depth: a sub-query spawns finer
// sub-queries through the SAME loop, up to the limit. Fully deterministic.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  planResearch,
  collectSources,
  validateSources,
  extractClaims,
  detectResearchContradictions,
  buildReport,
  runDeepResearch,
  makeStaticProvider,
  DEFAULT_RELIABILITY_THRESHOLD,
  DEFAULT_MAX_DEPTH,
  DeepResearchError,
  type ResearchSource,
  type SourceProvider,
  type SubQuery,
} from "../lib/deep-research";

const NOW = "2026-07-12T00:00:00.000Z";

function src(over: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: "s1",
    title: "مصدر",
    publishedAt: "2026-01-01T00:00:00.000Z",
    reliability: 0.9,
    claims: [
      { id: "cl1", subject: "Cairo", predicate: "capital-of", object: "Egypt" },
    ],
    ...over,
  };
}

// ------------------------------------------------------------------
// STATE 1 — plan
// ------------------------------------------------------------------
describe("plan — closed, deterministic sub-query decomposition (K1 state 1)", () => {
  it("produces a fixed, non-empty list of sub-queries for a question", () => {
    const plan = planResearch("ما أثر الدواء X على المرضى؟");
    expect(plan.subQueries.length).toBeGreaterThan(0);
    expect(plan.maxDepth).toBe(DEFAULT_MAX_DEPTH);
    // Each sub-query is well-formed and carries its depth.
    for (const q of plan.subQueries) {
      expect(q.id.length).toBeGreaterThan(0);
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.depth).toBe(1);
    }
  });

  it("is deterministic — identical input yields byte-identical plans", () => {
    const a = planResearch("سؤال بحثي ثابت");
    const b = planResearch("سؤال بحثي ثابت");
    expect(a).toEqual(b);
  });

  it("FAIL-CLOSED: an empty/blank question is rejected", () => {
    expect(() => planResearch("   ")).toThrow(/EMPTY_QUESTION/);
    expect(() => planResearch("")).toThrow(DeepResearchError);
  });

  it("does not expand at runtime — sub-query count equals the facet count", () => {
    const facets = ["أ", "ب"];
    const plan = planResearch("س", { facets });
    expect(plan.subQueries).toHaveLength(2);
  });
});

// ------------------------------------------------------------------
// STATE 2 — collect (injectable provider port)
// ------------------------------------------------------------------
describe("collect — via an injectable deterministic provider port (K1 state 2)", () => {
  it("collects sources ONLY through the injected provider (no network)", async () => {
    const calls: string[] = [];
    const provider: SourceProvider = async (q: SubQuery) => {
      calls.push(q.id);
      return [src({ id: `src-${q.id}` })];
    };
    const plan = planResearch("س", { facets: ["x", "y"] });
    const sources = await collectSources(plan.subQueries, provider);
    expect(sources).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("makeStaticProvider returns fixed sources per sub-query id (deterministic mock)", async () => {
    const plan = planResearch("س", { facets: ["x"] });
    const id = plan.subQueries[0].id;
    const provider = makeStaticProvider({ [id]: [src({ id: "fixed" })] });
    const one = await collectSources(plan.subQueries, provider);
    const two = await collectSources(plan.subQueries, provider);
    expect(one).toEqual(two);
    expect(one[0].id).toBe("fixed");
  });
});

// ------------------------------------------------------------------
// STATE 3 — validate (fail-closed)
// ------------------------------------------------------------------
describe("validate — fail-closed source validation (K1 state 3)", () => {
  it("accepts a complete, trustworthy, consistently-dated source", () => {
    const { accepted, excluded } = validateSources([src()], { now: NOW });
    expect(accepted).toHaveLength(1);
    expect(excluded).toHaveLength(0);
  });

  it("EXCLUDES a source missing a required field (title) and records the reason", () => {
    const bad = src({ id: "s-bad", title: "" });
    const { accepted, excluded } = validateSources([bad], { now: NOW });
    expect(accepted).toHaveLength(0);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].reasons.join(" ")).toMatch(/title/i);
  });

  it("EXCLUDES a source below the documented reliability threshold", () => {
    const weak = src({ id: "s-weak", reliability: DEFAULT_RELIABILITY_THRESHOLD - 0.01 });
    const { accepted, excluded } = validateSources([weak], { now: NOW });
    expect(accepted).toHaveLength(0);
    expect(excluded[0].reasons.join(" ")).toMatch(/reliab/i);
  });

  it("EXCLUDES a future-dated source (date inconsistency vs now)", () => {
    const future = src({ id: "s-future", publishedAt: "2099-01-01T00:00:00.000Z" });
    const { accepted, excluded } = validateSources([future], { now: NOW });
    expect(accepted).toHaveLength(0);
    expect(excluded[0].reasons.join(" ")).toMatch(/date|future/i);
  });

  it("EXCLUDES a source with no claims and one with an invalid date string", () => {
    const noClaims = src({ id: "s-empty", claims: [] });
    const badDate = src({ id: "s-baddate", publishedAt: "not-a-date" });
    const { accepted, excluded } = validateSources([noClaims, badDate], { now: NOW });
    expect(accepted).toHaveLength(0);
    expect(excluded).toHaveLength(2);
  });
});

// ------------------------------------------------------------------
// STATE 4 — contradict (reuse of B5, no new logic)
// ------------------------------------------------------------------
describe("contradict — reuses B5 reality pipeline (K1 state 4)", () => {
  it("detects a functional conflict between two sources' claims", () => {
    const a = extractClaims([
      src({ id: "sA", claims: [{ id: "a1", subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
    ]);
    const b = extractClaims([
      src({ id: "sB", reliability: 0.7, claims: [{ id: "b1", subject: "Egypt", predicate: "capital-of", object: "Alexandria" }] }),
    ]);
    const contradictions = detectResearchContradictions([...a, ...b]);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe("FUNCTIONAL_CONFLICT");
    // Resolvable by confidence (0.9 vs 0.7) → resolved.
    expect(contradictions[0].resolved).toBe(true);
  });

  it("surfaces an UNRESOLVED contradiction when confidences tie and no hierarchy", () => {
    const a = extractClaims([
      src({ id: "sA", reliability: 0.8, claims: [{ id: "a1", subject: "Egypt", predicate: "population-of", object: "100M" }] }),
    ]);
    const b = extractClaims([
      src({ id: "sB", reliability: 0.8, claims: [{ id: "b1", subject: "Egypt", predicate: "population-of", object: "110M" }] }),
    ]);
    const contradictions = detectResearchContradictions([...a, ...b]);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].resolved).toBe(false);
  });

  it("finds no contradiction when the two claims agree", () => {
    const claims = extractClaims([
      src({ id: "sA", claims: [{ id: "a1", subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
      src({ id: "sB", claims: [{ id: "b1", subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
    ]);
    expect(detectResearchContradictions(claims)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// STATE 5 — report (mandatory citation, surfaced contradictions)
// ------------------------------------------------------------------
describe("report — mandatory citation, contradictions surfaced (K1 state 5)", () => {
  it("binds every reported claim to its source id(s)", () => {
    const candidates = extractClaims([
      src({ id: "sA", claims: [{ id: "a1", subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
    ]);
    const report = buildReport("ما عاصمة مصر؟", candidates, [], [], { now: NOW });
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0].sourceIds).toContain("sA");
    expect(report.rejectedClaims).toHaveLength(0);
  });

  it("REJECTS a claim with no source (citation is mandatory)", () => {
    const uncited = [
      { id: "u1", subject: "X", predicate: "is", object: "Y", sourceIds: [] as string[] },
    ];
    const report = buildReport("س", uncited, [], [], { now: NOW });
    expect(report.claims).toHaveLength(0);
    expect(report.rejectedClaims).toHaveLength(1);
    expect(report.rejectedClaims[0].id).toBe("u1");
  });

  it("merges the same claim from two sources into one cited claim", () => {
    const candidates = extractClaims([
      src({ id: "sA", claims: [{ id: "a1", subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
      src({ id: "sB", claims: [{ id: "b1", subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
    ]);
    const report = buildReport("س", candidates, [], [], { now: NOW });
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0].sourceIds.sort()).toEqual(["sA", "sB"]);
  });

  it("surfaces unresolved contradictions and counts them (never hidden)", () => {
    const a = extractClaims([
      src({ id: "sA", reliability: 0.8, claims: [{ id: "a1", subject: "Egypt", predicate: "population-of", object: "100M" }] }),
    ]);
    const b = extractClaims([
      src({ id: "sB", reliability: 0.8, claims: [{ id: "b1", subject: "Egypt", predicate: "population-of", object: "110M" }] }),
    ]);
    const all = [...a, ...b];
    const contradictions = detectResearchContradictions(all);
    const report = buildReport("س", all, contradictions, [], { now: NOW });
    expect(report.contradictions).toHaveLength(1);
    expect(report.unresolvedCount).toBe(1);
  });
});

// ------------------------------------------------------------------
// END-TO-END — bounded recursion + determinism
// ------------------------------------------------------------------
describe("runDeepResearch — end-to-end loop (K1)", () => {
  // A provider that answers by facet, with a conflicting pair on one facet.
  function conflictProvider(): SourceProvider {
    return async (q: SubQuery) => {
      if (q.facet === "الأدلة والبيانات") {
        return [
          src({ id: `evid-a-${q.depth}`, reliability: 0.9, claims: [{ id: `ea-${q.id}`, subject: "Egypt", predicate: "capital-of", object: "Cairo" }] }),
        ];
      }
      if (q.facet === "التناقضات والحدود") {
        return [
          src({ id: `conf-${q.depth}`, reliability: 0.6, claims: [{ id: `cf-${q.id}`, subject: "Egypt", predicate: "capital-of", object: "Alexandria" }] }),
        ];
      }
      return [];
    };
  }

  it("runs the full loop and returns a cited report", async () => {
    const report = await runDeepResearch("ما عاصمة مصر؟", conflictProvider(), { now: NOW });
    expect(report.claims.length).toBeGreaterThan(0);
    for (const c of report.claims) {
      expect(c.sourceIds.length).toBeGreaterThan(0);
    }
    // Cairo vs Alexandria → a functional conflict is surfaced.
    expect(report.contradictions.length).toBeGreaterThan(0);
  });

  it("respects the documented max recursion depth", async () => {
    let maxSeen = 0;
    const spy: SourceProvider = async (q: SubQuery) => {
      maxSeen = Math.max(maxSeen, q.depth);
      return [];
    };
    await runDeepResearch("س", spy, { now: NOW, maxDepth: 1 });
    expect(maxSeen).toBe(1);
    maxSeen = 0;
    await runDeepResearch("س", spy, { now: NOW, maxDepth: 2 });
    expect(maxSeen).toBe(2);
  });

  it("is deterministic end-to-end — two runs produce equal reports", async () => {
    const p = conflictProvider();
    const a = await runDeepResearch("ما عاصمة مصر؟", p, { now: NOW });
    const b = await runDeepResearch("ما عاصمة مصر؟", p, { now: NOW });
    expect(a).toEqual(b);
  });

  it("FAIL-CLOSED end-to-end: excluded sources never contribute claims", async () => {
    // Provider returns only a future-dated (invalid) source → excluded → no claims.
    const badProvider: SourceProvider = async () => [
      src({ id: "bad", publishedAt: "2099-01-01T00:00:00.000Z", claims: [{ id: "x", subject: "A", predicate: "is", object: "B" }] }),
    ];
    const report = await runDeepResearch("س", badProvider, { now: NOW });
    expect(report.claims).toHaveLength(0);
    expect(report.stats.sourcesExcluded).toBeGreaterThan(0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  adviseFounder,
  FounderCompanionError,
  FOUNDER_RELEVANCE_THRESHOLD,
} from "../lib/founder-companion-engine";
import {
  __resetFounderCompanionStoreForTests,
  getFounderAccuracy,
  getFounderAdviceHistory,
  recordFounderAdvice,
  recordFounderOutcome,
} from "../lib/founder-companion-store";

function fakeSearch(hits: Array<{ id: string; domain: string; title: string; score: number }>) {
  return async (
    _query: string,
    _options?: { domain?: string; limit?: number; offset?: number },
  ): Promise<CorpusSearchResult> => ({
    engine: "BM25",
    k1: 1.2,
    b: 0.75,
    indexedDocs: hits.length,
    totalMatches: hits.length,
    hits: hits.map((h) => ({ ...h, snippet: `…${h.title}…` })),
  });
}

const STRONG = fakeSearch([
  { id: "f1", domain: "STRATEGY", title: "Long-term strategy baseline", score: 7.1 },
  { id: "f2", domain: "STRATEGY", title: "Governance trade-offs", score: 4.4 },
]);
const WEAK = fakeSearch([{ id: "w1", domain: "MISC", title: "weak note", score: 0.2 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetFounderCompanionStoreForTests();
});

describe("founder companion validation", () => {
  it("rejects missing prompt", async () => {
    await expect(adviseFounder({ prompt: "" }, { search: STRONG })).rejects.toBeInstanceOf(
      FounderCompanionError,
    );
  });
});

describe("founder companion advice + authority", () => {
  it("returns ACTIONABLE for strong evidence", async () => {
    const a = await adviseFounder(
      { prompt: "expansion strategy", impact: "EXECUTIVE" },
      { search: STRONG },
    );
    expect(a.verdict).toBe("ACTIONABLE");
    expect(a.authorityLevel).toBe("A2");
    expect(a.authorityDecision).toBe("GRANTED");
    expect(a.status).toBe("EXECUTED_ELIGIBLE");
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails honest below threshold", async () => {
    const a = await adviseFounder(
      { prompt: "unknown sparse topic", impact: "OPERATIONAL" },
      { search: WEAK },
    );
    expect(a.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.rationale).toContain("fail-honest");
  });

  it("strategic impact enforces fail-closed requirement (A3)", async () => {
    const a = await adviseFounder(
      { prompt: "civilizational policy", impact: "STRATEGIC" },
      { search: STRONG },
    );
    expect(a.authorityLevel).toBe("A3");
    expect(a.status).toBe("REQUIRES_APPROVAL");
    expect(a.authorityDecision).toBe("DENIED");
  });

  it("handles zero evidence honestly", async () => {
    const a = await adviseFounder({ prompt: "none", impact: "OPERATIONAL" }, { search: NONE });
    expect(a.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.evidence).toHaveLength(0);
    expect(a.evalScore).toBe(0);
  });

  it("keeps strict threshold", () => {
    expect(FOUNDER_RELEVANCE_THRESHOLD).toBe(1);
  });
});

describe("founder companion durable memory + outcome feedback", () => {
  it("persists and reads back in UNPERSISTED fallback mode", async () => {
    const a1 = await adviseFounder({ prompt: "p1", impact: "OPERATIONAL" }, { search: STRONG });
    const a2 = await adviseFounder({ prompt: "p2", impact: "EXECUTIVE" }, { search: STRONG });
    const r1 = await recordFounderAdvice(a1);
    const r2 = await recordFounderAdvice(a2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const h = await getFounderAdviceHistory({ limit: 10 });
    expect(h.count).toBe(2);
    expect(h.advice[0].id).toBe(r2.id);
  });

  it("records outcome and recomputes accuracy", async () => {
    const a = await recordFounderAdvice(
      await adviseFounder({ prompt: "op", impact: "OPERATIONAL" }, { search: STRONG }),
    );
    const b = await recordFounderAdvice(
      await adviseFounder({ prompt: "exec", impact: "EXECUTIVE" }, { search: STRONG }),
    );
    await recordFounderOutcome(a.id, "APPLIED", "executed");
    await recordFounderOutcome(b.id, "REJECTED", "not aligned");
    const m = await getFounderAccuracy();
    expect(m.total).toBe(2);
    expect(m.resolved).toBe(2);
    expect(m.applied).toBe(1);
    expect(m.rejected).toBe(1);
    expect(m.accuracy).toBe(0.5);
  });

  it("returns not found on unknown outcome id", async () => {
    const r = await recordFounderOutcome(99999, "APPLIED");
    expect(r.found).toBe(false);
  });
});


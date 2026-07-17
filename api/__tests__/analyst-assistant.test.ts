import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  ANALYST_RELEVANCE_THRESHOLD,
  AnalystAssistantError,
  analyzeInsight,
} from "../lib/analyst-assistant-engine";
import {
  __resetAnalystAssistantStoreForTests,
  getAnalystAccuracy,
  getAnalystHistory,
  recordAnalystInsight,
  recordAnalystOutcome,
} from "../lib/analyst-assistant-store";

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
  { id: "a1", domain: "ANALYTICS", title: "Variance analysis guide", score: 6.6 },
  { id: "a2", domain: "ANALYTICS", title: "Forecasting baseline", score: 4.3 },
]);
const WEAK = fakeSearch([{ id: "w1", domain: "MISC", title: "noise", score: 0.2 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetAnalystAssistantStoreForTests();
});

describe("analyst assistant validation", () => {
  it("rejects missing question", async () => {
    await expect(analyzeInsight({ question: "" }, { search: STRONG })).rejects.toBeInstanceOf(
      AnalystAssistantError,
    );
  });
});

describe("analyst assistant insight + authority", () => {
  it("returns ACTIONABLE insight for strong evidence", async () => {
    const p = await analyzeInsight(
      { question: "forecast next quarter margin", domain: "FINANCE" },
      { search: STRONG },
    );
    expect(p.verdict).toBe("ACTIONABLE");
    expect(p.authorityLevel).toBe("A2");
    expect(p.authorityDecision).toBe("GRANTED");
    expect(p.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest below threshold", async () => {
    const p = await analyzeInsight({ question: "unknown sparse question" }, { search: WEAK });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.rationale).toContain("fail-honest");
  });

  it("handles no hits honestly", async () => {
    const p = await analyzeInsight({ question: "none", domain: "BUSINESS" }, { search: NONE });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.evidence).toHaveLength(0);
    expect(p.evalScore).toBe(0);
  });

  it("keeps strict threshold", () => {
    expect(ANALYST_RELEVANCE_THRESHOLD).toBe(1);
  });
});

describe("analyst assistant persistence + feedback metric", () => {
  it("persists and reads back in honest UNPERSISTED fallback", async () => {
    const p1 = await analyzeInsight({ question: "question one", domain: "BUSINESS" }, { search: STRONG });
    const p2 = await analyzeInsight({ question: "question two", domain: "RISK" }, { search: STRONG });
    const r1 = await recordAnalystInsight(p1);
    const r2 = await recordAnalystInsight(p2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const h = await getAnalystHistory({ limit: 10 });
    expect(h.count).toBe(2);
    expect(h.insights[0].id).toBe(r2.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const p1 = await recordAnalystInsight(
      await analyzeInsight({ question: "question A", domain: "BUSINESS" }, { search: STRONG }),
    );
    const p2 = await recordAnalystInsight(
      await analyzeInsight({ question: "question B", domain: "BUSINESS" }, { search: STRONG }),
    );
    await recordAnalystOutcome(p1.id, "CONFIRMED", "done");
    await recordAnalystOutcome(p2.id, "REJECTED", "rejected");
    const m = await getAnalystAccuracy("BUSINESS");
    expect(m.total).toBe(2);
    expect(m.resolved).toBe(2);
    expect(m.confirmed).toBe(1);
    expect(m.rejected).toBe(1);
    expect(m.accuracy).toBe(0.5);
  });

  it("returns not found on unknown id", async () => {
    const r = await recordAnalystOutcome(99999, "CONFIRMED");
    expect(r.found).toBe(false);
  });
});


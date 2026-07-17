import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  BUILDER_RELEVANCE_THRESHOLD,
  BuilderAssistantError,
  planBuilder,
} from "../lib/builder-assistant-engine";
import {
  __resetBuilderAssistantStoreForTests,
  getBuilderAccuracy,
  getBuilderHistory,
  recordBuilderOutcome,
  recordBuilderPlan,
} from "../lib/builder-assistant-store";

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
  { id: "b1", domain: "ENGINEERING", title: "Build pipeline hardening", score: 6.2 },
  { id: "b2", domain: "ENGINEERING", title: "Architecture trade-offs", score: 3.9 },
]);
const WEAK = fakeSearch([{ id: "w1", domain: "MISC", title: "noise", score: 0.2 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetBuilderAssistantStoreForTests();
});

describe("builder assistant validation", () => {
  it("rejects missing task", async () => {
    await expect(planBuilder({ task: "" }, { search: STRONG })).rejects.toBeInstanceOf(
      BuilderAssistantError,
    );
  });
});

describe("builder assistant planning + authority", () => {
  it("returns ACTIONABLE plan for strong evidence", async () => {
    const p = await planBuilder({ task: "ship architecture upgrade", scope: "ARCHITECTURE" }, { search: STRONG });
    expect(p.verdict).toBe("ACTIONABLE");
    expect(p.authorityLevel).toBe("A2");
    expect(p.authorityDecision).toBe("GRANTED");
    expect(p.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest below threshold", async () => {
    const p = await planBuilder({ task: "unknown sparse task" }, { search: WEAK });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.rationale).toContain("fail-honest");
  });

  it("handles no hits honestly", async () => {
    const p = await planBuilder({ task: "none", scope: "FEATURE" }, { search: NONE });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.evidence).toHaveLength(0);
    expect(p.evalScore).toBe(0);
  });

  it("keeps strict threshold", () => {
    expect(BUILDER_RELEVANCE_THRESHOLD).toBe(1);
  });
});

describe("builder assistant persistence + feedback metric", () => {
  it("persists and reads back in honest UNPERSISTED fallback", async () => {
    const p1 = await planBuilder({ task: "task one", scope: "FEATURE" }, { search: STRONG });
    const p2 = await planBuilder({ task: "task two", scope: "DELIVERY" }, { search: STRONG });
    const r1 = await recordBuilderPlan(p1);
    const r2 = await recordBuilderPlan(p2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const h = await getBuilderHistory({ limit: 10 });
    expect(h.count).toBe(2);
    expect(h.plans[0].id).toBe(r2.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const p1 = await recordBuilderPlan(
      await planBuilder({ task: "plan A", scope: "FEATURE" }, { search: STRONG }),
    );
    const p2 = await recordBuilderPlan(
      await planBuilder({ task: "plan B", scope: "FEATURE" }, { search: STRONG }),
    );
    await recordBuilderOutcome(p1.id, "SHIPPED", "done");
    await recordBuilderOutcome(p2.id, "ROLLED_BACK", "reverted");
    const m = await getBuilderAccuracy("FEATURE");
    expect(m.total).toBe(2);
    expect(m.resolved).toBe(2);
    expect(m.shipped).toBe(1);
    expect(m.rolledBack).toBe(1);
    expect(m.accuracy).toBe(0.5);
  });

  it("returns not found on unknown id", async () => {
    const r = await recordBuilderOutcome(99999, "SHIPPED");
    expect(r.found).toBe(false);
  });
});


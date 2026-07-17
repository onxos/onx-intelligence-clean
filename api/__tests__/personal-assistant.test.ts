import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  PERSONAL_RELEVANCE_THRESHOLD,
  PersonalAssistantError,
  planPersonal,
} from "../lib/personal-assistant-engine";
import {
  __resetPersonalAssistantStoreForTests,
  getPersonalAccuracy,
  getPersonalHistory,
  recordPersonalOutcome,
  recordPersonalPlan,
} from "../lib/personal-assistant-store";

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
  { id: "p1", domain: "PRODUCTIVITY", title: "Personal weekly planning", score: 6.8 },
  { id: "p2", domain: "PRODUCTIVITY", title: "Priority matrix", score: 4.1 },
]);
const WEAK = fakeSearch([{ id: "w1", domain: "MISC", title: "noise", score: 0.3 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetPersonalAssistantStoreForTests();
});

describe("personal assistant validation", () => {
  it("rejects missing request", async () => {
    await expect(planPersonal({ request: "" }, { search: STRONG })).rejects.toBeInstanceOf(
      PersonalAssistantError,
    );
  });
});

describe("personal assistant plan + authority", () => {
  it("returns ACTIONABLE plan for strong evidence", async () => {
    const p = await planPersonal(
      { request: "organize weekly priorities", context: "PRODUCTIVITY" },
      { search: STRONG },
    );
    expect(p.verdict).toBe("ACTIONABLE");
    expect(p.authorityLevel).toBe("A1");
    expect(p.authorityDecision).toBe("GRANTED");
    expect(p.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("FINANCE context upgrades authority to A2", async () => {
    const p = await planPersonal(
      { request: "budget planning", context: "FINANCE" },
      { search: STRONG },
    );
    expect(p.authorityLevel).toBe("A2");
    expect(p.authorityDecision).toBe("GRANTED");
  });

  it("fails honest below threshold", async () => {
    const p = await planPersonal(
      { request: "unknown sparse request", context: "PERSONAL" },
      { search: WEAK },
    );
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.rationale).toContain("fail-honest");
  });

  it("handles no hits honestly", async () => {
    const p = await planPersonal({ request: "none", context: "PERSONAL" }, { search: NONE });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.evidence).toHaveLength(0);
    expect(p.evalScore).toBe(0);
  });

  it("keeps strict threshold", () => {
    expect(PERSONAL_RELEVANCE_THRESHOLD).toBe(1);
  });
});

describe("personal assistant persistence + feedback metric", () => {
  it("persists and reads back in honest UNPERSISTED fallback", async () => {
    const p1 = await planPersonal({ request: "task one", context: "PERSONAL" }, { search: STRONG });
    const p2 = await planPersonal({ request: "task two", context: "WELLNESS" }, { search: STRONG });
    const r1 = await recordPersonalPlan(p1);
    const r2 = await recordPersonalPlan(p2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const h = await getPersonalHistory({ limit: 10 });
    expect(h.count).toBe(2);
    expect(h.plans[0].id).toBe(r2.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const p1 = await recordPersonalPlan(
      await planPersonal({ request: "plan A", context: "PERSONAL" }, { search: STRONG }),
    );
    const p2 = await recordPersonalPlan(
      await planPersonal({ request: "plan B", context: "PERSONAL" }, { search: STRONG }),
    );
    await recordPersonalOutcome(p1.id, "COMPLETED", "done");
    await recordPersonalOutcome(p2.id, "ABANDONED", "dropped");
    const m = await getPersonalAccuracy("PERSONAL");
    expect(m.total).toBe(2);
    expect(m.resolved).toBe(2);
    expect(m.completed).toBe(1);
    expect(m.abandoned).toBe(1);
    expect(m.accuracy).toBe(0.5);
  });

  it("returns not found on unknown id", async () => {
    const r = await recordPersonalOutcome(99999, "COMPLETED");
    expect(r.found).toBe(false);
  });
});


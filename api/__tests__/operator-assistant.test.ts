import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  OPERATOR_RELEVANCE_THRESHOLD,
  OperatorAssistantError,
  actOperator,
} from "../lib/operator-assistant-engine";
import {
  __resetOperatorAssistantStoreForTests,
  getOperatorAccuracy,
  getOperatorHistory,
  recordOperatorAction,
  recordOperatorOutcome,
} from "../lib/operator-assistant-store";

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
  { id: "o1", domain: "OPERATIONS", title: "Incident triage guide", score: 6.5 },
  { id: "o2", domain: "OPERATIONS", title: "Rollback runbook", score: 4.2 },
]);
const WEAK = fakeSearch([{ id: "w1", domain: "MISC", title: "noise", score: 0.2 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetOperatorAssistantStoreForTests();
});

describe("operator assistant validation", () => {
  it("rejects missing incident", async () => {
    await expect(actOperator({ incident: "" }, { search: STRONG })).rejects.toBeInstanceOf(
      OperatorAssistantError,
    );
  });
});

describe("operator assistant action + authority", () => {
  it("returns ACTIONABLE action for strong evidence", async () => {
    const p = await actOperator(
      { incident: "api outage in primary region", domain: "INCIDENT" },
      { search: STRONG },
    );
    expect(p.verdict).toBe("ACTIONABLE");
    expect(p.authorityLevel).toBe("A2");
    expect(p.authorityDecision).toBe("GRANTED");
    expect(p.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest below threshold", async () => {
    const p = await actOperator({ incident: "unknown sparse incident" }, { search: WEAK });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.rationale).toContain("fail-honest");
  });

  it("handles no hits honestly", async () => {
    const p = await actOperator({ incident: "none", domain: "RELIABILITY" }, { search: NONE });
    expect(p.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(p.evidence).toHaveLength(0);
    expect(p.evalScore).toBe(0);
  });

  it("keeps strict threshold", () => {
    expect(OPERATOR_RELEVANCE_THRESHOLD).toBe(1);
  });
});

describe("operator assistant persistence + feedback metric", () => {
  it("persists and reads back in honest UNPERSISTED fallback", async () => {
    const p1 = await actOperator({ incident: "incident one", domain: "INCIDENT" }, { search: STRONG });
    const p2 = await actOperator({ incident: "incident two", domain: "COST" }, { search: STRONG });
    const r1 = await recordOperatorAction(p1);
    const r2 = await recordOperatorAction(p2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const h = await getOperatorHistory({ limit: 10 });
    expect(h.count).toBe(2);
    expect(h.actions[0].id).toBe(r2.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const p1 = await recordOperatorAction(
      await actOperator({ incident: "incident A", domain: "INCIDENT" }, { search: STRONG }),
    );
    const p2 = await recordOperatorAction(
      await actOperator({ incident: "incident B", domain: "INCIDENT" }, { search: STRONG }),
    );
    await recordOperatorOutcome(p1.id, "MITIGATED", "done");
    await recordOperatorOutcome(p2.id, "ESCALATED", "escalated");
    const m = await getOperatorAccuracy("INCIDENT");
    expect(m.total).toBe(2);
    expect(m.resolved).toBe(2);
    expect(m.mitigated).toBe(1);
    expect(m.escalated).toBe(1);
    expect(m.accuracy).toBe(0.5);
  });

  it("returns not found on unknown id", async () => {
    const r = await recordOperatorOutcome(99999, "MITIGATED");
    expect(r.found).toBe(false);
  });
});


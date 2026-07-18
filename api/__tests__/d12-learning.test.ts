import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import { appRouter } from "../router";
import {
  D12_RELEVANCE_THRESHOLD,
  D12LearningError,
  transitionD12,
} from "../lib/d12-learning-engine";
import {
  __resetD12LearningStoreForTests,
  getD12Accuracy,
  getD12History,
  recordD12Outcome,
  recordD12Transition,
} from "../lib/d12-learning-store";

const caller = appRouter.createCaller({} as any);

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
    hits: hits.map((h) => ({ ...h, snippet: `...${h.title}...` })),
  });
}

const STRONG = fakeSearch([
  { id: "d12-1", domain: "INTELLIGENCE", title: "learning state transitions", score: 5.3 },
]);
const WEAK = fakeSearch([{ id: "d12-w", domain: "MISC", title: "noise", score: 0.2 }]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetD12LearningStoreForTests();
});

describe("D12 learning validation", () => {
  it("rejects missing object id", async () => {
    await expect(
      transitionD12(
        {
          objectId: "",
          fromState: "VALIDATED",
          toState: "PATTERN",
          trigger: "PATTERN_DETECTED",
          rationale: "x",
        },
        { search: STRONG },
      ),
    ).rejects.toBeInstanceOf(D12LearningError);
  });
});

describe("D12 learning transition behavior", () => {
  it("returns ACTIONABLE transition for strong evidence", async () => {
    const d = await transitionD12(
      {
        objectId: "obj-1",
        fromState: "UNDERSTANDING",
        toState: "JUDGMENT",
        trigger: "CONSTITUTIONAL_VALIDATION",
        rationale: "validated seven-question gate",
      },
      { search: STRONG },
    );
    expect(d.verdict).toBe("ACTIONABLE");
    expect(d.authorityLevel).toBe("A2");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest when evidence is weak", async () => {
    const d = await transitionD12(
      {
        objectId: "obj-2",
        fromState: "VALIDATED",
        toState: "PATTERN",
        trigger: "PATTERN_DETECTED",
        rationale: "insufficient evidence transition",
      },
      { search: WEAK },
    );
    expect(D12_RELEVANCE_THRESHOLD).toBe(1);
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.rationale).toContain("fail-honest");
  });
});

describe("D12 learning store fallback", () => {
  it("persists and reads transition history in UNPERSISTED mode", async () => {
    const first = await recordD12Transition(
      await transitionD12(
        {
          objectId: "obj-a",
          fromState: "VALIDATED",
          toState: "PATTERN",
          trigger: "PATTERN_DETECTED",
          rationale: "first transition",
        },
        { search: STRONG },
      ),
    );
    const second = await recordD12Transition(
      await transitionD12(
        {
          objectId: "obj-a",
          fromState: "PATTERN",
          toState: "UNDERSTANDING",
          trigger: "UNDERSTANDING_LADDER",
          rationale: "second transition",
        },
        { search: STRONG },
      ),
    );
    expect(first.persistence).toBe("UNPERSISTED");
    expect(second.id).toBeGreaterThan(first.id);
    const history = await getD12History({ objectId: "obj-a", limit: 10 });
    expect(history.count).toBe(2);
    expect(history.transitions[0].id).toBe(second.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const one = await recordD12Transition(
      await transitionD12(
        {
          objectId: "obj-b",
          fromState: "UNDERSTANDING",
          toState: "JUDGMENT",
          trigger: "CONSTITUTIONAL_VALIDATION",
          rationale: "outcome one",
        },
        { search: STRONG },
      ),
    );
    const two = await recordD12Transition(
      await transitionD12(
        {
          objectId: "obj-c",
          fromState: "VALIDATED",
          toState: "PATTERN",
          trigger: "PATTERN_DETECTED",
          rationale: "outcome two",
        },
        { search: STRONG },
      ),
    );
    await recordD12Outcome(one.id, "CONFIRMED", "confirmed");
    await recordD12Outcome(two.id, "REJECTED", "rejected");
    const metric = await getD12Accuracy();
    expect(metric.total).toBe(2);
    expect(metric.resolved).toBe(2);
    expect(metric.confirmed).toBe(1);
    expect(metric.rejected).toBe(1);
    expect(metric.accuracy).toBe(0.5);
  });
});

describe("D12 learning router contract", () => {
  it("supports status/transition/history/recordOutcome/accuracy", async () => {
    const status = await caller.d12Learning.status();
    expect(status.persistenceConfigured).toBe(false);

    const t = await caller.d12Learning.transition({
      objectId: "obj-route",
      fromState: "VALIDATED",
      toState: "PATTERN",
      trigger: "PATTERN_DETECTED",
      rationale: "router-level transition",
      topK: 3,
    });
    expect(t.persistence).toBe("UNPERSISTED");
    expect(t.transition.id).toBeGreaterThan(0);

    const history = await caller.d12Learning.history({ objectId: "obj-route", limit: 10 });
    expect(history.count).toBeGreaterThan(0);

    await caller.d12Learning.recordOutcome({
      id: t.transition.id,
      outcome: "CONFIRMED",
      note: "confirmed",
    });
    const metric = await caller.d12Learning.accuracy({});
    expect(metric.resolved).toBeGreaterThan(0);
  });
});


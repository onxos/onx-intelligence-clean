import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import { appRouter } from "../router";
import {
  D14_RELEVANCE_THRESHOLD,
  D14CoordinationError,
  coordinateD14,
} from "../lib/d14-coordination-engine";
import {
  __resetD14CoordinationStoreForTests,
  getD14Accuracy,
  getD14History,
  recordD14Coordination,
  recordD14Outcome,
} from "../lib/d14-coordination-store";

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
  { id: "d14-1", domain: "ORCHESTRATION", title: "source routing and arbitration evidence", score: 4.7 },
]);
const WEAK = fakeSearch([{ id: "d14-w", domain: "MISC", title: "noise", score: 0.2 }]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetD14CoordinationStoreForTests();
});

describe("D14 coordination engine validation", () => {
  it("rejects missing topic", async () => {
    await expect(
      coordinateD14(
        { topic: "", context: "PLATFORM", route: "L6_PROCESS", conflictLevel: 3 },
        { search: STRONG },
      ),
    ).rejects.toBeInstanceOf(D14CoordinationError);
  });
});

describe("D14 coordination engine behavior", () => {
  it("returns ACTIONABLE and auto-executable on strong evidence", async () => {
    const d = await coordinateD14(
      { topic: "route multi-context decision", context: "PLATFORM", route: "L6_PROCESS", conflictLevel: 3 },
      { search: STRONG },
    );
    expect(d.verdict).toBe("ACTIONABLE");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest for weak evidence", async () => {
    const d = await coordinateD14(
      { topic: "ambiguous routing", context: "ANALYST", route: "L7_EXTERNAL", conflictLevel: 6 },
      { search: WEAK },
    );
    expect(D14_RELEVANCE_THRESHOLD).toBe(1);
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.status).toBe("REQUIRES_APPROVAL");
    expect(d.rationale).toContain("fail-honest");
  });
});

describe("D14 coordination store fallback", () => {
  it("persists and reads history in UNPERSISTED mode", async () => {
    const first = await recordD14Coordination(
      await coordinateD14(
        { topic: "decision one", context: "PLATFORM", route: "L6_PROCESS", conflictLevel: 3 },
        { search: STRONG },
      ),
    );
    const second = await recordD14Coordination(
      await coordinateD14(
        { topic: "decision two", context: "ANALYST", route: "L5_REALITY", conflictLevel: 4 },
        { search: STRONG },
      ),
    );
    expect(first.persistence).toBe("UNPERSISTED");
    expect(second.id).toBeGreaterThan(first.id);
    const history = await getD14History({ limit: 10 });
    expect(history.count).toBe(2);
    expect(history.decisions[0].id).toBe(second.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const one = await recordD14Coordination(
      await coordinateD14(
        { topic: "outcome one", context: "PLATFORM", route: "L6_PROCESS", conflictLevel: 2 },
        { search: STRONG },
      ),
    );
    const two = await recordD14Coordination(
      await coordinateD14(
        { topic: "outcome two", context: "PLATFORM", route: "L6_PROCESS", conflictLevel: 2 },
        { search: STRONG },
      ),
    );
    await recordD14Outcome(one.id, "CONFIRMED", "validated");
    await recordD14Outcome(two.id, "REJECTED", "rejected");
    const metric = await getD14Accuracy("PLATFORM");
    expect(metric.total).toBe(2);
    expect(metric.resolved).toBe(2);
    expect(metric.confirmed).toBe(1);
    expect(metric.rejected).toBe(1);
    expect(metric.accuracy).toBe(0.5);
  });
});

describe("D14 coordination router contract", () => {
  it("supports status/coordinate/history/recordOutcome/accuracy", async () => {
    const status = await caller.d14Coordination.status();
    expect(status.persistenceConfigured).toBe(false);

    const mutation = await caller.d14Coordination.coordinate({
      topic: "route this decision",
      context: "PLATFORM",
      route: "L6_PROCESS",
      conflictLevel: 3,
      topK: 3,
    });
    expect(mutation.persistence).toBe("UNPERSISTED");
    expect(mutation.coordination.id).toBeGreaterThan(0);

    const history = await caller.d14Coordination.history({ limit: 10 });
    expect(history.count).toBeGreaterThan(0);

    await caller.d14Coordination.recordOutcome({
      id: mutation.coordination.id,
      outcome: "CONFIRMED",
      note: "confirmed",
    });
    const metric = await caller.d14Coordination.accuracy({ context: "PLATFORM" });
    expect(metric.resolved).toBeGreaterThan(0);
  });
});

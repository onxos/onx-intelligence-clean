import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import { appRouter } from "../router";
import {
  D11_RELEVANCE_THRESHOLD,
  D11FeedingError,
  feedD11,
} from "../lib/d11-feeding-engine";
import {
  __resetD11FeedingStoreForTests,
  getD11Accuracy,
  getD11History,
  recordD11Feed,
  recordD11Outcome,
} from "../lib/d11-feeding-store";

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
  { id: "d11-1", domain: "INTELLIGENCE", title: "founder intent feeding", score: 5.1 },
]);
const WEAK = fakeSearch([{ id: "d11-w", domain: "MISC", title: "noise", score: 0.2 }]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetD11FeedingStoreForTests();
});

describe("D11 feeding engine validation", () => {
  it("rejects missing content", async () => {
    await expect(feedD11({ content: "" }, { search: STRONG })).rejects.toBeInstanceOf(D11FeedingError);
  });
});

describe("D11 feeding engine behavior", () => {
  it("returns ACTIONABLE for strong evidence", async () => {
    const d = await feedD11(
      {
        content: "founder strategic direction",
        objectType: "SIGNAL",
        originSource: "L1_FOUNDER",
      },
      { search: STRONG },
    );
    expect(d.verdict).toBe("ACTIONABLE");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest for weak evidence", async () => {
    const d = await feedD11(
      {
        content: "ambiguous signal",
        objectType: "PATTERN",
        originSource: "L7_EXTERNAL",
      },
      { search: WEAK },
    );
    expect(D11_RELEVANCE_THRESHOLD).toBe(1);
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.rationale).toContain("fail-honest");
    expect(d.suggestedLifecycle).toBe("RAW");
  });
});

describe("D11 feeding store fallback", () => {
  it("persists and reads history in UNPERSISTED mode", async () => {
    const first = await recordD11Feed(
      await feedD11(
        {
          content: "event one",
          objectType: "SIGNAL",
          originSource: "L1_FOUNDER",
        },
        { search: STRONG },
      ),
    );
    const second = await recordD11Feed(
      await feedD11(
        {
          content: "event two",
          objectType: "PATTERN",
          originSource: "L2_SIL",
        },
        { search: STRONG },
      ),
    );
    expect(first.persistence).toBe("UNPERSISTED");
    expect(second.id).toBeGreaterThan(first.id);
    const history = await getD11History({ limit: 10 });
    expect(history.count).toBe(2);
    expect(history.feeds[0].id).toBe(second.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const one = await recordD11Feed(
      await feedD11(
        {
          content: "outcome one",
          objectType: "SIGNAL",
          originSource: "L1_FOUNDER",
        },
        { search: STRONG },
      ),
    );
    const two = await recordD11Feed(
      await feedD11(
        {
          content: "outcome two",
          objectType: "SIGNAL",
          originSource: "L2_SIL",
        },
        { search: STRONG },
      ),
    );
    await recordD11Outcome(one.id, "CONFIRMED", "validated");
    await recordD11Outcome(two.id, "REJECTED", "rejected");
    const metric = await getD11Accuracy("SIGNAL");
    expect(metric.total).toBe(2);
    expect(metric.resolved).toBe(2);
    expect(metric.confirmed).toBe(1);
    expect(metric.rejected).toBe(1);
    expect(metric.accuracy).toBe(0.5);
  });
});

describe("D11 feeding router contract", () => {
  it("supports status/feed/history/recordOutcome/accuracy", async () => {
    const status = await caller.d11Feeding.status();
    expect(status.persistenceConfigured).toBe(false);

    const feed = await caller.d11Feeding.feed({
      content: "route-level d11 feed",
      objectType: "UNDERSTANDING",
      originSource: "L1_FOUNDER",
      topK: 3,
    });
    expect(feed.persistence).toBe("UNPERSISTED");
    expect(feed.feed.id).toBeGreaterThan(0);

    const history = await caller.d11Feeding.history({ limit: 10 });
    expect(history.count).toBeGreaterThan(0);

    await caller.d11Feeding.recordOutcome({
      id: feed.feed.id,
      outcome: "CONFIRMED",
      note: "confirmed",
    });
    const metric = await caller.d11Feeding.accuracy({ objectType: "UNDERSTANDING" });
    expect(metric.resolved).toBeGreaterThan(0);
  });
});


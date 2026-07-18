import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import { appRouter } from "../router";
import {
  D13_RELEVANCE_THRESHOLD,
  D13CapitalError,
  capitalizeD13,
} from "../lib/d13-capital-engine";
import {
  __resetD13CapitalStoreForTests,
  getD13Accuracy,
  getD13History,
  recordD13Capital,
  recordD13Outcome,
} from "../lib/d13-capital-store";

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
  { id: "d13-1", domain: "CAPITAL", title: "capital formation evidence", score: 6.2 },
]);
const WEAK = fakeSearch([{ id: "d13-w", domain: "MISC", title: "noise", score: 0.2 }]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetD13CapitalStoreForTests();
});

describe("D13 capital validation", () => {
  it("rejects invalid amount", async () => {
    await expect(
      capitalizeD13(
        { signalId: "sig-1", amount: 0, rationale: "x" },
        { search: STRONG },
      ),
    ).rejects.toBeInstanceOf(D13CapitalError);
  });
});

describe("D13 capital behavior", () => {
  it("returns ACTIONABLE for grounded capital signal", async () => {
    const d = await capitalizeD13(
      {
        signalId: "sig-1",
        amount: 35,
        category: "WISDOM",
        rationale: "convert to institutional wisdom capital",
      },
      { search: STRONG },
    );
    expect(d.verdict).toBe("ACTIONABLE");
    expect(d.authorityLevel).toBe("A2");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest when evidence is weak", async () => {
    const d = await capitalizeD13(
      {
        signalId: "sig-2",
        amount: 20,
        category: "PROCESS",
        rationale: "low confidence capitalization",
      },
      { search: WEAK },
    );
    expect(D13_RELEVANCE_THRESHOLD).toBe(1);
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.rationale).toContain("fail-honest");
  });
});

describe("D13 capital store fallback", () => {
  it("persists and reads history in UNPERSISTED mode", async () => {
    const first = await recordD13Capital(
      await capitalizeD13(
        {
          signalId: "sig-a",
          amount: 15,
          category: "PATTERN",
          rationale: "first capital record",
        },
        { search: STRONG },
      ),
    );
    const second = await recordD13Capital(
      await capitalizeD13(
        {
          signalId: "sig-b",
          amount: 22,
          category: "UNDERSTANDING",
          rationale: "second capital record",
        },
        { search: STRONG },
      ),
    );
    expect(first.persistence).toBe("UNPERSISTED");
    expect(second.id).toBeGreaterThan(first.id);
    const history = await getD13History({ limit: 10 });
    expect(history.count).toBe(2);
    expect(history.records[0].id).toBe(second.id);
  });

  it("records outcomes and recomputes accuracy", async () => {
    const one = await recordD13Capital(
      await capitalizeD13(
        {
          signalId: "sig-x",
          amount: 40,
          category: "WISDOM",
          rationale: "outcome one",
        },
        { search: STRONG },
      ),
    );
    const two = await recordD13Capital(
      await capitalizeD13(
        {
          signalId: "sig-y",
          amount: 28,
          category: "JUDGMENT",
          rationale: "outcome two",
        },
        { search: STRONG },
      ),
    );
    await recordD13Outcome(one.id, "CONFIRMED", "confirmed");
    await recordD13Outcome(two.id, "REJECTED", "rejected");
    const metric = await getD13Accuracy();
    expect(metric.total).toBe(2);
    expect(metric.resolved).toBe(2);
    expect(metric.confirmed).toBe(1);
    expect(metric.rejected).toBe(1);
    expect(metric.accuracy).toBe(0.5);
  });
});

describe("D13 capital router contract", () => {
  it("supports status/capitalize/history/recordOutcome/accuracy", async () => {
    const status = await caller.d13Capital.status();
    expect(status.persistenceConfigured).toBe(false);

    const capital = await caller.d13Capital.capitalize({
      signalId: "sig-route",
      amount: 35,
      category: "WISDOM",
      rationale: "router capital request",
      topK: 3,
    });
    expect(capital.persistence).toBe("UNPERSISTED");
    expect(capital.capital.id).toBeGreaterThan(0);

    const history = await caller.d13Capital.history({ limit: 10 });
    expect(history.count).toBeGreaterThan(0);

    await caller.d13Capital.recordOutcome({
      id: capital.capital.id,
      outcome: "CONFIRMED",
      note: "confirmed",
    });
    const metric = await caller.d13Capital.accuracy({});
    expect(metric.resolved).toBeGreaterThan(0);
  });
});


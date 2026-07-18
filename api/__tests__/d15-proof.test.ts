import { beforeEach, describe, expect, it } from "vitest";
import type { CorpusSearchResult } from "../lib/corpus-search";
import { appRouter } from "../router";
import {
  D15_RELEVANCE_THRESHOLD,
  D15ProofError,
  verifyD15,
} from "../lib/d15-proof-engine";
import {
  __resetD15ProofStoreForTests,
  getD15Accuracy,
  getD15History,
  recordD15Outcome,
  recordD15Verification,
} from "../lib/d15-proof-store";

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
  { id: "d15-1", domain: "PROOF", title: "proof criteria and fault recovery evidence", score: 4.9 },
]);
const WEAK = fakeSearch([{ id: "d15-w", domain: "MISC", title: "noise", score: 0.1 }]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetD15ProofStoreForTests();
});

describe("D15 proof engine validation", () => {
  it("rejects missing suiteId", async () => {
    await expect(
      verifyD15(
        { suiteId: "", mode: "CRITERIA", target: "proof target", stressLevel: 2 },
        { search: STRONG },
      ),
    ).rejects.toBeInstanceOf(D15ProofError);
  });
});

describe("D15 proof engine behavior", () => {
  it("returns ACTIONABLE on strong evidence", async () => {
    const d = await verifyD15(
      { suiteId: "D15-S7-001", mode: "CRITERIA", target: "proof suite readiness", stressLevel: 2 },
      { search: STRONG },
    );
    expect(d.verdict).toBe("ACTIONABLE");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
  });

  it("fails honest when below threshold", async () => {
    const d = await verifyD15(
      { suiteId: "D15-S7-002", mode: "FAULT", target: "ambiguous proof", stressLevel: 8 },
      { search: WEAK },
    );
    expect(D15_RELEVANCE_THRESHOLD).toBe(1);
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.status).toBe("REQUIRES_APPROVAL");
    expect(d.rationale).toContain("fail-honest");
  });
});

describe("D15 proof store fallback", () => {
  it("persists and reads history in UNPERSISTED mode", async () => {
    const first = await recordD15Verification(
      await verifyD15(
        { suiteId: "D15-S7-101", mode: "CRITERIA", target: "decision one", stressLevel: 2 },
        { search: STRONG },
      ),
    );
    const second = await recordD15Verification(
      await verifyD15(
        { suiteId: "D15-S7-102", mode: "STRESS", target: "decision two", stressLevel: 4 },
        { search: STRONG },
      ),
    );
    expect(first.persistence).toBe("UNPERSISTED");
    expect(second.id).toBeGreaterThan(first.id);
    const history = await getD15History({ limit: 10 });
    expect(history.count).toBe(2);
    expect(history.verifications[0].id).toBe(second.id);
  });

  it("records outcomes and computes accuracy", async () => {
    const one = await recordD15Verification(
      await verifyD15(
        { suiteId: "D15-S7-201", mode: "CRITERIA", target: "outcome one", stressLevel: 2 },
        { search: STRONG },
      ),
    );
    const two = await recordD15Verification(
      await verifyD15(
        { suiteId: "D15-S7-202", mode: "CRITERIA", target: "outcome two", stressLevel: 2 },
        { search: STRONG },
      ),
    );
    await recordD15Outcome(one.id, "CONFIRMED", "validated");
    await recordD15Outcome(two.id, "REJECTED", "rejected");
    const metric = await getD15Accuracy("CRITERIA");
    expect(metric.total).toBe(2);
    expect(metric.resolved).toBe(2);
    expect(metric.confirmed).toBe(1);
    expect(metric.rejected).toBe(1);
    expect(metric.accuracy).toBe(0.5);
  });
});

describe("D15 proof router contract", () => {
  it("supports status/verify/history/recordOutcome/accuracy", async () => {
    const status = await caller.d15Proof.status();
    expect(status.persistenceConfigured).toBe(false);

    const verification = await caller.d15Proof.verify({
      suiteId: "D15-S7-301",
      mode: "CRITERIA",
      target: "router level proof",
      stressLevel: 3,
      topK: 3,
    });
    expect(verification.persistence).toBe("UNPERSISTED");
    expect(verification.verification.id).toBeGreaterThan(0);

    const history = await caller.d15Proof.history({ limit: 10 });
    expect(history.count).toBeGreaterThan(0);

    await caller.d15Proof.recordOutcome({
      id: verification.verification.id,
      outcome: "CONFIRMED",
      note: "confirmed",
    });
    const metric = await caller.d15Proof.accuracy({ mode: "CRITERIA" });
    expect(metric.resolved).toBeGreaterThan(0);
  });
});

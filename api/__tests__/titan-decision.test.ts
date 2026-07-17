// ============================================================
// TITAN DECISION ENGINE (Phase P) — deterministic tests
// Covers the six operational properties without a DB (memory mode):
// tool-grounded decision, honest refusal, authority classification,
// deterministic fingerprint/eval, durable read-back, outcome feedback
// recomputing the evaluation metric.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  decideTitan,
  computeTitanEvalScore,
  TitanEngineError,
  TITAN_RELEVANCE_THRESHOLD,
} from "../lib/titan-engine";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  __resetTitanDecisionStoreForTests,
  recordTitanDecision,
  getTitanDecisions,
  getTitanDecisionById,
  recordTitanOutcome,
  getTitanAccuracy,
} from "../lib/titan-decision-store";

function fakeSearch(hits: Array<{ id: string; domain: string; title: string; score: number }>) {
  return async (_q: string, _o?: { domain?: string; limit?: number; offset?: number }): Promise<CorpusSearchResult> => ({
    engine: "BM25",
    k1: 1.2,
    b: 0.75,
    indexedDocs: hits.length,
    totalMatches: hits.length,
    hits: hits.map((h) => ({ ...h, snippet: `…${h.title}…` })),
  });
}

const STRONG = fakeSearch([
  { id: "d1", domain: "strategy", title: "Ten-year prosperity plan", score: 7.5 },
  { id: "d2", domain: "strategy", title: "Second-order effects", score: 4.2 },
]);
const WEAK = fakeSearch([{ id: "d9", domain: "misc", title: "unrelated", score: 0.3 }]);
const NONE = fakeSearch([]);

beforeEach(() => {
  delete process.env.DATABASE_URL; // force honest in-memory (UNPERSISTED) mode
  __resetTitanDecisionStoreForTests();
});

describe("titan-engine — validation (fail-closed)", () => {
  it("rejects an unknown titan id", async () => {
    await expect(
      decideTitan({ titanId: "loki", subject: "x", query: "y" }, { search: STRONG }),
    ).rejects.toBeInstanceOf(TitanEngineError);
  });

  it("rejects a missing subject", async () => {
    await expect(
      decideTitan({ titanId: "athena", subject: "", query: "y" }, { search: STRONG }),
    ).rejects.toThrow(/MISSING_SUBJECT/);
  });

  it("rejects a missing query", async () => {
    await expect(
      decideTitan({ titanId: "athena", subject: "x", query: "  " }, { search: STRONG }),
    ).rejects.toThrow(/MISSING_QUERY/);
  });
});

describe("titan-engine — tool-grounded decision + evaluation", () => {
  it("produces a GROUNDED decision from strong corpus evidence", async () => {
    const d = await decideTitan(
      { titanId: "prometheus", subject: "expand to a new market", query: "prosperity strategy" },
      { search: STRONG },
    );
    expect(d.verdict).toBe("GROUNDED");
    expect(d.evidence).toHaveLength(2);
    expect(d.evidence[0].id).toBe("d1");
    expect(d.evalScore).toBeGreaterThan(0);
    expect(d.evalScore).toBeLessThanOrEqual(1);
    // prometheus action authority A2 == ceiling → auto-eligible, granted
    expect(d.authorityLevel).toBe("A2");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
    expect(d.hasVeto).toBe(false);
    expect(d.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses honestly (INSUFFICIENT_EVIDENCE) below the relevance threshold", async () => {
    const d = await decideTitan(
      { titanId: "athena", subject: "obscure question", query: "no match" },
      { search: WEAK },
    );
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.rationale).toMatch(/رفض صادق|غير كافية/);
  });

  it("refuses when there are zero hits", async () => {
    const d = await decideTitan(
      { titanId: "zeus", subject: "empty", query: "nothing" },
      { search: NONE },
    );
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.evidence).toHaveLength(0);
    expect(d.evalScore).toBe(0);
  });
});

describe("titan-engine — authorization (fail-closed above ceiling)", () => {
  it("apollo (A3, VETO) is REQUIRES_APPROVAL and DENIED without owner approval", async () => {
    const d = await decideTitan(
      { titanId: "apollo", subject: "block a policy", query: "governance compliance" },
      { search: STRONG },
    );
    expect(d.authorityLevel).toBe("A3");
    expect(d.status).toBe("REQUIRES_APPROVAL");
    expect(d.authorityDecision).toBe("DENIED");
    expect(d.hasVeto).toBe(true);
  });
});

describe("titan-engine — determinism", () => {
  it("two runs of the same input yield byte-identical fingerprints", async () => {
    const a = await decideTitan(
      { titanId: "hermes", subject: "ship the release", query: "operations execution" },
      { search: STRONG },
    );
    const b = await decideTitan(
      { titanId: "hermes", subject: "ship the release", query: "operations execution" },
      { search: STRONG },
    );
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.evalScore).toBe(b.evalScore);
  });

  it("computeTitanEvalScore is monotonic and bounded", () => {
    expect(computeTitanEvalScore(0)).toBe(0);
    expect(computeTitanEvalScore(-5)).toBe(0);
    const lo = computeTitanEvalScore(1);
    const hi = computeTitanEvalScore(10);
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeLessThanOrEqual(1);
    // relevance threshold produces a positive, sub-1 score
    expect(computeTitanEvalScore(TITAN_RELEVANCE_THRESHOLD)).toBeGreaterThan(0);
  });
});

describe("titan-decision-store — durable memory + read-back (UNPERSISTED)", () => {
  it("persists a decision and reads it back newest-first", async () => {
    const d1 = await decideTitan(
      { titanId: "athena", subject: "schema A", query: "knowledge graph" },
      { search: STRONG },
    );
    const d2 = await decideTitan(
      { titanId: "athena", subject: "schema B", query: "ontology design" },
      { search: STRONG },
    );
    const r1 = await recordTitanDecision(d1);
    const r2 = await recordTitanDecision(d2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);

    const hist = await getTitanDecisions({ titanId: "athena" });
    expect(hist.count).toBe(2);
    expect(hist.decisions[0].id).toBe(r2.id); // newest first
    expect(hist.decisions[0].subject).toBe("schema B");
    expect(hist.decisions[0].outcome).toBe("PENDING");

    const byId = await getTitanDecisionById(r1.id);
    expect(byId?.subject).toBe("schema A");
  });

  it("filters history by titan id", async () => {
    await recordTitanDecision(
      await decideTitan({ titanId: "zeus", subject: "z", query: "architecture" }, { search: STRONG }),
    );
    await recordTitanDecision(
      await decideTitan({ titanId: "hermes", subject: "h", query: "operations" }, { search: STRONG }),
    );
    const zeus = await getTitanDecisions({ titanId: "zeus" });
    expect(zeus.count).toBe(1);
    expect(zeus.decisions[0].titanId).toBe("zeus");
  });
});

describe("titan-decision-store — outcome feedback recomputes evaluation metric", () => {
  it("CONFIRMED then REJECTED update accuracy deterministically", async () => {
    const a = await recordTitanDecision(
      await decideTitan({ titanId: "hermes", subject: "task A", query: "operations" }, { search: STRONG }),
    );
    const b = await recordTitanDecision(
      await decideTitan({ titanId: "hermes", subject: "task B", query: "operations" }, { search: STRONG }),
    );

    let acc = await getTitanAccuracy("hermes");
    expect(acc.total).toBe(2);
    expect(acc.resolved).toBe(0);
    expect(acc.pending).toBe(2);
    expect(acc.accuracy).toBe(0); // never NaN

    const c = await recordTitanOutcome(a.id, "CONFIRMED", "worked");
    expect(c.found).toBe(true);
    expect(c.decision?.outcome).toBe("CONFIRMED");
    acc = await getTitanAccuracy("hermes");
    expect(acc.confirmed).toBe(1);
    expect(acc.accuracy).toBe(1);

    await recordTitanOutcome(b.id, "REJECTED", "did not");
    acc = await getTitanAccuracy("hermes");
    expect(acc.confirmed).toBe(1);
    expect(acc.rejected).toBe(1);
    expect(acc.resolved).toBe(2);
    expect(acc.accuracy).toBe(0.5);
  });

  it("outcome on an unknown id reports not-found", async () => {
    const res = await recordTitanOutcome(99999, "CONFIRMED");
    expect(res.found).toBe(false);
  });

  it("does not overwrite an already-resolved decision (fail-closed)", async () => {
    const a = await recordTitanDecision(
      await decideTitan({ titanId: "athena", subject: "once", query: "knowledge" }, { search: STRONG }),
    );
    await recordTitanOutcome(a.id, "CONFIRMED", "first");
    const second = await recordTitanOutcome(a.id, "REJECTED", "second");
    expect(second.found).toBe(true);
    expect(second.decision?.outcome).toBe("CONFIRMED"); // unchanged
    expect(second.decision?.outcomeNote).toBe("first");
  });
});

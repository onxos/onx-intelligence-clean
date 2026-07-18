// ============================================================
// ALLOCATION ENGINE (D13.5) — UNIT TESTS (M6)
// Covers APS scoring, P1 continuity override, mode selection,
// and detection of each of the 7 failure patterns.
// ============================================================
import { beforeEach, describe, it, expect } from "vitest";
import { appRouter } from "../router";
import type { CorpusSearchResult } from "../lib/corpus-search";
import {
  computeAPS,
  resolvePriority,
  selectMode,
  detectFailures,
  allocate,
  APS_DIMENSIONS,
  PRIORITIES,
  ALLOCATION_MODES,
  FAILURE_PATTERNS,
} from "../allocation-engine";
import {
  ALLOCATION_RELEVANCE_THRESHOLD,
  AllocationDurableError,
  decideDurableAllocation,
} from "../lib/allocation-durable-engine";
import {
  __resetAllocationDurableStoreForTests,
  getAllocationAccuracy,
  getAllocationHistory,
  recordAllocationDecision,
  recordAllocationOutcome,
} from "../lib/allocation-durable-store";

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
    hits: hits.map((h) => ({ ...h, snippet: `…${h.title}…` })),
  });
}

const STRONG = fakeSearch([
  { id: "d13-1", domain: "ALLOCATION", title: "portfolio allocation evidence", score: 4.2 },
]);
const WEAK = fakeSearch([{ id: "d13-w", domain: "MISC", title: "noise", score: 0.2 }]);

beforeEach(() => {
  delete process.env.DATABASE_URL;
  __resetAllocationDurableStoreForTests();
});

describe("Allocation — APS scoring", () => {
  it("has 6 dimensions and scores 1.0 when all maxed", () => {
    expect(APS_DIMENSIONS).toHaveLength(6);
    expect(computeAPS({ FI: 1, CS: 1, FA: 1, CM: 1, RC: 1, WL: 1 })).toBe(1);
  });

  it("weights founder-intent and continuity most", () => {
    const fi = computeAPS({ FI: 1 });
    const wl = computeAPS({ WL: 1 });
    expect(fi).toBeGreaterThan(wl);
  });
});

describe("Allocation — P1-P7 priorities", () => {
  it("has 7 priorities with P1 = continuity", () => {
    expect(PRIORITIES).toHaveLength(7);
    expect(PRIORITIES[0].id).toBe("P1");
  });

  it("continuity (P1) overrides everything", () => {
    expect(resolvePriority(["P5", "P1", "P3"])).toBe("P1");
    expect(resolvePriority(["P6", "P4"])).toBe("P4");
    expect(resolvePriority([])).toBeNull();
  });
});

describe("Allocation — 5 modes", () => {
  it("has the 5 modes", () => {
    expect(ALLOCATION_MODES).toHaveLength(5);
  });

  it("continuity risk forces preservation", () => {
    expect(selectMode({ continuityRisk: true, newOpportunity: true })).toBe("PRESERVATION");
  });

  it("routes other signals to their modes", () => {
    expect(selectMode({ transformationReady: true })).toBe("EVOLUTION");
    expect(selectMode({ crossDomainNeed: true })).toBe("TRANSFER");
    expect(selectMode({ newOpportunity: true })).toBe("EXPANSION");
    expect(selectMode({ provenHighValue: true })).toBe("REINFORCEMENT");
    expect(selectMode({})).toBe("REINFORCEMENT");
  });
});

describe("Allocation — 7 failure patterns", () => {
  it("names all 7", () => {
    expect(FAILURE_PATTERNS).toHaveLength(7);
  });

  it("detects hoarding", () => {
    const f = detectFailures({ preservationRatio: 0.9, expansionRatio: 0.02 });
    expect(f.map((x) => x.pattern)).toContain("HOARDING");
  });

  it("detects fragmentation", () => {
    const f = detectFailures({ numAllocations: 15, maxDomainShare: 0.05 });
    expect(f.map((x) => x.pattern)).toContain("FRAGMENTATION");
  });

  it("detects concentration", () => {
    const f = detectFailures({ maxDomainShare: 0.8 });
    expect(f.map((x) => x.pattern)).toContain("CONCENTRATION");
  });

  it("detects fashion and drift", () => {
    const f = detectFailures({ churnRate: 0.7, driftFromIntent: 0.5 }).map((x) => x.pattern);
    expect(f).toContain("FASHION");
    expect(f).toContain("DRIFT");
  });

  it("detects false compounding", () => {
    const f = detectFailures({ claimedCompounding: true, momentum: 0.1 });
    expect(f.map((x) => x.pattern)).toContain("FALSE_COMPOUNDING");
  });

  it("detects paralysis", () => {
    const f = detectFailures({ actionRate: 0.05 });
    expect(f.map((x) => x.pattern)).toContain("PARALYSIS");
  });

  it("reports healthy when nothing triggers", () => {
    expect(detectFailures({ preservationRatio: 0.4, expansionRatio: 0.3, maxDomainShare: 0.3, actionRate: 0.8 })).toHaveLength(0);
  });
});

describe("Allocation router", () => {
  it("computes an integrated decision", async () => {
    const d = await caller.allocation.allocate({
      apsScores: { FI: 0.9, CS: 0.8 },
      priorities: ["P1", "P5"],
      signals: { continuityRisk: true },
      state: { preservationRatio: 0.5, actionRate: 0.7 },
    });
    expect(d.priority).toBe("P1");
    expect(d.mode).toBe("PRESERVATION");
    expect(d.aps).toBeGreaterThan(0);
    expect(d.healthy).toBe(true);
  });

  it("exposes reference constants", async () => {
    const r = await caller.allocation.reference();
    expect(r.economicLaws).toHaveLength(3);
    expect(r.objectives).toHaveLength(9);
    expect(r.transferPaths).toHaveLength(7);
  });
});

describe("Allocation durable engine (D13.5)", () => {
  it("rejects missing question", async () => {
    await expect(
      decideDurableAllocation(
        {
          question: "",
          request: {
            apsScores: { FI: 0.5 },
            priorities: ["P1"],
            signals: {},
            state: {},
          },
        },
        { search: STRONG },
      ),
    ).rejects.toBeInstanceOf(AllocationDurableError);
  });

  it("returns ACTIONABLE on strong grounded evidence", async () => {
    const d = await decideDurableAllocation(
      {
        question: "how should we allocate now",
        request: {
          apsScores: { FI: 0.9, CS: 0.8 },
          priorities: ["P1"],
          signals: { continuityRisk: true },
          state: { actionRate: 0.8 },
        },
      },
      { search: STRONG },
    );
    expect(d.verdict).toBe("ACTIONABLE");
    expect(d.authorityDecision).toBe("GRANTED");
    expect(d.status).toBe("EXECUTED_ELIGIBLE");
    expect(d.executionPolicy).toBe("AUTO_EXECUTE");
  });

  it("fails honest when below threshold", async () => {
    const d = await decideDurableAllocation(
      {
        question: "sparse uncertain request",
        request: {
          apsScores: { FI: 0.3 },
          priorities: ["P6"],
          signals: {},
          state: {},
        },
      },
      { search: WEAK },
    );
    expect(ALLOCATION_RELEVANCE_THRESHOLD).toBe(1);
    expect(d.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(d.status).toBe("REQUIRES_APPROVAL");
    expect(d.executionPolicy).toBe("HUMAN_REVIEW_REQUIRED");
    expect(d.rationale).toContain("fail-honest");
  });
});

describe("Allocation durable store", () => {
  it("persists in honest UNPERSISTED mode and returns history", async () => {
    const d1 = await decideDurableAllocation(
      {
        question: "allocation one",
        request: { apsScores: { FI: 0.6 }, priorities: ["P4"], signals: {}, state: {} },
      },
      { search: STRONG },
    );
    const d2 = await decideDurableAllocation(
      {
        question: "allocation two",
        request: { apsScores: { FI: 0.7 }, priorities: ["P5"], signals: {}, state: {} },
      },
      { search: STRONG },
    );
    const r1 = await recordAllocationDecision(d1);
    const r2 = await recordAllocationDecision(d2);
    expect(r1.persistence).toBe("UNPERSISTED");
    expect(r2.id).toBeGreaterThan(r1.id);
    const h = await getAllocationHistory({ limit: 10 });
    expect(h.count).toBe(2);
    expect(h.decisions[0].id).toBe(r2.id);
  });

  it("records outcomes and computes accuracy", async () => {
    const first = await recordAllocationDecision(
      await decideDurableAllocation(
        {
          question: "outcome one",
          request: { apsScores: { FI: 0.9 }, priorities: ["P1"], signals: {}, state: {} },
        },
        { search: STRONG },
      ),
    );
    const second = await recordAllocationDecision(
      await decideDurableAllocation(
        {
          question: "outcome two",
          request: { apsScores: { FI: 0.9 }, priorities: ["P2"], signals: {}, state: {} },
        },
        { search: STRONG },
      ),
    );
    await recordAllocationOutcome(first.id, "CONFIRMED", "good");
    await recordAllocationOutcome(second.id, "REJECTED", "bad");
    const a = await getAllocationAccuracy();
    expect(a.total).toBe(2);
    expect(a.resolved).toBe(2);
    expect(a.confirmed).toBe(1);
    expect(a.rejected).toBe(1);
    expect(a.accuracy).toBe(0.5);
  });
});

describe("Allocation durable router", () => {
  it("exposes durable status and supports decide/history/accuracy/outcome", async () => {
    const status = await caller.allocation.status();
    expect(status.persistenceConfigured).toBe(false);
    expect(status.failClosedRules).toContain("INSUFFICIENT_EVIDENCE=>REQUIRES_APPROVAL");

    const decided = await caller.allocation.decide({
      question: "route D13.5 allocation",
      request: {
        apsScores: { FI: 0.85, CS: 0.8 },
        priorities: ["P1", "P3"],
        signals: { continuityRisk: true },
        state: { actionRate: 0.9 },
      },
      topK: 3,
    });
    expect(decided.persistence).toBe("UNPERSISTED");
    expect(decided.decision.id).toBeGreaterThan(0);
    expect(decided.decision.executionPolicy).toBe("AUTO_EXECUTE");

    const history = await caller.allocation.history({ limit: 10 });
    expect(history.count).toBeGreaterThan(0);

    await caller.allocation.recordOutcome({
      id: decided.decision.id,
      outcome: "CONFIRMED",
      note: "validated",
    });
    const accuracy = await caller.allocation.accuracy();
    expect(accuracy.resolved).toBeGreaterThan(0);
  });
});

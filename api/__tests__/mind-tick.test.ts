// ============================================================
// MIND TICK — UNIT TESTS (G6 "living mind cycle")
// Mock-pg pattern shared with perception-adapter.test.ts.
// Covers: contract replay (B8) at read, row→RawInput transform,
// full cycle inbox→B5 contradictions→B7 suggestions, independent
// cursor (never corrupts the perception adapter's), malformed-row
// fail-closed skip, restart determinism, pg-failure silent skip,
// no-execution guarantee (autoExecutable=false, A1 ceiling), and
// the mindTick tRPC surface.
// ============================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg before importing the store
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

import { appRouter } from "../router";
import { __resetForTests } from "../lib/platform-inbox-store";
import { __resetBridgeContractsForTests } from "../lib/bridge-contracts";
import {
  runPerceptionSyncTick,
  getPerceptionAdapterStatus,
  __resetPerceptionAdapterForTests,
  __setIngestFnForTests,
} from "../lib/perception-adapter";
import {
  MIND_TICK_BATCH_LIMIT,
  MIND_TICK_SOURCE_CONFIDENCE,
  MIND_TICK_PATTERN_MIN,
  MIND_TICK_PATTERN_STRUCTURAL_THRESHOLD,
  replayContract,
  toMindInput,
  runMindTick,
  getMindTickStatus,
  getLastMindTickResult,
  __resetMindTickForTests,
} from "../lib/mind-tick";
import { SUGGESTION_CEILING } from "../lib/zero-input";
import type { PerceptionSourceRow } from "../lib/platform-inbox-store";

const caller = appRouter.createCaller({} as never);

const FIXED_CLOCK = () => new Date("2026-07-12T10:00:00.000Z");

const ddlResult = { rows: [], rowCount: 0 };

function mockSchemaCalls() {
  // 4 DDL statements: table + 3 indexes
  queryMock
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult);
}

function rawRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "1",
    source: "platform",
    event_id: "42",
    event_type: "crm.appointment.completed",
    aggregate_type: "appointment",
    aggregate_id: "apt-1",
    occurred_at: "2026-07-01T12:00:00.000Z",
    received_at: "2026-07-01T12:00:01.000Z",
    payload_keys: ["patientId"],
    ...overrides,
  };
}

function sampleRow(overrides: Partial<PerceptionSourceRow> = {}): PerceptionSourceRow {
  return {
    id: 1,
    source: "platform",
    eventId: 42,
    eventType: "crm.appointment.completed",
    aggregateType: "appointment",
    aggregateId: "apt-1",
    occurredAt: "2026-07-01T12:00:00.000Z",
    receivedAt: "2026-07-01T12:00:01.000Z",
    payloadKeys: ["patientId"],
    ...overrides,
  };
}

// A batch that produces BOTH kinds of signals:
//   - rows 1+2: same aggregate, same instant, conflicting statuses
//     (completed vs noshow) → B5 FUNCTIONAL_CONFLICT, equal confidence
//     → UNRESOLVED → A2 REQUIRES_APPROVAL suggestion.
//   - rows 3-6: ops.monitor.alert × 4 (≥ MIND_TICK_PATTERN_MIN) on
//     distinct aggregates → EVENT_PATTERN below the structural
//     threshold → A1 AUTO_ELIGIBLE suggestion.
function signalBatch() {
  return [
    rawRow(),
    rawRow({ id: "2", event_id: "43", event_type: "crm.appointment.noshow" }),
    rawRow({ id: "3", event_id: "50", event_type: "ops.monitor.alert", aggregate_type: "monitor", aggregate_id: "m-1" }),
    rawRow({ id: "4", event_id: "51", event_type: "ops.monitor.alert", aggregate_type: "monitor", aggregate_id: "m-2" }),
    rawRow({ id: "5", event_id: "52", event_type: "ops.monitor.alert", aggregate_type: "monitor", aggregate_id: "m-3" }),
    rawRow({ id: "6", event_id: "53", event_type: "ops.monitor.alert", aggregate_type: "monitor", aggregate_id: "m-4" }),
  ];
}

beforeEach(() => {
  __resetForTests();
  __resetPerceptionAdapterForTests();
  __resetMindTickForTests();
  __resetBridgeContractsForTests();
  queryMock.mockReset();
  process.env.PLATFORM_INBOX_DATABASE_URL = "postgres://test:test@localhost:5432/onx";
});

describe("replayContract (B8 reuse at read time)", () => {
  it("admits a real institutional row through the SAME validateEvent contract", () => {
    const v = replayContract(sampleRow());
    expect(v.valid).toBe(true);
    expect(v.eventType).toBe("crm.appointment.completed");
    expect(v.version).toBe(1);
  });

  it("rejects unknown event types fail-closed (no contract → no entry)", () => {
    const v = replayContract(sampleRow({ eventType: "mystery.unknown.event" }));
    expect(v.valid).toBe(false);
    expect(v.errors[0].code).toBe("UNKNOWN_EVENT_TYPE");
  });

  it("rejects rows with missing identity fields via the contract, not copied checks", () => {
    const noAggregate = replayContract(sampleRow({ aggregateId: null }));
    expect(noAggregate.valid).toBe(false);
    expect(noAggregate.errors.some((e) => e.field === "aggregateId")).toBe(true);

    const noTime = replayContract(sampleRow({ occurredAt: null }));
    expect(noTime.valid).toBe(false);
    expect(noTime.errors.some((e) => e.field === "occurredAt")).toBe(true);
  });
});

describe("toMindInput (row → B5 RawInput transform)", () => {
  it("derives a deterministic idempotent id and an explicit triple", () => {
    const input = toMindInput(sampleRow());
    expect(input.id).toBe("mind-platform-42");
    expect(input.triple).toEqual({
      subject: "appointment#apt-1",
      predicate: "status-of",
      object: "completed",
    });
  });

  it("carries deterministic provenance derived only from event fields", () => {
    const input = toMindInput(sampleRow());
    expect(input.provenance).toEqual({
      source: "platform-inbox",
      method: "mind-tick",
      recordedAt: "2026-07-01T12:00:00.000Z",
      confidence: MIND_TICK_SOURCE_CONFIDENCE,
    });
  });

  it("scopes validity to the event instant so different moments coexist", () => {
    const input = toMindInput(sampleRow());
    expect(input.validityScope).toEqual({
      from: "2026-07-01T12:00:00.000Z",
      to: "2026-07-01T12:00:00.000Z",
    });
  });

  it("sanitizes exotic sources in the derived id", () => {
    const input = toMindInput(sampleRow({ source: "onx platform/v2" }));
    expect(input.id).toBe("mind-onx_platform_v2-42");
  });
});

describe("runMindTick (full cycle: inbox → B5 → B7)", () => {
  it("turns live inbox events into authority-classified suggestions", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });

    const result = await runMindTick(FIXED_CLOCK);

    expect(result.read).toBe(6);
    expect(result.valid).toBe(6);
    expect(result.skipped).toBe(0);
    expect(result.contradictions).toBe(1);
    expect(result.patterns).toEqual([
      { eventType: "ops.monitor.alert", count: 4, threshold: MIND_TICK_PATTERN_STRUCTURAL_THRESHOLD },
    ]);
    expect(result.signals).toBe(2);
    expect(result.insufficientData).toBe(false);
    expect(result.suggestions).toHaveLength(2);

    const contra = result.suggestions.find((s) => s.kind === "CONTRADICTION");
    const pattern = result.suggestions.find((s) => s.kind === "EVENT_PATTERN");
    // UNRESOLVED conflict needs a human (A2) → REQUIRES_APPROVAL
    expect(contra).toMatchObject({ requiredAuthority: "A2", status: "REQUIRES_APPROVAL" });
    // 4 alerts < structural threshold 10 → operational tuning (A1)
    expect(pattern).toMatchObject({ requiredAuthority: "A1", status: "AUTO_ELIGIBLE" });
  });

  it("NEVER executes: every suggestion is a proposal with autoExecutable=false + audit evidence", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });

    const result = await runMindTick(FIXED_CLOCK);

    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(s.autoExecutable).toBe(false);
      // Constitutional decision recorded on the real AuthorityGate chain (B3)
      expect(["GRANTED", "DENIED"]).toContain(s.decision);
      expect(typeof s.authoritySeq).toBe("number");
      expect(s.provenance).toMatchObject({ source: "platform-inbox", method: "mind-tick" });
    }
    expect(SUGGESTION_CEILING).toBe("A1");
  });

  it("keeps its own cursor and NEVER corrupts the perception adapter's", async () => {
    __setIngestFnForTests(async () => ({ stored: true }));
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });

    await runMindTick(FIXED_CLOCK);

    expect(getMindTickStatus().lastProcessedId).toBe(6);
    // mind-tick moved past id=6 — the perception cursor must be untouched
    expect(getPerceptionAdapterStatus().lastProcessedId).toBe(0);

    // Now the perception adapter reads its OWN full batch from id 0
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });
    await runPerceptionSyncTick();

    expect(getPerceptionAdapterStatus().lastProcessedId).toBe(1);
    // ...and the mind-tick cursor is equally untouched by the other feed
    expect(getMindTickStatus().lastProcessedId).toBe(6);

    // The perception adapter queried from ITS cursor (0), not mind-tick's (6)
    const perceptionCall = queryMock.mock.calls[5] as [string, unknown[]];
    expect(perceptionCall[1]).toEqual([0, 200]);
  });

  it("advances its cursor across ticks (no reprocessing within a process)", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });
    await runMindTick(FIXED_CLOCK);

    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await runMindTick(FIXED_CLOCK);

    const [, params] = queryMock.mock.calls[5] as [string, unknown[]];
    expect(params).toEqual([1, MIND_TICK_BATCH_LIMIT]);
    expect(getMindTickStatus().ticksTotal).toBe(2);
  });

  it("skips malformed rows fail-closed and advances past them", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({
      rows: [
        rawRow(), // valid
        rawRow({ id: "2", event_id: "60", event_type: "mystery.unknown.event" }), // no contract
        rawRow({ id: "3", event_id: "61", aggregate_id: null }), // missing identity
        rawRow({ id: "4", event_id: "62", occurred_at: null }), // missing timestamp
      ],
      rowCount: 4,
    });

    const result = await runMindTick(FIXED_CLOCK);

    expect(result.read).toBe(4);
    expect(result.valid).toBe(1);
    expect(result.skipped).toBe(3);
    // the cursor moved PAST the malformed rows — they never wedge the feed
    expect(getMindTickStatus().lastProcessedId).toBe(4);
    expect(getMindTickStatus().skippedTotal).toBe(3);
  });

  it("reports insufficient data when no contradiction or pattern emerges", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({
      rows: [
        rawRow(),
        rawRow({ id: "2", event_id: "43", event_type: "lab.result.created", aggregate_type: "lab", aggregate_id: "lab-1" }),
      ],
      rowCount: 2,
    });

    const result = await runMindTick(FIXED_CLOCK);

    expect(result.valid).toBe(2);
    expect(result.signals).toBe(0);
    expect(result.suggestions).toEqual([]);
    expect(result.insufficientData).toBe(true);
  });

  it("is deterministic on replay: same rows → identical suggestions", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });
    const first = await runMindTick(FIXED_CLOCK);

    // full restart: fresh cursor, fresh contracts, fresh inbox schema state
    __resetMindTickForTests();
    __resetForTests();
    __resetBridgeContractsForTests();
    queryMock.mockReset();
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });
    const second = await runMindTick(FIXED_CLOCK);

    expect(second.suggestions).toEqual(first.suggestions);
    expect(second.contradictions).toBe(first.contradictions);
    expect(second.patterns).toEqual(first.patterns);
    expect(second.ranAt).toBe(first.ranAt);
  });

  it("NEVER throws when pg is unavailable — silent skip with counters", async () => {
    queryMock.mockRejectedValue(new Error("connection refused"));

    await expect(runMindTick(FIXED_CLOCK)).resolves.toBeDefined();
    const status = getMindTickStatus();
    expect(status.ticksSkipped).toBe(1);
    expect(status.lastError).toContain("connection refused");
    expect(status.lastProcessedId).toBe(0);
    expect(status.suggestionsTotal).toBe(0);
  });

  it("requests at most the batch limit per tick (cycle budget)", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await runMindTick(FIXED_CLOCK);

    const [, params] = queryMock.mock.calls[4] as [string, unknown[]];
    expect(params?.[1]).toBe(MIND_TICK_BATCH_LIMIT);
    expect(MIND_TICK_BATCH_LIMIT).toBe(200);
    expect(MIND_TICK_PATTERN_MIN).toBe(3);
  });
});

describe("mindTick tRPC surface", () => {
  it("status exposes counters only — ceiling pinned at A1, no payload fields", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });
    await runMindTick(FIXED_CLOCK);

    const res = await caller.mindTick.status();

    expect(res).toMatchObject({
      lastProcessedId: 6,
      processedTotal: 6,
      validTotal: 6,
      skippedTotal: 0,
      contradictionsTotal: 1,
      patternsTotal: 1,
      suggestionsTotal: 2,
      requiresApprovalTotal: 1,
      autoEligibleTotal: 1,
      ticksTotal: 1,
      ticksSkipped: 0,
      batchLimit: MIND_TICK_BATCH_LIMIT,
      ceiling: "A1",
    });
    expect(typeof res.lastRunAt).toBe("string");
    expect(JSON.stringify(res)).not.toContain("payload");
  });

  it("last returns null before any tick, then the latest cycle result", async () => {
    expect(await caller.mindTick.last()).toBeNull();
    expect(getLastMindTickResult()).toBeNull();

    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: signalBatch(), rowCount: 6 });
    await runMindTick(FIXED_CLOCK);

    const last = await caller.mindTick.last();
    expect(last?.suggestions).toHaveLength(2);
    expect(last?.suggestions.every((s) => s.autoExecutable === false)).toBe(true);
  });

  it("tick runs one guarded cycle on demand and never throws on pg failure", async () => {
    queryMock.mockRejectedValue(new Error("boom"));

    const res = await caller.mindTick.tick();
    expect(res.suggestions).toEqual([]);
    expect(getMindTickStatus().ticksSkipped).toBe(1);
  });
});

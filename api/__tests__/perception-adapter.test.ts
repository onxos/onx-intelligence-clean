// ============================================================
// PERCEPTION ADAPTER — UNIT TESTS (Wave 5-b)
// Mock-pg pattern shared with platform-inbox.test.ts.
// Covers: row→PERCEPTION transform, idempotent ids, crash safety
// (pg failure + poison event), batch cap, cursor advance, replay
// after reset, and the HT-08 health counters.
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
import { listLiveObjects } from "../iuc-router";
import { getEventsAfterId, __resetForTests, type PerceptionSourceRow } from "../lib/platform-inbox-store";
import {
  PERCEPTION_BATCH_LIMIT,
  toPerceptionObject,
  runPerceptionSyncTick,
  getPerceptionAdapterStatus,
  __resetPerceptionAdapterForTests,
  __setIngestFnForTests,
} from "../lib/perception-adapter";

const caller = appRouter.createCaller({} as never);

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
    event_type: "payment.recorded",
    aggregate_type: "payment",
    aggregate_id: "pay-77",
    occurred_at: "2026-07-01T12:00:00.000Z",
    received_at: "2026-07-01T12:00:01.000Z",
    payload_keys: ["amount", "currency"],
    ...overrides,
  };
}

function sampleRow(overrides: Partial<PerceptionSourceRow> = {}): PerceptionSourceRow {
  return {
    id: 1,
    source: "platform",
    eventId: 42,
    eventType: "payment.recorded",
    aggregateType: "payment",
    aggregateId: "pay-77",
    occurredAt: "2026-07-01T12:00:00.000Z",
    receivedAt: "2026-07-01T12:00:01.000Z",
    payloadKeys: ["amount", "currency"],
    ...overrides,
  };
}

beforeEach(() => {
  __resetForTests();
  __resetPerceptionAdapterForTests();
  queryMock.mockReset();
  process.env.PLATFORM_INBOX_DATABASE_URL = "postgres://user:pass@localhost:5432/onx";
});

describe("platform-inbox-store.getEventsAfterId (cursor read)", () => {
  it("queries past the cursor with the batch limit and maps rows", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });

    const rows = await getEventsAfterId(0, 200);

    const [sql, params] = queryMock.mock.calls[4] as [string, unknown[]];
    expect(sql).toContain("WHERE id > $1");
    expect(sql).toContain("ORDER BY id ASC");
    expect(sql).toContain("LIMIT $2");
    // payload *keys* only — the raw payload column is never in the select list
    expect(sql).toContain("jsonb_object_keys");
    expect(sql).not.toMatch(/\bpayload\s*(,|AS\b)/i);
    expect(params).toEqual([0, 200]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      source: "platform",
      eventId: 42,
      eventType: "payment.recorded",
      aggregateType: "payment",
      aggregateId: "pay-77",
      payloadKeys: ["amount", "currency"],
    });
    expect(rows[0].occurredAt).toBe("2026-07-01T12:00:00.000Z");
  });

  it("clamps negative cursors and oversized limits", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await getEventsAfterId(-5, 9999);

    const [, params] = queryMock.mock.calls[4] as [string, unknown[]];
    expect(params).toEqual([0, 500]);
  });

  it("normalizes null payload_keys to an empty array", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [rawRow({ payload_keys: null })], rowCount: 1 });

    const rows = await getEventsAfterId(0);
    expect(rows[0].payloadKeys).toEqual([]);
  });
});

describe("toPerceptionObject (transform)", () => {
  it("derives an idempotent id from source+event_id and maps the shape", () => {
    const obj = toPerceptionObject(sampleRow());
    expect(obj).toMatchObject({
      id: "perc-platform-42",
      type: "PERCEPTION",
      rank: 1,
      verification: "CONFIRMED",
      sources: 1,
      trust: 0.8,
    });
    expect(obj.ageDays).toBeGreaterThanOrEqual(0);
  });

  it("summarizes with event type, aggregate and payload KEY NAMES only", () => {
    const obj = toPerceptionObject(sampleRow());
    expect(obj.contentText).toBe("platform-event payment.recorded on payment#pay-77 fields[amount,currency]");
  });

  it("sanitizes exotic sources and tolerates missing aggregate/payload", () => {
    const obj = toPerceptionObject(
      sampleRow({ source: "onx platform/v2", aggregateType: null, aggregateId: null, payloadKeys: [] }),
    );
    expect(obj.id).toBe("perc-onx_platform_v2-42");
    expect(obj.contentText).toBe("platform-event payment.recorded on unknown-entity");
  });

  it("caps the summary length and the number of listed keys", () => {
    const obj = toPerceptionObject(
      sampleRow({
        eventType: "x".repeat(400),
        payloadKeys: Array.from({ length: 30 }, (_, i) => `k${i}`),
      }),
    );
    expect(obj.contentText.length).toBeLessThanOrEqual(300);
    expect(obj.contentText).not.toContain("k12,");
  });

  it("computes ageDays from occurred_at and clamps future dates to 0", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(toPerceptionObject(sampleRow({ occurredAt: future })).ageDays).toBe(0);
    expect(toPerceptionObject(sampleRow({ occurredAt: null, receivedAt: null })).ageDays).toBe(0);
  });
});

describe("runPerceptionSyncTick (feed into the IUC graph)", () => {
  it("ingests inbox events as PERCEPTION objects via the real iuc.ingest path", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({
      rows: [rawRow(), rawRow({ id: "2", event_id: "43", event_type: "invoice.issued", aggregate_type: "invoice", aggregate_id: "inv-9", payload_keys: ["total"] })],
      rowCount: 2,
    });

    const status = await runPerceptionSyncTick();

    expect(status.lastProcessedId).toBe(2);
    expect(status.processedTotal).toBe(2);
    expect(status.perceptionsIngested).toBe(2);
    expect(status.eventsFailed).toBe(0);
    expect(status.ticksTotal).toBe(1);
    expect(status.ticksSkipped).toBe(0);
    expect(status.lastRunAt).not.toBeNull();

    const live = listLiveObjects();
    const p42 = live.find((o) => o.id === "perc-platform-42");
    const p43 = live.find((o) => o.id === "perc-platform-43");
    expect(p42).toMatchObject({ type: "PERCEPTION", rank: 1, verification: "CONFIRMED" });
    expect(p42?.contentText).toContain("payment.recorded");
    expect(p42?.contentText).toContain("fields[amount,currency]");
    expect(p43?.contentText).toContain("invoice.issued on invoice#inv-9");
  });

  it("is idempotent: re-ingesting the same event upserts the same graph node", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });
    await runPerceptionSyncTick();

    // Simulate a boot replay: cursor resets, same event arrives again
    __resetPerceptionAdapterForTests();
    mockSchemaCalls();
    __resetForTests();
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });
    await runPerceptionSyncTick();

    const matches = listLiveObjects().filter((o) => o.id === "perc-platform-42");
    expect(matches).toHaveLength(1);
  });

  it("advances the cursor across ticks (no reprocessing within a process)", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });
    await runPerceptionSyncTick();

    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const status = await runPerceptionSyncTick();

    const [, params] = queryMock.mock.calls[5] as [string, unknown[]];
    expect(params).toEqual([1, PERCEPTION_BATCH_LIMIT]);
    expect(status.processedTotal).toBe(1);
    expect(status.ticksTotal).toBe(2);
  });

  it("NEVER throws when pg is unavailable — silent skip with counters", async () => {
    queryMock.mockRejectedValue(new Error("connection refused"));

    await expect(runPerceptionSyncTick()).resolves.toBeDefined();
    const status = getPerceptionAdapterStatus();
    expect(status.ticksSkipped).toBe(1);
    expect(status.lastError).toContain("connection refused");
    expect(status.lastProcessedId).toBe(0);
    expect(status.perceptionsIngested).toBe(0);
  });

  it("NEVER throws when no connection string is configured at all", async () => {
    delete process.env.PLATFORM_INBOX_DATABASE_URL;
    const savedDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(runPerceptionSyncTick()).resolves.toBeDefined();
      expect(getPerceptionAdapterStatus().ticksSkipped).toBe(1);
      expect(getPerceptionAdapterStatus().lastError).toContain("PLATFORM_INBOX_DB_NOT_CONFIGURED");
    } finally {
      if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    }
  });

  it("a poison event is counted, skipped past, and does not wedge the feed", async () => {
    __setIngestFnForTests(async (input) => {
      if (input.id === "perc-platform-42") throw new Error("boom");
      return { stored: true };
    });
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({
      rows: [rawRow(), rawRow({ id: "2", event_id: "43" })],
      rowCount: 2,
    });

    const status = await runPerceptionSyncTick();

    expect(status.eventsFailed).toBe(1);
    expect(status.perceptionsIngested).toBe(1);
    expect(status.processedTotal).toBe(2);
    expect(status.lastProcessedId).toBe(2); // advanced past the poison event
    expect(status.lastError).toContain("boom");
  });

  it("requests at most the batch limit per tick", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await runPerceptionSyncTick();

    const [, params] = queryMock.mock.calls[4] as [string, unknown[]];
    expect(params?.[1]).toBe(PERCEPTION_BATCH_LIMIT);
    expect(PERCEPTION_BATCH_LIMIT).toBe(200);
  });
});

describe("health.perceptionAdapter (HT-08 counters)", () => {
  it("exposes counters only — no payload fields", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [rawRow()], rowCount: 1 });
    await runPerceptionSyncTick();

    const res = await caller.health.perceptionAdapter();

    expect(res).toMatchObject({
      lastProcessedId: 1,
      processedTotal: 1,
      perceptionsIngested: 1,
      eventsFailed: 0,
      ticksTotal: 1,
      ticksSkipped: 0,
      batchLimit: PERCEPTION_BATCH_LIMIT,
    });
    expect(typeof res.lastRunAt).toBe("string");
    expect(res.lastError).toBeNull();
    expect(JSON.stringify(res)).not.toContain("payload");
  });
});

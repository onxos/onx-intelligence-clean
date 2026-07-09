import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg before importing the store
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

import {
  getEventStats,
  getRecentEvents,
  getAggregateTimeline,
  __resetForTests,
} from "../lib/platform-inbox-store";

const ddlResult = { rows: [], rowCount: 0 };

function mockSchemaCalls() {
  // 4 DDL statements: table + 3 indexes
  queryMock
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult);
}

const sampleRow = {
  id: "12",
  source: "platform",
  event_id: "42",
  event_type: "billing.invoice.created",
  aggregate_type: "invoice",
  aggregate_id: "inv-9",
  occurred_at: new Date("2026-07-09T12:00:00.000Z"),
  received_at: new Date("2026-07-09T12:00:01.000Z"),
  payload_preview: '{"totalAmount":150}',
};

describe("platform-inbox-store analytics (Phase E1 — mind reads body)", () => {
  beforeEach(() => {
    __resetForTests();
    queryMock.mockReset();
    process.env.PLATFORM_INBOX_DATABASE_URL = "******localhost:5432/onx";
  });

  describe("getEventStats", () => {
    it("returns totals, per-type counts, and 24h window", async () => {
      mockSchemaCalls();
      queryMock
        .mockResolvedValueOnce({
          rows: [{
            total: "7",
            oldest: new Date("2026-07-01T00:00:00.000Z"),
            newest: new Date("2026-07-09T10:00:00.000Z"),
            last24h: "3",
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            { event_type: "billing.invoice.created", count: "4" },
            { event_type: "lab.result.created", count: "3" },
          ],
          rowCount: 2,
        });

      const stats = await getEventStats();

      expect(stats).toEqual({
        totalEvents: 7,
        byType: [
          { eventType: "billing.invoice.created", count: 4 },
          { eventType: "lab.result.created", count: 3 },
        ],
        oldestReceivedAt: "2026-07-01T00:00:00.000Z",
        newestReceivedAt: "2026-07-09T10:00:00.000Z",
        last24hCount: 3,
      });

      const totalsSql = queryMock.mock.calls[4][0] as string;
      expect(totalsSql).toContain("interval '24 hours'");
      const byTypeSql = queryMock.mock.calls[5][0] as string;
      expect(byTypeSql).toContain("GROUP BY event_type");
    });

    it("handles an empty inbox (null timestamps, zero counts)", async () => {
      mockSchemaCalls();
      queryMock
        .mockResolvedValueOnce({ rows: [{ total: "0", oldest: null, newest: null, last24h: "0" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const stats = await getEventStats();

      expect(stats.totalEvents).toBe(0);
      expect(stats.byType).toEqual([]);
      expect(stats.oldestReceivedAt).toBeNull();
      expect(stats.newestReceivedAt).toBeNull();
      expect(stats.last24hCount).toBe(0);
    });
  });

  describe("getRecentEvents", () => {
    it("returns mapped rows with truncated payload preview, newest first", async () => {
      mockSchemaCalls();
      queryMock.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

      const rows = await getRecentEvents(20);

      expect(rows).toEqual([{
        id: 12,
        source: "platform",
        eventId: 42,
        eventType: "billing.invoice.created",
        aggregateType: "invoice",
        aggregateId: "inv-9",
        occurredAt: "2026-07-09T12:00:00.000Z",
        receivedAt: "2026-07-09T12:00:01.000Z",
        payloadPreview: '{"totalAmount":150}',
      }]);

      const sql = queryMock.mock.calls[4][0] as string;
      expect(sql).toContain("ORDER BY id DESC");
      expect(sql).toContain("LIMIT $1");
      expect(sql).toContain("left(payload::text, 300)");
      expect(queryMock.mock.calls[4][1]).toEqual([20]);
    });

    it("clamps limit to 50 and falls back on invalid input", async () => {
      mockSchemaCalls();
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await getRecentEvents(500);
      expect(queryMock.mock.calls[4][1]).toEqual([50]);

      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await getRecentEvents(-3);
      expect(queryMock.mock.calls[5][1]).toEqual([20]);
    });
  });

  describe("getAggregateTimeline", () => {
    it("filters by aggregate via parameters and orders chronologically", async () => {
      mockSchemaCalls();
      queryMock.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

      const rows = await getAggregateTimeline("invoice", "inv-9", 10);

      expect(rows).toHaveLength(1);
      expect(rows[0].aggregateId).toBe("inv-9");

      const sql = queryMock.mock.calls[4][0] as string;
      expect(sql).toContain("WHERE aggregate_type = $1 AND aggregate_id = $2");
      expect(sql).toContain("ORDER BY occurred_at ASC NULLS LAST, id ASC");
      expect(sql).toContain("LIMIT $3");
      // Inputs travel as parameters, never interpolated into SQL
      expect(sql).not.toContain("inv-9");
      expect(queryMock.mock.calls[4][1]).toEqual(["invoice", "inv-9", 10]);
    });

    it("clamps limit to 200", async () => {
      mockSchemaCalls();
      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await getAggregateTimeline("invoice", "inv-9", 9999);
      expect(queryMock.mock.calls[4][1]).toEqual(["invoice", "inv-9", 200]);
    });
  });
});

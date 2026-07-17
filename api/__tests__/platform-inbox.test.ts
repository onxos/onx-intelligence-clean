import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg before importing the store
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

import { insertEvent, countEvents, __resetForTests } from "../lib/platform-inbox-store";

const ddlResult = { rows: [], rowCount: 0 };

function mockSchemaCalls() {
  // 4 DDL statements: table + 3 indexes
  queryMock
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult)
    .mockResolvedValueOnce(ddlResult);
}

const sampleEvent = {
  source: "platform",
  eventId: 42,
  eventType: "appointment.created",
  aggregateType: "appointment",
  aggregateId: "apt-1",
  occurredAt: "2026-07-09T12:00:00.000Z",
  payload: { foo: "bar" },
};

describe("platform-inbox-store (Phase C3a — pg backend)", () => {
  beforeEach(() => {
    __resetForTests();
    queryMock.mockReset();
    process.env.PLATFORM_INBOX_DATABASE_URL = "postgresql://user:pass@localhost:5432/onx";
  });

  it("creates schema once and inserts a new event", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [{ id: "7" }], rowCount: 1 });

    const result = await insertEvent(sampleEvent);

    expect(result).toEqual({ duplicate: false, id: 7 });
    // 4 DDL + 1 insert
    expect(queryMock).toHaveBeenCalledTimes(5);
    const insertSql = queryMock.mock.calls[4][0] as string;
    expect(insertSql).toContain("ON CONFLICT (source, event_id) DO NOTHING");
    expect(insertSql).toContain("RETURNING id");
  });

  it("returns duplicate:true with existing id on conflict (no new row, no error)", async () => {
    mockSchemaCalls();
    queryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ON CONFLICT DO NOTHING → no row
      .mockResolvedValueOnce({ rows: [{ id: "7" }], rowCount: 1 }); // SELECT existing id

    const result = await insertEvent(sampleEvent);

    expect(result).toEqual({ duplicate: true, id: 7 });
  });

  it("does not repeat DDL on subsequent calls", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [{ id: "1" }], rowCount: 1 });
    await insertEvent(sampleEvent);

    queryMock.mockResolvedValueOnce({ rows: [{ id: "2" }], rowCount: 1 });
    await insertEvent({ ...sampleEvent, eventId: 43 });

    // 4 DDL + 2 inserts only
    expect(queryMock).toHaveBeenCalledTimes(6);
  });

  it("countEvents returns numeric count", async () => {
    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [{ count: "3" }], rowCount: 1 });

    await expect(countEvents()).resolves.toBe(3);
  });

  it("retries schema creation after a failure", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(countEvents()).rejects.toThrow(/PLATFORM_INBOX_SCHEMA_FAILED/);

    mockSchemaCalls();
    queryMock.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 });
    await expect(countEvents()).resolves.toBe(0);
  });

  it("throws when no connection string is configured", async () => {
    delete process.env.PLATFORM_INBOX_DATABASE_URL;
    const savedDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(countEvents()).rejects.toThrow(/PLATFORM_INBOX_DB_NOT_CONFIGURED/);
    } finally {
      if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    }
  });
});

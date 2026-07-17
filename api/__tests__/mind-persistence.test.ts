import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock pg before importing the stores (same pattern as platform-inbox.test.ts)
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

import {
  appendContinuityLog,
  getIurgObjects,
  getPersistenceStatus,
  saveIucSnapshot,
  saveIurgObject,
  __resetIurgStoreForTests,
} from "../lib/iurg-store";
import { __resetIurgPgForTests } from "../lib/iurg-pg-store";
import { hydratePersistedIurgGraph, iucRouter } from "../iuc-router";

const ddlResult = { rows: [], rowCount: 0 };
const emptyResult = { rows: [], rowCount: 0 };

/** Route mocked queries by SQL text — robust against call ordering. */
function mockPgBySql(handlers: Array<{ match: RegExp; result: { rows: unknown[]; rowCount: number } | Error }>) {
  queryMock.mockImplementation((sqlText: string) => {
    if (/^\s*(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX)/i.test(sqlText)) {
      return Promise.resolve(ddlResult);
    }
    for (const h of handlers) {
      if (h.match.test(sqlText)) {
        return h.result instanceof Error ? Promise.reject(h.result) : Promise.resolve(h.result);
      }
    }
    return Promise.resolve(emptyResult);
  });
}

const savedDbUrl = process.env.DATABASE_URL;

describe("Wave 6-b mind persistence (pg mode)", () => {
  beforeEach(() => {
    __resetIurgStoreForTests();
    __resetIurgPgForTests();
    queryMock.mockReset();
    process.env.DATABASE_URL = "postgresql://onx:secret@localhost:5432/onx";
  });

  afterEach(() => {
    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
  });

  it("saveIurgObject upserts into pg with ON CONFLICT (idempotent by id)", async () => {
    mockPgBySql([]);

    await saveIurgObject({ id: "obj-1", type: "PERCEPTION", rank: 1, verification: "CONFIRMED" });
    await saveIurgObject({ id: "obj-1", type: "PERCEPTION", rank: 2, verification: "CONFIRMED" });

    const upserts = queryMock.mock.calls.filter(([sqlText]) =>
      /INSERT INTO onx_iurg_object/i.test(sqlText as string));
    expect(upserts).toHaveLength(2);
    expect(upserts[0][0]).toContain("ON CONFLICT (id) DO UPDATE");
    // Same id both times → pure upsert, no duplicate identity
    expect(upserts[0][1][0]).toBe("obj-1");
    expect(upserts[1][1][0]).toBe("obj-1");

    const status = getPersistenceStatus();
    expect(status.mode).toBe("pg");
    expect(status.objectsPersisted).toBe(2);
    expect(status.pgErrors).toBe(0);
  });

  it("resumes the continuity chain from the last persisted hash instead of GENESIS", async () => {
    const lastHash = "a".repeat(64);
    mockPgBySql([
      { match: /SELECT current_hash FROM onx_continuity_log/i, result: { rows: [{ current_hash: lastHash }], rowCount: 1 } },
    ]);

    const first = await appendContinuityLog({ tick: 1, eventType: "SNAPSHOT", detail: "after-restart" });

    const insert = queryMock.mock.calls.find(([sqlText]) =>
      /INSERT INTO onx_continuity_log/i.test(sqlText as string));
    expect(insert).toBeDefined();
    // previous_hash param ($6) must be the persisted hash, not GENESIS
    expect(insert?.[1][5]).toBe(lastHash);
    expect(insert?.[1][6]).toBe(first.currentHash);

    // Subsequent appends chain in-memory off the first entry
    const second = await appendContinuityLog({ tick: 2, eventType: "SNAPSHOT" });
    const inserts = queryMock.mock.calls.filter(([sqlText]) =>
      /INSERT INTO onx_continuity_log/i.test(sqlText as string));
    expect(inserts).toHaveLength(2);
    expect(inserts[1][1][5]).toBe(first.currentHash);
    expect(second.currentHash).not.toBe(first.currentHash);
    expect(getPersistenceStatus().continuityAppended).toBe(2);
  });

  it("starts from GENESIS when no continuity rows are persisted", async () => {
    mockPgBySql([
      { match: /SELECT current_hash FROM onx_continuity_log/i, result: { rows: [], rowCount: 0 } },
    ]);

    await appendContinuityLog({ tick: 0, eventType: "SNAPSHOT" });

    const insert = queryMock.mock.calls.find(([sqlText]) =>
      /INSERT INTO onx_continuity_log/i.test(sqlText as string));
    expect(insert?.[1][5]).toBe("0".repeat(64));
  });

  it("pg failures never throw: writes fall back to memory and bump pgErrors", async () => {
    queryMock.mockRejectedValue(new Error("connection refused"));

    await expect(saveIurgObject({ id: "safe-1", type: "PERCEPTION" })).resolves.toEqual({ id: "safe-1" });
    await expect(saveIucSnapshot({ tuc: 10, objectCount: 1 })).resolves.toMatchObject({ snapshotHash: expect.any(String) });
    await expect(appendContinuityLog({ tick: 1, eventType: "SNAPSHOT" })).resolves.toMatchObject({ currentHash: expect.any(String) });

    const status = getPersistenceStatus();
    expect(status.pgErrors).toBeGreaterThanOrEqual(3);

    // Reads also degrade to the in-memory mirror instead of throwing
    const objects = await getIurgObjects();
    expect(objects.find((o) => o.id === "safe-1")).toBeDefined();
  });

  it("hydrates persisted objects into the IUC graph on boot with a valid chain", async () => {
    const payload = (id: string, type: string) =>
      JSON.stringify({ id, type, rank: 2, verification: "CONFIRMED", trust: 0.8 });
    mockPgBySql([
      {
        match: /SELECT id, payload FROM onx_iurg_object/i,
        result: {
          rows: [
            { id: "boot-1", payload: payload("boot-1", "PERCEPTION") },
            { id: "boot-2", payload: payload("boot-2", "PATTERN") },
          ],
          rowCount: 2,
        },
      },
    ]);

    const { loaded } = await hydratePersistedIurgGraph();
    expect(loaded).toBe(2);
    expect(getPersistenceStatus().objectsLoadedOnBoot).toBe(2);

    // Hydration must not re-persist: no writes back to pg
    const writes = queryMock.mock.calls.filter(([sqlText]) =>
      /INSERT INTO/i.test(sqlText as string));
    expect(writes).toHaveLength(0);

    const caller = iucRouter.createCaller({} as Parameters<typeof iucRouter.createCaller>[0]);
    const graph = await caller.graph();
    expect(graph.find((n) => n.id === "boot-1")).toBeDefined();
    expect(graph.find((n) => n.id === "boot-2")).toBeDefined();
    const verify = await caller.verifyChain();
    expect(verify.valid).toBe(true);
  });

  it("hydration survives a dead database (returns loaded=0, never throws)", async () => {
    queryMock.mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(hydratePersistedIurgGraph()).resolves.toEqual({ loaded: 0 });
  });

  it("saveIucSnapshot persists to pg and keeps the memory mirror", async () => {
    mockPgBySql([]);

    const { snapshotHash } = await saveIucSnapshot({ tuc: 42.5, objectCount: 3 });

    const insert = queryMock.mock.calls.find(([sqlText]) =>
      /INSERT INTO onx_iuc_snapshot/i.test(sqlText as string));
    expect(insert).toBeDefined();
    expect(insert?.[1][12]).toBe(snapshotHash);
    expect(getPersistenceStatus().snapshotsPersisted).toBe(1);
  });
});

describe("Wave 6-b mind persistence (memory fallback)", () => {
  beforeEach(() => {
    __resetIurgStoreForTests();
    __resetIurgPgForTests();
    queryMock.mockReset();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
  });

  it("uses the in-memory store without touching pg when DATABASE_URL is absent", async () => {
    await saveIurgObject({ id: "mem-1", type: "PERCEPTION" });
    await saveIucSnapshot({ tuc: 1, objectCount: 1 });
    await appendContinuityLog({ tick: 0, eventType: "SNAPSHOT" });

    const objects = await getIurgObjects();
    expect(objects.find((o) => o.id === "mem-1")).toBeDefined();
    expect(queryMock).not.toHaveBeenCalled();

    const status = getPersistenceStatus();
    expect(status.mode).toBe("memory");
    expect(status.objectsPersisted).toBe(0);
    expect(status.pgErrors).toBe(0);
  });
});

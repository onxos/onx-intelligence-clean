import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock pg BEFORE importing the stores (same pattern as mind-persistence.test.ts).
// The Pool mock supports both direct `.query()` and pooled `.connect()` clients
// so the atomic transactional replace path is exercisable.
const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(async () => ({ query: clientQueryMock, release: releaseMock }));
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
    connect = connectMock;
  },
}));

import {
  DEGRADED_THRESHOLD,
  PgWriteError,
  assertAffected,
  getPgDiagnostics,
  recordPgFailure,
  recordPgSuccess,
  resetPgDiagnostics,
  withPgTransaction,
  type PgTxClient,
} from "../lib/pg-diagnostics";
import {
  getPersistenceStatus,
  replaceIurgObjects,
  __resetIurgStoreForTests,
} from "../lib/iurg-store";
import { __resetIurgPgForTests } from "../lib/iurg-pg-store";
import { PgVectorMemoryStore } from "../lib/persistent-memory";

// ── pg-diagnostics core ─────────────────────────────────────────────
describe("pg-diagnostics core", () => {
  beforeEach(() => resetPgDiagnostics());

  it("recordPgFailure logs structured JSON, counts per-op, and surfaces lastError", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cid = recordPgFailure("iurg.saveObject", new Error("connection refused"), {
      correlationId: "trace-123",
    });

    expect(cid).toBe("trace-123");
    const diag = getPgDiagnostics();
    expect(diag.pgErrors).toBe(1);
    expect(diag.pgErrorsByOp["iurg.saveObject"]).toBe(1);
    expect(diag.lastError).toMatchObject({
      op: "iurg.saveObject",
      message: "connection refused",
      correlationId: "trace-123",
    });
    expect(diag.lastError?.at).toEqual(expect.any(String));

    // Structured, machine-parseable, secret-free log line.
    const logged = JSON.parse(errSpy.mock.calls.at(-1)?.[0] as string);
    expect(logged).toMatchObject({
      level: "error",
      event: "pg_failure",
      op: "iurg.saveObject",
      message: "connection refused",
      correlationId: "trace-123",
    });
    errSpy.mockRestore();
  });

  it("marks an op degraded after the consecutive-failure threshold, and success clears it", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (let i = 0; i < DEGRADED_THRESHOLD; i++) {
      recordPgFailure("iurg.appendContinuity", new Error("boom"));
    }
    let diag = getPgDiagnostics();
    expect(diag.degraded).toBe(true);
    expect(diag.degradedOps).toContain("iurg.appendContinuity");

    recordPgSuccess("iurg.appendContinuity");
    diag = getPgDiagnostics();
    expect(diag.degraded).toBe(false);
    expect(diag.degradedOps).not.toContain("iurg.appendContinuity");
    vi.restoreAllMocks();
  });

  it("assertAffected throws a fail-closed PgWriteError on 0 rows, passes otherwise", () => {
    expect(() => assertAffected(0, "inbox.insert")).toThrow(PgWriteError);
    expect(() => assertAffected(null, "inbox.insert")).toThrow(/affected 0 rows/);
    expect(() => assertAffected(1, "inbox.insert")).not.toThrow();
  });

  it("captures a pg driver error code without leaking data", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pgErr = Object.assign(new Error("duplicate key"), { code: "23505" });
    recordPgFailure("inbox.insert", pgErr);
    expect(getPgDiagnostics().lastError?.code).toBe("23505");
    vi.restoreAllMocks();
  });
});

// ── withPgTransaction (fail-closed rollback) ────────────────────────
describe("withPgTransaction", () => {
  beforeEach(() => resetPgDiagnostics());

  function makeClient(): { client: PgTxClient; calls: string[] } {
    const calls: string[] = [];
    const client: PgTxClient = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        return { rows: [], rowCount: 0 };
      }),
    };
    return { client, calls };
  }

  it("BEGIN → fn → COMMIT on success and records success", async () => {
    const { client, calls } = makeClient();
    const result = await withPgTransaction(
      client,
      async (tx) => {
        await tx.query("INSERT 1");
        return "ok";
      },
      { op: "unit.tx" },
    );
    expect(result).toBe("ok");
    expect(calls).toEqual(["BEGIN", "INSERT 1", "COMMIT"]);
    expect(getPgDiagnostics().pgSuccesses).toBe(1);
    expect(getPgDiagnostics().pgErrors).toBe(0);
  });

  it("ROLLBACKs and rethrows FAIL-CLOSED when the body fails, recording the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client, calls } = makeClient();

    await expect(
      withPgTransaction(
        client,
        async (tx) => {
          await tx.query("INSERT 1");
          throw new Error("insert #2 failed");
        },
        { op: "unit.tx" },
      ),
    ).rejects.toBeInstanceOf(PgWriteError);

    expect(calls).toEqual(["BEGIN", "INSERT 1", "ROLLBACK"]);
    const diag = getPgDiagnostics();
    expect(diag.pgErrors).toBeGreaterThanOrEqual(1);
    expect(diag.lastError?.op).toBe("unit.tx");
    vi.restoreAllMocks();
  });
});

// ── iurg atomic replace (fail-closed, rolled back, surfaced) ────────
describe("iurg pg replaceIurgObjects is atomic + surfaced", () => {
  const savedDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    __resetIurgStoreForTests();
    __resetIurgPgForTests();
    queryMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    connectMock.mockClear();
    process.env.DATABASE_URL = "postgres" + "://localhost:5432/onx";
  });

  afterEach(() => {
    if (savedDbUrl !== undefined) process.env.DATABASE_URL = savedDbUrl;
    else delete process.env.DATABASE_URL;
    vi.restoreAllMocks();
  });

  it("runs DELETE + INSERTs in one transaction and releases the client on success", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 }); // ensureSchema DDL
    clientQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await replaceIurgObjects([
      { id: "a-1", type: "PERCEPTION", rank: 1 },
      { id: "a-2", type: "PERCEPTION", rank: 1 },
    ]);

    const stmts = clientQueryMock.mock.calls.map((c) => c[0] as string);
    expect(stmts[0]).toBe("BEGIN");
    expect(stmts.some((s) => /DELETE FROM onx_iurg_object/i.test(s))).toBe(true);
    expect(stmts.filter((s) => /INSERT INTO onx_iurg_object/i.test(s))).toHaveLength(2);
    expect(stmts.at(-1)).toBe("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(getPgDiagnostics().degraded).toBe(false);
  });

  it("ROLLBACKs on a mid-way insert failure, surfaces it, and never throws to the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 }); // ensureSchema DDL

    // BEGIN ok, DELETE ok, first INSERT ok, second INSERT fails.
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT a-1
      .mockRejectedValueOnce(new Error("connection dropped mid-write")); // INSERT a-2

    // Availability preserved: the store absorbs the (atomic) pg failure.
    await expect(
      replaceIurgObjects([
        { id: "a-1", type: "PERCEPTION", rank: 1 },
        { id: "a-2", type: "PERCEPTION", rank: 1 },
      ]),
    ).resolves.toBeUndefined();

    const stmts = clientQueryMock.mock.calls.map((c) => c[0] as string);
    expect(stmts).toContain("ROLLBACK");
    expect(stmts).not.toContain("COMMIT");
    expect(releaseMock).toHaveBeenCalledTimes(1);

    // The failure is NOT silent: recorded loudly + reflected in HT-09 status.
    const status = getPersistenceStatus();
    expect(status.pgErrors).toBeGreaterThanOrEqual(1);
    expect(status.lastError?.op).toBe("iurg-pg.replaceObjects");
  });
});

// ── persistent-memory persist failure is recorded, not swallowed ────
describe("PgVectorMemoryStore persist failure is observable", () => {
  beforeEach(() => resetPgDiagnostics());

  it("records a pg failure and keeps serving reads from the mirror", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failingQuery = vi.fn(async () => {
      throw new Error("pgvector node is down");
    });
    const store = new PgVectorMemoryStore({ query: failingQuery, table: "onx_memory_record" });

    const rec = await store.put({
      id: "m-1",
      kind: "insight",
      content: "hello",
      provenance: { source: "test", method: "deterministic", recordedAt: "2026-01-01T00:00:00.000Z", confidence: 1 },
    });

    // Write did not throw (fail-safe mirror), but the failure is surfaced.
    expect(rec.id).toBe("m-1");
    expect(store.getStatus().pgErrors).toBe(1);
    const diag = getPgDiagnostics();
    expect(diag.pgErrorsByOp["memory.persist"]).toBe(1);

    // Reads still work from the deterministic mirror.
    const got = await store.get("m-1");
    expect(got?.content).toBe("hello");
    vi.restoreAllMocks();
  });
});

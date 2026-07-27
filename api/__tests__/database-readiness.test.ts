import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../router";
import {
  closeDatabaseReadinessPoolForTests,
  DATABASE_READINESS_SQL,
  probeDatabaseReadiness,
} from "../lib/database-readiness";

afterEach(async () => {
  vi.unstubAllEnvs();
  await closeDatabaseReadinessPoolForTests();
});

describe("strict database readiness", () => {
  it("refuses readiness when DATABASE_URL is absent", async () => {
    const result = await probeDatabaseReadiness({
      connectionString: "",
      now: () => new Date("2026-07-27T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ready: false,
      state: "NOT_CONFIGURED",
      backend: "none",
      proof: "NOT_EXECUTED",
      latencyMs: 0,
      checkedAt: "2026-07-27T00:00:00.000Z",
    });
  });

  it("refuses a non-Postgres DATABASE_URL without executing a query", async () => {
    const query = vi.fn();
    const result = await probeDatabaseReadiness({
      connectionString: "mysql://example.invalid/onx",
      executor: { query },
    });

    expect(result.state).toBe("INVALID_CONFIGURATION");
    expect(result.ready).toBe(false);
    expect(result.proof).toBe("NOT_EXECUTED");
    expect(query).not.toHaveBeenCalled();
  });

  it("becomes READY only after the exact SELECT 1 proof succeeds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] });
    const result = await probeDatabaseReadiness({
      connectionString: "postgres://example.invalid/onx",
      executor: { query },
    });

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(DATABASE_READINESS_SQL);
    expect(result).toMatchObject({
      ready: true,
      state: "READY",
      backend: "postgres",
      proof: "SELECT_1",
    });
  });

  it("fails closed when SELECT 1 returns no positive proof row", async () => {
    const result = await probeDatabaseReadiness({
      connectionString: "postgres://example.invalid/onx",
      executor: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    });

    expect(result).toMatchObject({
      ready: false,
      state: "UNAVAILABLE",
      backend: "postgres",
      proof: "SELECT_1",
    });
  });

  it("fails closed without exposing a database error", async () => {
    const result = await probeDatabaseReadiness({
      connectionString: "postgres://example.invalid/onx",
      executor: {
        query: vi.fn().mockRejectedValue(
          new Error("password secret host topology should never escape"),
        ),
      },
    });

    expect(result).toMatchObject({
      ready: false,
      state: "UNAVAILABLE",
      backend: "postgres",
      proof: "SELECT_1",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("topology");
  });

  it("exposes the strict proof through health.dbReady", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const caller = appRouter.createCaller({} as never);
    const result = await caller.health.dbReady();

    expect(result).toMatchObject({
      ready: false,
      state: "NOT_CONFIGURED",
      proof: "NOT_EXECUTED",
    });
  });
});

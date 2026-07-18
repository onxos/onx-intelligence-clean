// ============================================================
// CORPUS INGEST PIPELINE — STE-N-02 tests (no external DB)
// Proves: fail-closed bridge gate, normalize→fingerprint→dedup,
// honest UNPERSISTED declaration without postgres, and the
// postgres upsert-dedup path via a mocked pg Pool
// (same mock pattern as pg-diagnostics.test.ts).
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock pg BEFORE importing the store (pattern of pg-diagnostics.test.ts).
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

// Enable the bridge for the pipeline tests; fail-closed behavior is
// covered separately in bridge-contract.test.ts (BRIDGE_DISABLED).
vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      bridgeEnabled: true,
      bridgeSharedSecret: "test-bridge-secret",
    },
  };
});

import { appRouter } from "../router";
import { __resetCorpusIngestMemoryForTests } from "../corpus-query-router";
import {
  __resetCorpusPgForTests,
  insertCorpusUnits,
  isCorpusPersistenceConfigured,
} from "../lib/corpus-pg-store";

function bridgeCtx() {
  return {
    req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
  } as never;
}

const unit = (n: number, body = `body content ${n}`) => ({
  domain: "MEDICINE",
  title: `Corpus unit ${n}`,
  body,
  source: "ste-n-02-test",
});

describe("corpus.ingest pipeline (STE-N-02)", () => {
  beforeEach(() => {
    __resetCorpusIngestMemoryForTests();
    __resetCorpusPgForTests();
    queryMock.mockReset();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("rejects an invalid bridge key (fail-closed)", async () => {
    const caller = appRouter.createCaller({
      req: { headers: new Headers({ "x-onx-bridge-key": "wrong-key" }) },
    } as never);
    await expect(
      caller.corpusQuery.ingest({ units: [unit(1)] }),
    ).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("dedups inside a batch and declares UNPERSISTED without postgres", async () => {
    const caller = appRouter.createCaller(bridgeCtx());
    const result = await caller.corpusQuery.ingest({
      units: [unit(1), unit(2), { ...unit(1), title: " CORPUS  UNIT 1 " }],
    });
    // Third unit normalizes to the same fingerprint as the first.
    expect(result.persistence).toBe("UNPERSISTED");
    expect(result.total).toBe(3);
    expect(result.accepted).toBe(2);
    expect(result.duplicates).toBe(1);
  });

  it("dedups across batches in memory (re-ingest accepts nothing)", async () => {
    const caller = appRouter.createCaller(bridgeCtx());
    const first = await caller.corpusQuery.ingest({ units: [unit(1), unit(2)] });
    expect(first.accepted).toBe(2);
    const second = await caller.corpusQuery.ingest({ units: [unit(1), unit(2), unit(3)] });
    expect(second.accepted).toBe(1);
    expect(second.duplicates).toBe(2);
  });

  it("uses the postgres path with ON CONFLICT dedup when DATABASE_URL is postgres", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/onx";
    expect(isCorpusPersistenceConfigured()).toBe(true);

    // Schema queries + inserts: first insert accepted (rowCount 1),
    // second is a fingerprint conflict (rowCount 0).
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("CREATE")) return { rowCount: 0, rows: [] };
      if (sql.includes("INSERT")) {
        const isFirst = queryMock.mock.calls.filter(([s]) => String(s).includes("INSERT")).length === 1;
        return { rowCount: isFirst ? 1 : 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });

    const caller = appRouter.createCaller(bridgeCtx());
    const result = await caller.corpusQuery.ingest({ units: [unit(1), unit(2)] });
    expect(result.persistence).toBe("POSTGRES");
    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.total).toBe(2);

    const createSql = queryMock.mock.calls.map(([s]) => String(s)).find((s) => s.includes("onx_knowledge_corpus"));
    expect(createSql).toContain("fingerprint VARCHAR(64) NOT NULL UNIQUE");
    const insertSql = queryMock.mock.calls.map(([s]) => String(s)).find((s) => s.includes("INSERT"));
    expect(insertSql).toContain("ON CONFLICT (fingerprint) DO NOTHING");
  });

  it("insertCorpusUnits returns honest counts directly", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/onx";
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const result = await insertCorpusUnits([
      { fingerprint: "f1", domain: "SCIENCE", title: "t", body: "b", source: "s" },
    ]);
    expect(result).toEqual({ accepted: 1, duplicates: 0, total: 1 });
  });

  it("corpus manifest declares persistence honestly", async () => {
    const { buildCorpusManifest } = await import("../knowledge-router");
    expect(buildCorpusManifest().persistence).toBe("UNPERSISTED");
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/onx";
    expect(buildCorpusManifest().persistence).toBe("POSTGRES");
  });
});

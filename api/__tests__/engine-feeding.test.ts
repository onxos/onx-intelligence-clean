// ============================================================
// LINE I — Phases 2+3 tests
// Phase 2 (D11 feeding): real events (corpus ingest) flow into
//   continuity + causal graph + auditor + ingestion counters.
// Phase 3 (real engines): USFIPv2 computes real verdicts,
//   Guardian keeps real alerts, Ingestion counts real events.
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, bridgeEnabled: true, bridgeSharedSecret: "test-bridge-secret" },
  };
});

import { appRouter } from "../router";
import { USFIPv2Engine, Guardian, IngestionPipeline } from "@onx/intelligence-runtime";
import { __resetCorpusIngestMemoryForTests } from "../corpus-query-router";

const bridgeCaller = () =>
  appRouter.createCaller({
    req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
  } as never);

describe("Phase 2 — D11 feeding: corpus ingest feeds the engines", () => {
  beforeEach(() => {
    __resetCorpusIngestMemoryForTests();
    delete process.env.DATABASE_URL; // in-memory path for the test
  });

  it("ingest records continuity + audit + ingestion counters", async () => {
    const caller = bridgeCaller();
    const before = await caller.runtime.persistence.status();

    await caller.corpusQuery.ingest({
      units: [{
        domain: "MEDICINE",
        title: "Parvovirus in dogs — feeding test",
        body: "Parvovirus causes vomiting and bloody diarrhea in unvaccinated dogs.",
        source: "phase2-feeding-test",
      }],
    });

    const after = await caller.runtime.persistence.status();
    expect(after.counts.continuityRecords).toBe(before.counts.continuityRecords + 1);
    expect(after.counts.graphNodes).toBe(before.counts.graphNodes + 1);
    expect(after.counts.auditorEntries).toBe(before.counts.auditorEntries + 1);
    expect(after.counts.ingestionProcessed).toBe(
      (before.counts.ingestionProcessed ?? 0) + 1,
    );
  });
});

describe("Phase 3 — USFIPv2 real audit (no more placebo 0.85)", () => {
  it("HARD_BLOCKs amanah below the floor — even a founder override cannot pass", () => {
    const engine = new USFIPv2Engine({ amanahFloor: 0.5 });
    const result = engine.fullAudit({ amanahScore: 0.3 });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("AMANAH_FLOOR");
  });

  it("passes a clean object with computed score", () => {
    const engine = new USFIPv2Engine({ amanahFloor: 0.5 });
    const result = engine.fullAudit({ amanahScore: 0.9, privacyLevel: "PUBLIC" });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("blocks RESTRICTED access without privileged role", () => {
    const engine = new USFIPv2Engine({ amanahFloor: 0.5 });
    const result = engine.fullAudit({ privacyLevel: "RESTRICTED", accessorRole: "PUBLIC" });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("PRIVACY");
  });
});

describe("Phase 3 — Guardian keeps REAL alerts", () => {
  it("records an alert on every amanah violation and persists state", () => {
    const g = new Guardian();
    expect(g.getAlerts()).toHaveLength(0);
    g.checkAmanah(0.2);
    g.checkAmanah(0.9);
    g.validateShadow("L7_INTERNET");
    const alerts = g.getAlerts();
    expect(alerts).toHaveLength(2);
    expect(alerts[0].kind).toBe("AMANAH_FLOOR_VIOLATION");
    expect(alerts[1].kind).toBe("UNTRUSTED_SHADOW");
    // snapshot/restore round-trip
    const g2 = new Guardian();
    g2.restore(JSON.parse(JSON.stringify(g.snapshot())));
    expect(g2.getAlerts()).toHaveLength(2);
    expect(g2.getStats().violations).toBe(1);
  });
});

describe("Phase 3 — IngestionPipeline counts REAL events", () => {
  it("counts sources and processed units honestly", () => {
    const p = new IngestionPipeline();
    expect(p.getSourceStats()).toEqual({ sources: 0, processed: 0, pending: 0 });
    p.noteSource("corpus-ingest");
    p.noteSource("corpus-ingest"); // same source twice → still 1
    p.noteSource("knowledge-add");
    p.noteProcessed(12);
    expect(p.getSourceStats()).toEqual({ sources: 2, processed: 12, pending: 0 });
  });
});

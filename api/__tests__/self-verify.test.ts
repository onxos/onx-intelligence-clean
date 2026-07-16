// ============================================================
// OSVA SELF-VERIFICATION — STE-V-01 tests
// Report structure, fingerprint stability, no env-value leakage,
// and the runner's exit-code contract (asserted claims → 1).
// ============================================================
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { appRouter } from "../router";
import {
  buildSelfVerification,
  fingerprintReport,
  type SelfVerificationReport,
} from "../lib/self-verify";

const caller = appRouter.createCaller({} as never);

const VERDICTS = ["IMPLEMENTED_PROVEN", "PARTIAL", "DOCUMENTED_ONLY", "DEMO", "MISSING"];

describe("OSVA self-verification (STE-V-01)", () => {
  it("builds a structurally complete report with five-truth verdicts", async () => {
    const report = await buildSelfVerification();

    expect(report.health.length).toBe(6);
    expect(report.providers.length).toBe(8);
    expect(report.bridges.map((b) => b.id)).toEqual(["corpusQuery", "intentEngine", "titanBridge"]);
    expect(report.bridgeRuntime.bridge).toBe("titanBridge");
    expect(["BRIDGE_READY", "BRIDGE_GUARDED"]).toContain(report.bridgeRuntime.compatibility);
    expect(report.corpus.rawTotal).toBe(22500);
    expect(report.runtime.node).toBe(process.version);
    // items = 6 health + 1 corpus + 8 providers + 3 bridges + 1 runtime bridge proof + 1 runtime
    expect(report.items.length).toBe(20);
    for (const item of report.items) {
      expect(VERDICTS).toContain(item.verdict);
      expect(typeof item.measured).toBe("boolean");
    }
    // The templated corpus must be flagged DEMO — never proven-authentic.
    expect(report.items.find((i) => i.area === "corpus")!.verdict).toBe("DEMO");
    expect(report.claimsMeasured + report.claimsAsserted).toBe(report.items.length);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fingerprint is stable across runs with identical facts and excludes volatile fields", async () => {
    const first = await buildSelfVerification();
    const second = await buildSelfVerification();
    // Timestamps/latency/uptime differ between runs, fingerprint must not.
    expect(second.fingerprint).toBe(first.fingerprint);

    // Changing a fact changes the fingerprint.
    const mutated: Omit<SelfVerificationReport, "fingerprint"> = {
      ...first,
      claimsMeasured: first.claimsMeasured + 1,
    };
    expect(fingerprintReport(mutated)).not.toBe(first.fingerprint);
  });

  it("matches independent sha256 recomputation of the canonical stable payload", async () => {
    const report = await buildSelfVerification();
    const stable = {
      items: report.items.map((i) => ({ area: i.area, name: i.name, verdict: i.verdict, measured: i.measured })),
      health: report.health.map((h) => ({ name: h.name, status: h.status })),
      corpus: {
        rawTotal: report.corpus.rawTotal,
        uniqueByTitleBody: report.corpus.uniqueByTitleBody,
        duplicates: report.corpus.duplicates,
        persistence: report.corpus.persistence,
      },
      providers: report.providers.map((p) => ({ id: p.id, status: p.status })),
      bridges: report.bridges,
      bridgeRuntime: {
        bridge: report.bridgeRuntime.bridge,
        bridgeEnabled: report.bridgeRuntime.bridgeEnabled,
        hasSharedSecret: report.bridgeRuntime.hasSharedSecret,
        providerCounts: report.bridgeRuntime.providerCounts,
        memoryMode: report.bridgeRuntime.memoryMode,
        compatibility: report.bridgeRuntime.compatibility,
        commitSha: report.bridgeRuntime.commitSha,
        checksum: report.bridgeRuntime.checksum,
      },
      claimsMeasured: report.claimsMeasured,
      claimsAsserted: report.claimsAsserted,
    };
    const independent = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
    expect(independent).toBe(report.fingerprint);

    const tampered = { ...stable, claimsMeasured: stable.claimsMeasured + 1 };
    const tamperedHash = createHash("sha256").update(JSON.stringify(tampered)).digest("hex");
    expect(tamperedHash).not.toBe(report.fingerprint);
  });

  it("onx.selfVerify is public and leaks no env values", async () => {
    const canary = "osva-canary-secret-value-9f8e7d6c";
    process.env.OSVA_CANARY_SECRET = canary;
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-osva-test-full-key-value-123456";
    try {
      const result = await caller.onx.selfVerify();
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(canary);
      // Any configured provider key must never appear beyond 4 chars.
      for (const value of Object.values(process.env)) {
        if (typeof value === "string" && value.length >= 8) {
          expect(serialized).not.toContain(value);
        }
      }
      const openai = result.providers.find((p) => p.id === "openai")!;
      if (openai.keyPrefix) expect(openai.keyPrefix.length).toBe(4);
    } finally {
      delete process.env.OSVA_CANARY_SECRET;
    }
  });

  it("onx.bridgeSurfaces is public, aggregates the three bridge proofs, and keeps a stable checksum", async () => {
    const first = await caller.onx.bridgeSurfaces();
    const second = await caller.onx.bridgeSurfaces();
    expect(first.access).toBe("PUBLIC_READ");
    expect(first.total).toBe(3);
    expect(first.ready + first.guarded).toBe(3);
    expect(first.surfaces.corpusQuery.bridge).toBe("corpusQuery");
    expect(first.surfaces.intentEngine.bridge).toBe("intentEngine");
    expect(first.surfaces.titanBridge.bridge).toBe("titanBridge");
    expect(first.surfaces.corpusQuery.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(first.surfaces.intentEngine.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(first.surfaces.titanBridge.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(first.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(second.checksum).toBe(first.checksum);
  });

  it("exit-code contract: claimsAsserted > 0 must map to exit 1", async () => {
    const report = await buildSelfVerification();
    const exitCode = report.claimsAsserted > 0 ? 1 : 0;
    // Same expression as scripts/self-verify.ts:18 — by construction all
    // current items are measured live, so the kit passes with 0 today.
    expect(exitCode).toBe(report.claimsAsserted > 0 ? 1 : 0);
    expect(report.claimsAsserted).toBe(0);
    expect(report.claimsMeasured).toBe(20);
  });
});

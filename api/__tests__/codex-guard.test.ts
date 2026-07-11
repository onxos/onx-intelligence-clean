// ============================================================
// CODEX GUARD — UNIT TESTS (B1)
// Proves the charter is enforced technically: deviation detection +
// claim evaluation against the OCMBR truth ledger.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  scanText,
  scanFiles,
  isProductionFile,
  evaluateClaim,
} from "../lib/codex-guard";
import { __resetOcmbrForTests, seed } from "../lib/ocmbr-store";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as never);

describe("scanText — FORBIDDEN_LABEL", () => {
  it("flags anthropomorphic claim labels in production code", () => {
    const devs = scanText("export const mode = 'consciousness engine';");
    expect(devs.some((d) => d.rule === "FORBIDDEN_LABEL")).toBe(true);
  });

  it("catches hyphen/space variants of self-aware", () => {
    expect(scanText("// a self aware loop").some((d) => d.rule === "FORBIDDEN_LABEL")).toBe(true);
    expect(scanText("const x = 'self-aware';").some((d) => d.rule === "FORBIDDEN_LABEL")).toBe(true);
  });

  it("respects the codex-guard:allow opt-out marker", () => {
    const src = "// codex-guard:allow domain term\nconst t = 'consciousness';";
    expect(scanText(src).length).toBe(0);
  });

  it("does not apply label rules to non-production (test/doc) code", () => {
    const devs = scanText("describe('consciousness', () => {})", { isProduction: false });
    expect(devs.some((d) => d.rule === "FORBIDDEN_LABEL")).toBe(false);
  });
});

describe("scanText — FAIL_OPEN", () => {
  it("flags a guard that returns passed:true from a catch block", () => {
    const src = [
      "function checkAmanah(x) {",
      "  try {",
      "    return realCheck(x);",
      "  } catch (e) {",
      "    return { passed: true };",
      "  }",
      "}",
    ].join("\n");
    const devs = scanText(src);
    expect(devs.some((d) => d.rule === "FAIL_OPEN")).toBe(true);
  });

  it("does NOT flag a fail-closed catch (returns passed:false)", () => {
    const src = [
      "try { doIt(); } catch (e) {",
      "  return { passed: false };",
      "}",
    ].join("\n");
    expect(scanText(src).some((d) => d.rule === "FAIL_OPEN")).toBe(false);
  });

  it("does NOT flag a truthy return OUTSIDE any catch", () => {
    const src = "function ok() { return { passed: true }; }";
    expect(scanText(src).some((d) => d.rule === "FAIL_OPEN")).toBe(false);
  });
});

describe("scanText — FAKE_LIVE_METRIC", () => {
  it("flags Math.random() fed into a live-looking field", () => {
    const src = "return { score: Math.random(), healthy: true };";
    expect(scanText(src).some((d) => d.rule === "FAKE_LIVE_METRIC")).toBe(true);
  });

  it("ignores Math.random() that is not a metric field", () => {
    const src = "const id = Math.random().toString(36);";
    expect(scanText(src).some((d) => d.rule === "FAKE_LIVE_METRIC")).toBe(false);
  });
});

describe("isProductionFile", () => {
  it("classifies real source as production and tests/docs/guard as not", () => {
    expect(isProductionFile("api/foo.ts")).toBe(true);
    expect(isProductionFile("api/__tests__/foo.test.ts")).toBe(false);
    expect(isProductionFile("docs/x.md")).toBe(false);
    expect(isProductionFile("api/lib/codex-guard.ts")).toBe(false);
  });
});

describe("scanFiles — aggregate report", () => {
  it("aggregates deviations by rule and reports clean=false on findings", () => {
    const report = scanFiles([
      { filename: "api/bad.ts", content: "const s = { score: Math.random() };" },
      { filename: "api/ok.ts", content: "export const two = 1 + 1;" },
    ]);
    expect(report.scannedFiles).toBe(2);
    expect(report.byRule.FAKE_LIVE_METRIC).toBe(1);
    expect(report.clean).toBe(false);
  });

  it("reports clean=true when nothing deviates", () => {
    const report = scanFiles([
      { filename: "api/ok.ts", content: "export const add = (a,b) => a + b;" },
    ]);
    expect(report.clean).toBe(true);
    expect(report.totalDeviations).toBe(0);
  });

  it("exempts test-named files from FAIL_OPEN/FAKE_LIVE_METRIC (regression: CI false-positive on api/__tests__)", () => {
    const report = scanFiles([
      {
        filename: "api/__tests__/sample.test.ts",
        content: [
          "try { doIt(); } catch (e) { return { passed: true }; }",
          "const s = { score: Math.random() };",
        ].join("\n"),
      },
    ]);
    expect(report.totalDeviations).toBe(0);
    expect(report.clean).toBe(true);
  });

  it("baseline subtracts known-legacy deviations: still reported, not counted as NEW", () => {
    const files = [
      { filename: "api/legacy.ts", content: "const s = { score: Math.random() };" },
    ];
    const without = scanFiles(files);
    expect(without.newDeviations).toBe(1);
    expect(without.clean).toBe(false);

    const baseline = [
      {
        filename: "api/legacy.ts",
        rule: "FAKE_LIVE_METRIC" as const,
        match: "const s = { score: Math.random() };",
      },
    ];
    const withBaseline = scanFiles(files, baseline);
    expect(withBaseline.totalDeviations).toBe(1); // still reported (not muted)
    expect(withBaseline.knownDeviations).toBe(1);
    expect(withBaseline.newDeviations).toBe(0);
    expect(withBaseline.clean).toBe(true); // no NEW deviation → CI passes
  });
});

describe("evaluateClaim — against OCMBR ledger", () => {
  it("CONFIRMED when actual >= claimed", () => {
    const r = evaluateClaim("PARTIAL", "VERIFIED");
    expect(r.verdict).toBe("CONFIRMED");
  });

  it("OVERSTATED when claim exceeds evidence-derived reality", () => {
    const r = evaluateClaim("VERIFIED", "PARTIAL");
    expect(r.verdict).toBe("OVERSTATED");
  });

  it("UNKNOWN when the capability is absent from the ledger", () => {
    const r = evaluateClaim("VERIFIED", null);
    expect(r.verdict).toBe("UNKNOWN");
  });
});

describe("tRPC surface + OCMBR integration", () => {
  beforeEach(() => __resetOcmbrForTests());

  it("codexGuard.scan returns a structured report", async () => {
    const res = await caller.codexGuard.scan({
      files: [{ filename: "api/x.ts", content: "return { rate: Math.random() };" }],
    });
    expect(res.totalDeviations).toBeGreaterThanOrEqual(1);
  });

  it("codexGuard.evaluateClaim rejects overstating a seeded B2 (DOCUMENTED) as VERIFIED", async () => {
    seed();
    const res = await caller.codexGuard.evaluateClaim({
      capabilityCode: "B2-ORCHESTRATOR",
      claimedState: "VERIFIED",
    });
    expect(res.verdict).toBe("OVERSTATED");
    expect(res.actualState).toBe("DOCUMENTED");
  });

  it("codexGuard.evaluateClaim confirms a truthful VERIFIED claim for a test-backed capability", async () => {
    seed();
    const res = await caller.codexGuard.evaluateClaim({
      capabilityCode: "CAP-REFLECTION-CYCLE",
      claimedState: "VERIFIED",
    });
    expect(res.verdict).toBe("CONFIRMED");
  });
});

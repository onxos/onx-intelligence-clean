// ============================================================
// USFIP ENGINE (M5) — UNIT TESTS
// Covers the Self-First ladder, ISES 12-dim scoring/tiers,
// Provider Capital evolution, the 5-question Sovereignty Loop,
// and the ISMF 6-metric sovereignty report.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";
import {
  scoreSource,
  seedProviders,
  evolveCapital,
  runSovereigntyLoop,
  computeIsmf,
  createSovereignty,
  sovereigntyReport,
  SELF_FIRST_LADDER,
  LAYER_COST,
  ISES_DIMENSIONS,
  type QueryContext,
} from "../usfip-engine";

const caller = appRouter.createCaller({} as any);

const internalCtx = (id: string): QueryContext => ({
  id,
  knowsInternally: true,
  ownsData: true,
  hasReusableJudgment: true,
  hasWisdom: true,
  externalNecessary: false,
});
const frontierCtx = (id: string): QueryContext => ({
  id,
  knowsInternally: false,
  ownsData: false,
  hasReusableJudgment: false,
  hasWisdom: false,
  externalNecessary: true,
});

describe("USFIP — ISES source scoring", () => {
  it("has 12 dimensions and a $0 internal layer", () => {
    expect(ISES_DIMENSIONS).toHaveLength(12);
    expect(SELF_FIRST_LADDER[0]).toBe("L1_IURG");
    expect(LAYER_COST.L1_IURG).toBe(0);
  });

  it("scores a strong source as T1 and a weak source as T4", () => {
    const strong = scoreSource(Object.fromEntries(ISES_DIMENSIONS.map((d) => [d, 0.9])));
    expect(strong.score).toBe(90);
    expect(strong.tier).toBe("T1");

    const weak = scoreSource(Object.fromEntries(ISES_DIMENSIONS.map((d) => [d, 0.2])));
    expect(weak.score).toBe(20);
    expect(weak.tier).toBe("T4");
  });

  it("identifies the weakest dimension", () => {
    const r = scoreSource({ domainFitness: 0.9, risk: 0.1, evidenceQuality: 0.8 });
    expect(r.weakest).toBe("risk");
  });
});

describe("USFIP — Provider Capital evolution", () => {
  it("seeds five providers with OpenAI at 90.34", () => {
    const ps = seedProviders();
    expect(ps).toHaveLength(5);
    expect(ps.find((p) => p.id === "OpenAI")?.capital).toBe(90.34);
  });

  it("grows capital on a good outcome and shrinks it on a bad one", () => {
    const [openai] = seedProviders();
    const up = evolveCapital(openai, 1);
    expect(up.capital).toBe(92.34);
    expect(up.wins).toBe(1);
    const down = evolveCapital(openai, 0);
    expect(down.capital).toBe(88.34);
    expect(down.wins).toBe(0);
  });
});

describe("USFIP — Sovereignty Loop", () => {
  it("resolves internally at L1 ($0) when knowledge is owned", () => {
    const d = runSovereigntyLoop(internalCtx("q1"));
    expect(d.internalSufficient).toBe(true);
    expect(d.resolvedLayer).toBe("L1_IURG");
    expect(d.cost).toBe(0);
    expect(d.confidence).toBe(1);
    expect(d.advisory).toBe(false);
  });

  it("logs external as advisory only when internal was sufficient", () => {
    const d = runSovereigntyLoop({ ...internalCtx("q2"), externalNecessary: true });
    expect(d.internalSufficient).toBe(true);
    expect(d.resolvedLayer).toBe("L1_IURG");
    expect(d.advisory).toBe(true);
  });

  it("escalates to frontier AI as a teacher (conf 0.30–0.50) when needed", () => {
    const d = runSovereigntyLoop(frontierCtx("q3"));
    expect(d.internalSufficient).toBe(false);
    expect(d.resolvedLayer).toBe("L3_FRONTIER_AI");
    expect(d.confidence).toBeGreaterThanOrEqual(0.3);
    expect(d.confidence).toBeLessThanOrEqual(0.5);
  });
});

describe("USFIP — ISMF metrics", () => {
  it("declares sovereignty when all six metrics pass", () => {
    const ledger = [
      ...Array.from({ length: 8 }, (_, i) => runSovereigntyLoop(internalCtx(`in-${i}`))),
      ...Array.from({ length: 2 }, (_, i) => runSovereigntyLoop(frontierCtx(`ex-${i}`))),
    ];
    const m = computeIsmf(ledger, 5);
    expect(m.KSR).toBe(0.8);
    expect(m.PDR).toBe(0.2);
    expect(m.KRR).toBe(0.8);
    expect(m.KOR).toBe(0.8);
    expect(m.SAI).toBeGreaterThan(0);
    expect(m.sovereign).toBe(true);
  });

  it("fails sovereignty when every query goes external", () => {
    const ledger = Array.from({ length: 5 }, (_, i) => runSovereigntyLoop(frontierCtx(`e-${i}`)));
    const m = computeIsmf(ledger, 0);
    expect(m.KSR).toBe(0);
    expect(m.sovereign).toBe(false);
  });

  it("reports capital growth after a good outcome", () => {
    const state = createSovereignty();
    state.providers[0] = evolveCapital(state.providers[0], 1);
    const report = sovereigntyReport(state);
    expect(report.capitalGrowth).toBeGreaterThan(0);
  });
});

describe("USFIP router", () => {
  beforeEach(async () => {
    await caller.usfip.reset();
  });

  it("exposes the ladder, questions and thresholds", async () => {
    const l = await caller.usfip.ladder();
    expect(l.ladder).toHaveLength(5);
    expect(l.questions).toHaveLength(5);
    expect(l.internalTarget).toBe(0.92);
  });

  it("runs loops and produces a sovereign report", async () => {
    await caller.usfip.evolve({ providerId: "OpenAI", outcome: 1 });
    for (let i = 0; i < 8; i++) await caller.usfip.loop(internalCtx(`in-${i}`));
    for (let i = 0; i < 2; i++) await caller.usfip.loop(frontierCtx(`ex-${i}`));
    const report = await caller.usfip.report();
    expect(report.queries).toBe(10);
    expect(report.ismf.KSR).toBeCloseTo(0.8);
    expect(report.ismf.sovereign).toBe(true);
    expect(report.capitalGrowth).toBeGreaterThan(0);
  });
});

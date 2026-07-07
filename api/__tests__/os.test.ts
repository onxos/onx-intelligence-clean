// ============================================================
// OS OBJECTS (§5) — UNIT TESTS (M6)
// Covers the 11-stage lifecycle, GoalEngine, FlourishingEngine
// (VanderWeele-6 + PERMA-5), the 7 companions, the Institutional
// DecisionEngine (7Q, harmonic quality), the ContinuityEngine
// (7 categories + 30/90 forecast), and the OS constitutions.
// ============================================================
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import {
  computeGoalProgress,
  computeFlourishing,
  companionCanAccess,
  resolveCompanion,
  authorityRank,
  advanceDecision,
  decisionQuality,
  continuityForecast,
  exportContext,
  CONSTITUTIONAL_LIFECYCLE,
  COMPANIONS,
  DECISION_QUESTIONS,
  CONTINUITY_CATEGORIES,
  VANDERWEELE_DOMAINS,
  PERMA_DOMAINS,
  PERSONAL_OS,
  INSTITUTIONAL_OS,
} from "../os-objects";

const caller = appRouter.createCaller({} as any);

describe("OS — constitutional lifecycle", () => {
  it("has the 11 stages ending in dream renewal", () => {
    expect(CONSTITUTIONAL_LIFECYCLE).toHaveLength(11);
    expect(CONSTITUTIONAL_LIFECYCLE[0]).toBe("DREAM");
    expect(CONSTITUTIONAL_LIFECYCLE[10]).toBe("DREAM_RENEWAL");
  });
});

describe("OS — GoalEngine", () => {
  it("marks a fully-done goal achieved", () => {
    expect(computeGoalProgress(5, 5).state).toBe("ACHIEVED");
  });
  it("flags a blocked goal at risk", () => {
    const g = computeGoalProgress(1, 10, true);
    expect(g.state).toBe("BLOCKED");
    expect(g.atRisk).toBe(true);
  });
});

describe("OS — FlourishingEngine (VanderWeele + PERMA)", () => {
  it("exposes 6 VanderWeele domains and 5 PERMA domains", () => {
    expect(VANDERWEELE_DOMAINS).toHaveLength(6);
    expect(PERMA_DOMAINS).toHaveLength(5);
  });
  it("computes a HIGH band when all maxed", () => {
    const vw = { HAPPINESS: 1, HEALTH: 1, MEANING: 1, CHARACTER: 1, RELATIONSHIPS: 1, STABILITY: 1 };
    const perma = { POSITIVE_EMOTION: 1, ENGAGEMENT: 1, RELATIONSHIPS: 1, MEANING: 1, ACCOMPLISHMENT: 1 };
    const r = computeFlourishing(vw, perma);
    expect(r.index).toBe(1);
    expect(r.band).toBe("HIGH");
  });
});

describe("OS — CompanionRuntime (7 companions)", () => {
  it("has 7 companions with one SUPREME founder", () => {
    expect(COMPANIONS).toHaveLength(7);
    expect(authorityRank("SUPREME")).toBeLessThan(authorityRank("MEDIUM"));
  });
  it("gives the founder universal access, others scoped", () => {
    expect(companionCanAccess("FOUNDER", "clinical")).toBe(true);
    expect(companionCanAccess("PERSONAL", "clinical")).toBe(false);
    expect(companionCanAccess("CLINIC", "clinical")).toBe(true);
  });
  it("resolves a companion by context", () => {
    expect(resolveCompanion("strategic")).toBe("EXECUTIVE");
    expect(resolveCompanion("unknown-context")).toBe("FOUNDER");
  });
});

describe("OS — InstitutionalDecisionEngine", () => {
  it("asks the 7 constitutional questions", () => {
    expect(DECISION_QUESTIONS).toHaveLength(7);
  });
  it("advances the decision cycle", () => {
    expect(advanceDecision("DRAFT", "submit")).toBe("REVIEW");
    expect(advanceDecision("REVIEW", "approve")).toBe("APPROVED");
    expect(advanceDecision("APPROVED", "execute")).toBe("EXECUTE");
    expect(advanceDecision("REVIEW", "execute")).toBe("REVIEW"); // invalid transition = no-op
  });
  it("uses harmonic-mean quality (any zero collapses to 0)", () => {
    expect(decisionQuality([1, 1, 1, 1, 1, 1, 1])).toBe(1);
    expect(decisionQuality([1, 1, 1, 1, 1, 1, 0])).toBe(0);
  });
});

describe("OS — ContinuityEngine", () => {
  it("tracks 7 element categories", () => {
    expect(CONTINUITY_CATEGORIES).toHaveLength(7);
  });
  it("forecasts 30/90-day survival with decay", () => {
    const all = Object.fromEntries(CONTINUITY_CATEGORIES.map((c) => [c, 0.9]));
    const f = continuityForecast(all as any, 0.1);
    expect(f.survivalScore).toBeCloseTo(0.9, 3);
    expect(f.day90).toBeLessThan(f.day30);
  });
  it("flags at-risk continuity", () => {
    const low = Object.fromEntries(CONTINUITY_CATEGORIES.map((c) => [c, 0.3]));
    expect(continuityForecast(low as any, 0.2).trend).toBe("AT_RISK");
  });
});

describe("OS — Personal & Institutional constitutions", () => {
  it("PersonalOS has 5 pillars, 9 layers, private dreams", () => {
    expect(PERSONAL_OS.pillars).toHaveLength(5);
    expect(PERSONAL_OS.layers).toBe(9);
    expect(PERSONAL_OS.flourishingIndicators).toBe(13);
    expect(PERSONAL_OS.defaultDreamVisibility).toBe("PRIVATE");
  });
  it("InstitutionalOS has 7 layers and delegates judgment", () => {
    expect(INSTITUTIONAL_OS.layers).toBe(7);
    expect(INSTITUTIONAL_OS.indicators).toBe(9);
    expect(INSTITUTIONAL_OS.delegatesTo).toBe("InstitutionalDecisionEngine");
  });
  it("exportContext respects agency + privacy", () => {
    const r = exportContext({ AGENCY: 0.9, PRIVACY: 0.8 });
    expect(r.agencyRespected).toBe(true);
  });
});

describe("OS router", () => {
  it("exposes lifecycle, companions, and decisions", async () => {
    expect((await caller.os.lifecycle()).stages).toHaveLength(11);
    expect((await caller.os.companions()).companions).toHaveLength(7);
    const d = await caller.os.advanceDecision({ state: "DRAFT", action: "submit" });
    expect(d.next).toBe("REVIEW");
  });
  it("computes flourishing and continuity through the router", async () => {
    const f = await caller.os.flourishing({ vanderweele: { HAPPINESS: 0.8 }, perma: { MEANING: 0.9 } });
    expect(f.index).toBeGreaterThan(0);
    const c = await caller.os.continuityForecast({ scores: { KNOWLEDGE: 0.8 }, monthlyDecay: 0.1 });
    expect(c.survivalScore).toBeGreaterThan(0);
  });
});

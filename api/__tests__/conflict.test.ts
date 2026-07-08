// ============================================================
// CONFLICT RESOLUTION ENGINE + ROUTER — UNIT TESTS (M4)
// Covers C1-C7 categories, the 8-level hierarchy, C7 never-auto
// rule, tie escalation, review paths, lifecycle, and versioning.
// ============================================================
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";
import {
  resolveConflict,
  rankOf,
  reviewPath,
  canTransition,
  bumpVersion,
  CONFLICT_CATEGORY_IDS,
  HIERARCHY_LEVELS,
} from "../conflict-engine";

const caller = appRouter.createCaller({} as any);

describe("Conflict engine — categories & hierarchy", () => {
  it("defines all 7 categories", () => {
    expect(CONFLICT_CATEGORY_IDS).toHaveLength(7);
    expect(CONFLICT_CATEGORY_IDS).toContain("C7");
  });

  it("orders the 8 priority levels highest-first", () => {
    expect(HIERARCHY_LEVELS).toHaveLength(8);
    expect(rankOf("EMERGENCY_SAFETY")).toBe(1);
    expect(rankOf("ADVISORY")).toBe(8);
    expect(rankOf("EMERGENCY_SAFETY")).toBeLessThan(rankOf("LEGAL"));
  });
});

describe("Conflict engine — resolution", () => {
  it("lets the higher-priority side win (auto)", () => {
    const r = resolveConflict({
      category: "C1",
      sideA: { label: "نمو", level: "ACTIVE_FOUNDER_INTENT" },
      sideB: { label: "رعاية", level: "ADVISORY" },
    });
    expect(r.winner).toBe("A");
    expect(r.autoResolved).toBe(true);
    expect(r.resolvedBy).toBe("ACTIVE_FOUNDER_INTENT");
  });

  it("never auto-resolves C7 — requires the founder", () => {
    const r = resolveConflict({
      category: "C7",
      sideA: { label: "مؤسس", level: "ACTIVE_FOUNDER_INTENT" },
      sideB: { label: "دليل", level: "INSTITUTIONAL_JUDGMENT" },
    });
    expect(r.winner).toBe("FOUNDER_REQUIRED");
    expect(r.autoResolved).toBe(false);
    expect(r.resolvedBy).toBe("ESCALATION");
  });

  it("applies an explicit founder decision on C7", () => {
    const r = resolveConflict({
      category: "C7",
      sideA: { label: "مؤسس", level: "ACTIVE_FOUNDER_INTENT" },
      sideB: { label: "دليل", level: "INSTITUTIONAL_JUDGMENT" },
      founderDecision: "A",
    });
    expect(r.winner).toBe("A");
    expect(r.resolvedBy).toBe("FOUNDER_DECISION");
  });

  it("escalates equal-priority conflicts to the founder", () => {
    const r = resolveConflict({
      category: "C2",
      sideA: { label: "سرعة", level: "INSTITUTIONAL_JUDGMENT" },
      sideB: { label: "جودة", level: "INSTITUTIONAL_JUDGMENT" },
    });
    expect(r.winner).toBe("FOUNDER_REQUIRED");
    expect(r.resolvedBy).toBe("ESCALATION");
  });

  it("lets emergency/safety override everything", () => {
    const r = resolveConflict({
      category: "C5",
      sideA: { label: "توسع", level: "EXPERIMENTAL" },
      sideB: { label: "استقرار", level: "EMERGENCY_SAFETY" },
    });
    expect(r.winner).toBe("B");
    expect(r.resolvedBy).toBe("EMERGENCY_SAFETY");
  });
});

describe("Conflict engine — review paths & lifecycle", () => {
  it("returns a 5-stage normal path (14-30 days)", () => {
    const p = reviewPath("NORMAL");
    expect(p.stages).toHaveLength(5);
    expect(p.window).toEqual({ min: 14, max: 30, unit: "days" });
    expect(p.temporaryValidityDays).toBeNull();
  });

  it("returns an emergency path (4-72h, temp valid 14 days)", () => {
    const p = reviewPath("EMERGENCY");
    expect(p.window.unit).toBe("hours");
    expect(p.temporaryValidityDays).toBe(14);
  });

  it("enforces lifecycle transitions", () => {
    expect(canTransition("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "SUPERSEDED")).toBe(true);
    expect(canTransition("SUPERSEDED", "ACTIVE")).toBe(false);
  });

  it("bumps semantic versions", () => {
    expect(bumpVersion("1.2.3", "MAJOR")).toBe("2.0.0");
    expect(bumpVersion("1.2.3", "MINOR")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "PATCH")).toBe("1.2.4");
  });
});

describe("Conflict router", () => {
  it("exposes categories and hierarchy", async () => {
    const cats = await caller.conflict.categories();
    expect(cats.total).toBe(7);
    const hier = await caller.conflict.hierarchy();
    expect(hier.levels).toHaveLength(8);
  });

  it("resolves through the router", async () => {
    const r = await caller.conflict.resolve({
      category: "C3",
      sideA: { label: "ربح", level: "EXPERIMENTAL" },
      sideB: { label: "رحمة", level: "CONSTITUTIONAL_PILLAR" },
    });
    expect(r.winner).toBe("B");
  });

  it("returns lifecycle and version helpers", async () => {
    const lc = await caller.conflict.lifecycle();
    expect(lc.states).toHaveLength(6);
    const v = await caller.conflict.bumpVersion({ version: "0.1.9", kind: "PATCH" });
    expect(v.next).toBe("0.1.10");
  });
});

// ============================================================
// REFLECTION CYCLE — UNIT TESTS (Wave 7-c)
// Mock-pg pattern shared with perception-adapter.test.ts.
// Covers: the 3 deterministic rules (completed cycle, recurrence,
// coverage), deterministic/idempotent ids (re-running never
// duplicates graph nodes), never-throw on graph/ingest failure,
// payload-value leak-freedom, and the HT-10 health counters.
// ============================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg before importing anything that touches the store
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

import { appRouter } from "../router";
import { listLiveObjects } from "../iuc-router";
import {
  CYCLE_DEFINITIONS,
  RECURRENCE_MIN_COUNT,
  computeInsights,
  runReflectionTick,
  getReflectionStatus,
  __resetReflectionCycleForTests,
  __setIngestFnForTests,
  __setListFnForTests,
  type InsightIngestInput,
  type LiveGraphNode,
} from "../lib/reflection-cycle";

const caller = appRouter.createCaller({} as never);

function perception(
  eventType: string,
  entity: string,
  overrides: Partial<LiveGraphNode> = {},
): LiveGraphNode {
  return {
    id: `perc-platform-${Math.random().toString(36).slice(2)}`,
    type: "PERCEPTION",
    contentText: `platform-event ${eventType} on ${entity} fields[a,b]`,
    ageDays: 0,
    ...overrides,
  };
}

const payrollCycle = (aggId = "run-1"): LiveGraphNode[] => [
  perception("payroll.run.created", `payroll_run#${aggId}`),
  perception("payroll.run.submitted", `payroll_run#${aggId}`),
  perception("payroll.run.approved", `payroll_run#${aggId}`),
  perception("payroll.run.paid", `payroll_run#${aggId}`),
];

beforeEach(() => {
  __resetReflectionCycleForTests();
  queryMock.mockReset();
});

describe("computeInsights — rule 1: completed cycle", () => {
  it("emits a payroll-cycle insight when all 4 stages exist for one aggregate", () => {
    const insights = computeInsights(payrollCycle("run-7"));
    const cycle = insights.find((i) => i.id === "insight-cycle-payroll-run-7");
    expect(cycle).toBeDefined();
    expect(cycle).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(cycle?.contentText).toContain("دورة رواتب مكتملة بنجاح");
    expect(cycle?.contentText).toContain("payroll.run.paid");
  });

  it("does NOT emit a cycle insight while the chain is incomplete", () => {
    const nodes = payrollCycle("run-7").slice(0, 3); // paid missing
    const insights = computeInsights(nodes);
    expect(insights.find((i) => i.id.startsWith("insight-cycle-"))).toBeUndefined();
  });

  it("does NOT mix stages across different aggregates", () => {
    const nodes = [
      perception("payroll.run.created", "payroll_run#a"),
      perception("payroll.run.submitted", "payroll_run#a"),
      perception("payroll.run.approved", "payroll_run#b"),
      perception("payroll.run.paid", "payroll_run#b"),
    ];
    expect(computeInsights(nodes).find((i) => i.id.startsWith("insight-cycle-"))).toBeUndefined();
  });

  it("emits one insight per completed aggregate, deterministically ordered", () => {
    const nodes = [...payrollCycle("run-2"), ...payrollCycle("run-1")];
    const ids = computeInsights(nodes)
      .filter((i) => i.id.startsWith("insight-cycle-"))
      .map((i) => i.id);
    expect(ids).toEqual(["insight-cycle-payroll-run-1", "insight-cycle-payroll-run-2"]);
  });
});

describe("computeInsights — rule 2: recurrence", () => {
  it("emits a recurrence insight at ≥3 same-type events within 24h", () => {
    const nodes = [
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      perception("crm.appointment.noshow", "appointment#3"),
    ];
    const insight = computeInsights(nodes).find(
      (i) => i.id === "insight-pattern-crm.appointment.noshow",
    );
    expect(insight).toBeDefined();
    expect(insight?.contentText).toBe("نمط متكرر: crm.appointment.noshow ×3 خلال آخر 24 ساعة");
    expect(insight?.sources).toBe(3);
    expect(RECURRENCE_MIN_COUNT).toBe(3);
  });

  it("ignores events older than 24h and counts below threshold", () => {
    const nodes = [
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      perception("crm.appointment.noshow", "appointment#3", { ageDays: 2.5 }),
    ];
    expect(
      computeInsights(nodes).find((i) => i.id.startsWith("insight-pattern-")),
    ).toBeUndefined();
  });
});

describe("computeInsights — rule 3: domain coverage", () => {
  it("counts distinct domains from event-type prefixes into one insight", () => {
    const nodes = [
      perception("finance.payment.recorded", "payment#1"),
      perception("payroll.run.created", "payroll_run#1"),
      perception("insurance.policy.issued", "policy#1"),
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.booked", "appointment#2"),
    ];
    const coverage = computeInsights(nodes).find((i) => i.id === "insight-coverage");
    expect(coverage).toBeDefined();
    expect(coverage?.contentText).toContain("اتساع إدراك العقل: 4 مجالات");
    expect(coverage?.contentText).toContain("crm");
    expect(coverage?.contentText).toContain("payroll");
    expect(coverage?.sources).toBe(4);
  });

  it("emits nothing at all when there are no perceptions", () => {
    const nodes: LiveGraphNode[] = [
      { id: "seed-fi", type: "FOUNDER_INTENT" },
      { id: "seed-patt", type: "PATTERN", contentText: "not a perception" },
    ];
    expect(computeInsights(nodes)).toEqual([]);
  });
});

describe("computeInsights — payload-value leak-freedom", () => {
  it("insight contentText never contains payload field names or values", () => {
    const nodes = [
      ...payrollCycle("run-9"),
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      perception("crm.appointment.noshow", "appointment#3"),
    ].map((n) => ({
      ...n,
      contentText: `${n.contentText?.split(" fields[")[0]} fields[secretKey,iban,salary]`,
    }));
    const insights = computeInsights(nodes);
    expect(insights.length).toBeGreaterThanOrEqual(3);
    for (const insight of insights) {
      expect(insight.contentText).not.toContain("secretKey");
      expect(insight.contentText).not.toContain("iban");
      expect(insight.contentText).not.toContain("salary");
      expect(insight.contentText).not.toContain("fields[");
      expect(insight.contentText.length).toBeLessThanOrEqual(300);
    }
  });
});

describe("runReflectionTick (through the real iuc.ingest path)", () => {
  it("ingests insights as PATTERN R2 nodes into the live graph", async () => {
    __setListFnForTests(() => [
      ...payrollCycle("run-42"),
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      perception("crm.appointment.noshow", "appointment#3"),
    ]);

    const status = await runReflectionTick();

    expect(status.insightsGenerated).toBe(3); // cycle + recurrence + coverage
    expect(status.insightsFailed).toBe(0);
    expect(status.ticksTotal).toBe(1);
    expect(status.ticksSkipped).toBe(0);
    expect(status.lastRunAt).not.toBeNull();

    const live = listLiveObjects();
    const cycle = live.find((o) => o.id === "insight-cycle-payroll-run-42");
    const pattern = live.find((o) => o.id === "insight-pattern-crm.appointment.noshow");
    const coverage = live.find((o) => o.id === "insight-coverage");
    expect(cycle).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(pattern?.contentText).toContain("×3");
    expect(coverage?.contentText).toContain("اتساع إدراك العقل");
  });

  it("is idempotent: re-running the tick upserts, never duplicates", async () => {
    __setListFnForTests(() => payrollCycle("run-42"));

    await runReflectionTick();
    await runReflectionTick();
    await runReflectionTick();

    const matches = listLiveObjects().filter((o) => o.id === "insight-cycle-payroll-run-42");
    expect(matches).toHaveLength(1);
    const coverages = listLiveObjects().filter((o) => o.id === "insight-coverage");
    expect(coverages).toHaveLength(1);
    expect(getReflectionStatus().ticksTotal).toBe(3);
  });

  it("NEVER throws when the graph read fails — silent skip with counters", async () => {
    __setListFnForTests(() => {
      throw new Error("graph exploded");
    });

    await expect(runReflectionTick()).resolves.toBeDefined();
    const status = getReflectionStatus();
    expect(status.ticksSkipped).toBe(1);
    expect(status.lastError).toContain("graph exploded");
    expect(status.insightsGenerated).toBe(0);
  });

  it("NEVER throws when ingest fails — poison insight counted, cycle continues", async () => {
    __setListFnForTests(() => [
      ...payrollCycle("run-1"),
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      perception("crm.appointment.noshow", "appointment#3"),
    ]);
    __setIngestFnForTests(async (input: InsightIngestInput) => {
      if (input.id.startsWith("insight-cycle-")) throw new Error("boom");
      return { stored: true };
    });

    const status = await runReflectionTick();

    expect(status.insightsFailed).toBe(1);
    expect(status.insightsGenerated).toBe(2);
    expect(status.lastError).toContain("boom");
  });

  it("cycle definitions include the payroll chain ending in paid", () => {
    const payroll = CYCLE_DEFINITIONS.find((d) => d.domain === "payroll");
    expect(payroll?.stages[payroll.stages.length - 1]).toBe("payroll.run.paid");
  });
});

describe("health.reflection (HT-10 counters)", () => {
  it("exposes numbers/timestamps only — no insight contents or payloads", async () => {
    __setListFnForTests(() => payrollCycle("run-5"));
    __setIngestFnForTests(async () => ({ stored: true }));
    await runReflectionTick();

    const res = await caller.health.reflection();

    expect(res).toMatchObject({
      insightsGenerated: 2, // cycle + coverage
      insightsFailed: 0,
      ticksTotal: 1,
      ticksSkipped: 0,
    });
    expect(res.rulesEvaluated).toBeGreaterThan(0);
    expect(res.perceptionsScanned).toBe(4);
    expect(typeof res.lastRunAt).toBe("string");
    expect(res.lastError).toBeNull();
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("دورة");
  });
});

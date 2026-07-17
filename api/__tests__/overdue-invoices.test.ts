// ============================================================
// OVERDUE INVOICES — UNIT TESTS (Wave 13-c "Mind spots overdue invoices")
// Mock-pg pattern shared with revenue-pulse.test.ts / noshow-anomaly.test.ts.
// Covers rule 7 of the reflection cycle: the deterministic
// insight-overdue-invoices object over the billing artery —
// perceived billing.invoice.overdue events (N). Cases: zero overdue
// invoices ⇒ no insight (silent skip), a single overdue invoice already
// births the insight (N ≥ 1 threshold), exact deterministic Arabic text
// at N=3 (same wording for every N — no conditional singular/plural),
// input order determinism, tick re-runs ⇒ upsert never duplicates,
// in-place update when N grows, the insight is served over
// titan.listInsights, rulesEvaluated grew by one (6 + cycle defs),
// never-throw on ingest failure, and no perc-*/ack-* internals or
// payload field names/values ever leak into the insight text.
// NOTE: the IURG type enum is closed (16 types, iuc-engine.ts) and the
// ingest schema rejects anything else, so the overdue-invoices semantic
// is carried by the stable id insight-overdue-invoices while the object
// stays PATTERN/R2 like every other insight.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock pg before importing anything that touches the store
const queryMock = vi.fn();
vi.mock("pg", () => ({
  Pool: class {
    query = queryMock;
  },
}));

import { appRouter } from "../router";
import { listLiveObjects } from "../iuc-router";
import { env } from "../lib/env";
import type { TrpcContext } from "../context";
import { ACK_ID_PREFIX, VERDICT_LABEL_AR, type AckVerdict } from "../lib/insight-ack";
import {
  OVERDUE_INVOICES_INSIGHT_ID,
  OVERDUE_INVOICE_EVENT,
  OVERDUE_INVOICES_MIN_COUNT,
  NOSHOW_ANOMALY_INSIGHT_ID,
  REVENUE_PULSE_INSIGHT_ID,
  VERDICTS_INSIGHT_ID,
  CYCLE_DEFINITIONS,
  computeInsights,
  runReflectionTick,
  getReflectionStatus,
  __resetReflectionCycleForTests,
  __setIngestFnForTests,
  __setListFnForTests,
  type InsightIngestInput,
  type LiveGraphNode,
} from "../lib/reflection-cycle";

const BRIDGE_KEY = "wave13c-test-bridge-key";

/** Caller whose ctx carries a real Request, with or without the bridge header. */
function bridgeCaller(key?: string) {
  const headers = new Headers();
  if (key) headers.set("x-onx-bridge-key", key);
  return appRouter.createCaller({
    req: new Request("http://platform.test/trpc/titan.listInsights", { headers }),
    resHeaders: new Headers(),
  } as TrpcContext);
}

/** Graph node with the exact shape perception-adapter.toPerceptionObject plants. */
function perception(eventType: string, entity: string): LiveGraphNode {
  return {
    id: `perc-platform-${Math.random().toString(36).slice(2)}`,
    type: "PERCEPTION",
    contentText: `platform-event ${eventType} on ${entity} fields[billingId,totalAmount,paidAmount,remaining,daysOverdue]`,
    ageDays: 0,
  };
}

function overdue(n: number): LiveGraphNode {
  return perception(OVERDUE_INVOICE_EVENT, `billing#ov-${n}`);
}

/** Graph node with the exact shape insight-ack.buildAckObject plants. */
function ackNode(insightId: string, verdict: AckVerdict): LiveGraphNode {
  return {
    id: `${ACK_ID_PREFIX}${insightId}`,
    type: "PATTERN",
    contentText: `حكم المؤسس على الرؤية ${insightId}: ${VERDICT_LABEL_AR[verdict]} (قُرر في 2026-07-10T08:00:00.000Z)`,
    ageDays: 0,
  };
}

const overdueFrom = (nodes: LiveGraphNode[]) =>
  computeInsights(nodes).find((i) => i.id === OVERDUE_INVOICES_INSIGHT_ID);

const savedEnv = {
  bridgeEnabled: env.bridgeEnabled,
  bridgeSharedSecret: env.bridgeSharedSecret,
};

beforeEach(() => {
  __resetReflectionCycleForTests();
  queryMock.mockReset();
  env.bridgeEnabled = true;
  env.bridgeSharedSecret = BRIDGE_KEY;
});

afterEach(() => {
  env.bridgeEnabled = savedEnv.bridgeEnabled;
  env.bridgeSharedSecret = savedEnv.bridgeSharedSecret;
  __resetReflectionCycleForTests();
});

describe("computeInsights — rule 7: zero overdue invoices ⇒ silent skip", () => {
  it("emits no insight-overdue-invoices when zero overdue invoices were perceived", () => {
    const nodes = [
      perception("billing.invoice.created", "invoice#1"),
      perception("finance.payment.received", "payment#1"),
      { id: "seed-patt", type: "PATTERN", contentText: "not a perception" },
    ];
    expect(overdueFrom(nodes)).toBeUndefined();
  });

  it("emits nothing at all on an empty graph — no empty object, no crash", () => {
    expect(computeInsights([])).toEqual([]);
  });

  it("ignores overdue event names inside non-PERCEPTION nodes", () => {
    const nodes: LiveGraphNode[] = [
      {
        id: "seed-patt",
        type: "PATTERN",
        contentText: `platform-event ${OVERDUE_INVOICE_EVENT} on billing#x`,
      },
    ];
    expect(overdueFrom(nodes)).toBeUndefined();
  });
});

describe("computeInsights — rule 7: birth at N=1", () => {
  it("a single overdue invoice already births the insight (threshold N ≥ 1)", () => {
    expect(OVERDUE_INVOICES_MIN_COUNT).toBe(1);
    const insight = overdueFrom([overdue(1)]);
    expect(insight).toBeDefined();
    expect(insight).toMatchObject({
      id: OVERDUE_INVOICES_INSIGHT_ID,
      type: "PATTERN",
      rank: 2,
      verification: "PROBABLE",
      trust: 0.75,
      amanah: 0.9,
      founderAlignment: 0.7,
      validated: true,
      sources: 1,
    });
    // Same wording at N=1 — no conditional singular/plural.
    expect(insight?.contentText).toBe(
      "فواتير متأخرة: رُصدت 1 فاتورة تجاوزت أجل السداد دون تحصيل",
    );
  });
});

describe("computeInsights — rule 7: deterministic text and counts", () => {
  it("3 overdue invoices ⇒ exact deterministic Arabic text with sources = 3", () => {
    const insight = overdueFrom([overdue(1), overdue(2), overdue(3)]);
    expect(insight?.sources).toBe(3);
    expect(insight?.contentText).toBe(
      "فواتير متأخرة: رُصدت 3 فاتورة تجاوزت أجل السداد دون تحصيل",
    );
  });

  it("is deterministic: same perceptions in any order ⇒ identical text", () => {
    const nodes = [
      overdue(1),
      perception("billing.invoice.created", "invoice#9"),
      overdue(2),
      perception("finance.payment.received", "payment#9"),
      overdue(3),
    ];
    const forward = overdueFrom(nodes)?.contentText;
    const backward = overdueFrom([...nodes].reverse())?.contentText;
    const shuffled = overdueFrom([nodes[4], nodes[2], nodes[0], nodes[3], nodes[1]])?.contentText;
    expect(forward).toBe(
      "فواتير متأخرة: رُصدت 3 فاتورة تجاوزت أجل السداد دون تحصيل",
    );
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });
});

describe("runReflectionTick — rule 7 through the real iuc.ingest path", () => {
  it("re-running the tick ×3 upserts the single insight-overdue-invoices object, never duplicates", async () => {
    __setListFnForTests(() => [overdue(1), overdue(2)]);

    await runReflectionTick();
    await runReflectionTick();
    await runReflectionTick();

    const matches = listLiveObjects().filter((o) => o.id === OVERDUE_INVOICES_INSIGHT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(matches[0]?.contentText).toBe(
      "فواتير متأخرة: رُصدت 2 فاتورة تجاوزت أجل السداد دون تحصيل",
    );
    expect(getReflectionStatus().ticksTotal).toBe(3);
  });

  it("a fresh overdue invoice on the next tick updates the same object in place", async () => {
    const nodes = [overdue(1)];
    __setListFnForTests(() => nodes);

    await runReflectionTick();
    const before = listLiveObjects().find((o) => o.id === OVERDUE_INVOICES_INSIGHT_ID);
    expect(before?.contentText).toBe(
      "فواتير متأخرة: رُصدت 1 فاتورة تجاوزت أجل السداد دون تحصيل",
    );

    nodes.push(overdue(2), overdue(3));
    await runReflectionTick();

    const after = listLiveObjects().filter((o) => o.id === OVERDUE_INVOICES_INSIGHT_ID);
    expect(after).toHaveLength(1);
    expect(after[0]?.contentText).toBe(
      "فواتير متأخرة: رُصدت 3 فاتورة تجاوزت أجل السداد دون تحصيل",
    );
  });

  it("each tick counts the overdue-invoices rule in rulesEvaluated (6 + cycle defs — grew by one)", async () => {
    __setListFnForTests(() => []);
    await runReflectionTick();
    expect(getReflectionStatus().rulesEvaluated).toBe(6 + CYCLE_DEFINITIONS.length);
  });

  it("the overdue-invoices insight is served over titan.listInsights", async () => {
    __setListFnForTests(() => [overdue(1), overdue(2)]);
    await runReflectionTick();

    const served = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 200 });

    const insight = served.insights.find((i) => i.id === OVERDUE_INVOICES_INSIGHT_ID);
    expect(insight).toBeDefined();
    expect(insight?.contentText).toContain("فواتير متأخرة");
    expect(insight?.contentText).toContain("رُصدت 2 فاتورة");
  });

  it("NEVER throws when ingest fails on the overdue insight — poison counted, cycle continues", async () => {
    __setListFnForTests(() => [overdue(1), perception("billing.invoice.created", "invoice#1")]);
    __setIngestFnForTests(async (input: InsightIngestInput) => {
      if (input.id === OVERDUE_INVOICES_INSIGHT_ID) throw new Error("overdue boom");
      return { stored: true };
    });

    const status = await runReflectionTick();

    expect(status.insightsFailed).toBe(1);
    expect(status.lastError).toContain("overdue boom");
    expect(status.insightsGenerated).toBeGreaterThan(0);
  });
});

describe("rule 7 coexists with the other rules — none regress", () => {
  const payrollCycle = (aggId: string): LiveGraphNode[] =>
    CYCLE_DEFINITIONS[0].stages.map((stage) => perception(stage, `payroll_run#${aggId}`));

  it("rules 1-6 all still fire, unchanged, alongside the overdue-invoices insight", () => {
    const nodes = [
      ...payrollCycle("run-13c"),
      overdue(1),
      overdue(2),
      overdue(3),
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      ackNode("insight-w13c-a", "approved"),
      perception("billing.invoice.created", "invoice#1"),
      perception("finance.payment.received", "payment#1"),
    ];
    const insights = computeInsights(nodes);
    const ids = insights.map((i) => i.id);

    // Rule 1 — completed payroll cycle
    expect(ids).toContain("insight-cycle-payroll-run-13c");
    // Rule 2 — recurrence ×3 on the same overdue events, untouched
    const recurrence = insights.find((i) => i.id === "insight-pattern-billing.invoice.overdue");
    expect(recurrence?.contentText).toContain("×3");
    // Rule 3 — coverage counts billing among the domains
    const coverage = insights.find((i) => i.id === "insight-coverage");
    expect(coverage?.contentText).toContain("billing");
    // Rule 4 — verdict awareness unaffected by billing perceptions
    const verdicts = insights.find((i) => i.id === VERDICTS_INSIGHT_ID);
    expect(verdicts?.contentText).toContain("المؤسس أصدر 1 أحكام");
    // Rule 5 — revenue pulse unaffected (overdue events are not created/received)
    const pulse = insights.find((i) => i.id === REVENUE_PULSE_INSIGHT_ID);
    expect(pulse?.contentText).toContain("أُصدرت 1 فاتورة واستُلمت 1 دفعة");
    // Rule 6 — no-show anomaly unaffected
    const anomaly = insights.find((i) => i.id === NOSHOW_ANOMALY_INSIGHT_ID);
    expect(anomaly?.contentText).toContain("شذوذ الغيابات");
    // Rule 7 — the new insight: 3 overdue invoices
    const overdueInsight = insights.find((i) => i.id === OVERDUE_INVOICES_INSIGHT_ID);
    expect(overdueInsight?.contentText).toBe(
      "فواتير متأخرة: رُصدت 3 فاتورة تجاوزت أجل السداد دون تحصيل",
    );
  });

  it("without any overdue invoice, computeInsights output carries no overdue id", () => {
    const nodes = [
      perception("billing.invoice.created", "invoice#1"),
      ackNode("insight-w13c-b", "rejected"),
    ];
    const ids = computeInsights(nodes).map((i) => i.id);
    expect(ids).toContain("insight-coverage");
    expect(ids).toContain(VERDICTS_INSIGHT_ID);
    expect(ids).not.toContain(OVERDUE_INVOICES_INSIGHT_ID);
  });

  it("overdue insight text never leaks perc-*/ack-* internals or payload field names", () => {
    const insight = overdueFrom([overdue(1), overdue(2), ackNode("insight-w13c-c", "approved")]);
    expect(insight?.contentText).not.toContain("perc-");
    expect(insight?.contentText).not.toContain("ack-");
    expect(insight?.contentText).not.toContain("fields[");
    expect(insight?.contentText).not.toContain("billingId");
    expect(insight?.contentText).not.toContain("totalAmount");
    expect(insight?.contentText).not.toContain("daysOverdue");
    expect(insight?.contentText.length ?? 0).toBeLessThanOrEqual(300);
  });
});

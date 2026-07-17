// ============================================================
// REVENUE PULSE — UNIT TESTS (Wave 11-c "Mind reflects on revenue")
// Mock-pg pattern shared with verdict-awareness.test.ts.
// Covers rule 5 of the reflection cycle: the always-updated
// insight-revenue-pulse object over the live revenue artery —
// perceived billing.invoice.created vs finance.payment.received
// events. Cases: double zero ⇒ no insight at all, invoices without
// payments ⇒ 0% collection ratio, payments without invoices ⇒ counts
// with no ratio, mixed ⇒ correct counts and rounded ratio, input
// order determinism, tick re-runs ⇒ upsert never duplicates, the
// insight is served over titan.listInsights, and the other rules
// (especially rule 3 coverage and rule 4 verdicts) stay untouched.
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
  REVENUE_PULSE_INSIGHT_ID,
  REVENUE_INVOICE_EVENT,
  REVENUE_PAYMENT_EVENT,
  VERDICTS_INSIGHT_ID,
  CYCLE_DEFINITIONS,
  computeInsights,
  runReflectionTick,
  getReflectionStatus,
  __resetReflectionCycleForTests,
  __setListFnForTests,
  type LiveGraphNode,
} from "../lib/reflection-cycle";

const BRIDGE_KEY = "wave11c-test-bridge-key";

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
    contentText: `platform-event ${eventType} on ${entity} fields[a,b]`,
    ageDays: 0,
  };
}

function invoice(n: number): LiveGraphNode {
  return perception(REVENUE_INVOICE_EVENT, `invoice#inv-${n}`);
}

function payment(n: number): LiveGraphNode {
  return perception(REVENUE_PAYMENT_EVENT, `payment#pay-${n}`);
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

const pulseFrom = (nodes: LiveGraphNode[]) =>
  computeInsights(nodes).find((i) => i.id === REVENUE_PULSE_INSIGHT_ID);

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

describe("computeInsights — rule 5: double zero ⇒ silent skip", () => {
  it("emits no insight-revenue-pulse when no invoices and no payments were perceived", () => {
    const nodes = [
      perception("crm.appointment.booked", "appointment#1"),
      perception("payroll.run.created", "payroll_run#1"),
      { id: "seed-patt", type: "PATTERN", contentText: "not a perception" },
    ];
    expect(pulseFrom(nodes)).toBeUndefined();
  });

  it("emits nothing at all on an empty graph — no empty object, no crash", () => {
    expect(computeInsights([])).toEqual([]);
  });

  it("ignores billing/finance event names inside non-PERCEPTION nodes", () => {
    const nodes: LiveGraphNode[] = [
      {
        id: "seed-patt",
        type: "PATTERN",
        contentText: `platform-event ${REVENUE_INVOICE_EVENT} on invoice#x`,
      },
    ];
    expect(pulseFrom(nodes)).toBeUndefined();
  });
});

describe("computeInsights — rule 5: invoices without payments", () => {
  it("3 invoices, 0 payments ⇒ exact deterministic Arabic text with a 0% ratio", () => {
    const insight = pulseFrom([invoice(1), invoice(2), invoice(3)]);
    expect(insight).toBeDefined();
    expect(insight).toMatchObject({
      id: REVENUE_PULSE_INSIGHT_ID,
      type: "PATTERN",
      rank: 2,
      verification: "PROBABLE",
      trust: 0.75,
      amanah: 0.9,
      founderAlignment: 0.7,
      validated: true,
      sources: 3,
    });
    expect(insight?.contentText).toBe(
      "نبض الإيراد: أُصدرت 3 فاتورة واستُلمت 0 دفعة (نسبة التحصيل 0%)",
    );
  });
});

describe("computeInsights — rule 5: payments without invoices", () => {
  it("0 invoices, 2 payments ⇒ counts only, no ratio segment", () => {
    const insight = pulseFrom([payment(1), payment(2)]);
    expect(insight).toBeDefined();
    expect(insight?.sources).toBe(2);
    expect(insight?.contentText).toBe("نبض الإيراد: أُصدرت 0 فاتورة واستُلمت 2 دفعة");
    expect(insight?.contentText).not.toContain("نسبة التحصيل");
    expect(insight?.contentText).not.toContain("%");
  });
});

describe("computeInsights — rule 5: mixed invoices and payments", () => {
  it("4 invoices, 3 payments ⇒ correct counts, sources and 75% ratio", () => {
    const insight = pulseFrom([invoice(1), invoice(2), invoice(3), invoice(4), payment(1), payment(2), payment(3)]);
    expect(insight?.sources).toBe(7);
    expect(insight?.contentText).toBe(
      "نبض الإيراد: أُصدرت 4 فاتورة واستُلمت 3 دفعة (نسبة التحصيل 75%)",
    );
  });

  it("rounds the ratio: 3 invoices, 2 payments ⇒ 67%", () => {
    const insight = pulseFrom([invoice(1), invoice(2), invoice(3), payment(1), payment(2)]);
    expect(insight?.contentText).toContain("نسبة التحصيل 67%");
  });

  it("payments can exceed invoices: 2 invoices, 3 payments ⇒ 150%", () => {
    const insight = pulseFrom([invoice(1), invoice(2), payment(1), payment(2), payment(3)]);
    expect(insight?.contentText).toBe(
      "نبض الإيراد: أُصدرت 2 فاتورة واستُلمت 3 دفعة (نسبة التحصيل 150%)",
    );
  });

  it("is deterministic: same perceptions in any order ⇒ identical text", () => {
    const nodes = [
      invoice(1),
      payment(1),
      invoice(2),
      perception("crm.appointment.booked", "appointment#9"),
      payment(2),
      invoice(3),
    ];
    const forward = pulseFrom(nodes)?.contentText;
    const backward = pulseFrom([...nodes].reverse())?.contentText;
    const shuffled = pulseFrom([nodes[4], nodes[2], nodes[5], nodes[0], nodes[3], nodes[1]])?.contentText;
    expect(forward).toBe("نبض الإيراد: أُصدرت 3 فاتورة واستُلمت 2 دفعة (نسبة التحصيل 67%)");
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });
});

describe("runReflectionTick — rule 5 through the real iuc.ingest path", () => {
  it("re-running the tick upserts the single insight-revenue-pulse object, never duplicates", async () => {
    __setListFnForTests(() => [invoice(1), invoice(2), payment(1)]);

    await runReflectionTick();
    await runReflectionTick();
    await runReflectionTick();

    const matches = listLiveObjects().filter((o) => o.id === REVENUE_PULSE_INSIGHT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(matches[0]?.contentText).toBe(
      "نبض الإيراد: أُصدرت 2 فاتورة واستُلمت 1 دفعة (نسبة التحصيل 50%)",
    );
    expect(getReflectionStatus().ticksTotal).toBe(3);
  });

  it("a fresh payment on the next tick updates the same object in place", async () => {
    const nodes = [invoice(1), invoice(2)];
    __setListFnForTests(() => nodes);

    await runReflectionTick();
    const before = listLiveObjects().find((o) => o.id === REVENUE_PULSE_INSIGHT_ID);
    expect(before?.contentText).toContain("نسبة التحصيل 0%");

    nodes.push(payment(1), payment(2));
    await runReflectionTick();

    const after = listLiveObjects().filter((o) => o.id === REVENUE_PULSE_INSIGHT_ID);
    expect(after).toHaveLength(1);
    expect(after[0]?.contentText).toBe(
      "نبض الإيراد: أُصدرت 2 فاتورة واستُلمت 2 دفعة (نسبة التحصيل 100%)",
    );
  });

  it("each tick counts the revenue-pulse rule in rulesEvaluated (6 + cycle defs since wave 13-c)", async () => {
    __setListFnForTests(() => []);
    await runReflectionTick();
    expect(getReflectionStatus().rulesEvaluated).toBe(6 + CYCLE_DEFINITIONS.length);
  });

  it("the revenue-pulse insight is served over titan.listInsights", async () => {
    __setListFnForTests(() => [invoice(1), payment(1)]);
    await runReflectionTick();

    const served = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 200 });

    const pulse = served.insights.find((i) => i.id === REVENUE_PULSE_INSIGHT_ID);
    expect(pulse).toBeDefined();
    expect(pulse?.contentText).toContain("نبض الإيراد");
    expect(pulse?.contentText).toContain("نسبة التحصيل 100%");
  });
});

describe("rule 5 coexists with the other rules — none regress", () => {
  const payrollCycle = (aggId: string): LiveGraphNode[] =>
    CYCLE_DEFINITIONS[0].stages.map((stage) => perception(stage, `payroll_run#${aggId}`));

  it("rules 1-4 all still fire, unchanged, alongside the revenue pulse", () => {
    const nodes = [
      ...payrollCycle("run-11c"),
      perception("crm.appointment.noshow", "appointment#1"),
      perception("crm.appointment.noshow", "appointment#2"),
      perception("crm.appointment.noshow", "appointment#3"),
      ackNode("insight-w11c-a", "approved"),
      invoice(1),
      invoice(2),
      payment(1),
    ];
    const insights = computeInsights(nodes);
    const ids = insights.map((i) => i.id);

    // Rule 1 — completed payroll cycle
    expect(ids).toContain("insight-cycle-payroll-run-11c");
    // Rule 2 — recurrence ×3
    const recurrence = insights.find((i) => i.id === "insight-pattern-crm.appointment.noshow");
    expect(recurrence?.contentText).toContain("×3");
    // Rule 3 — coverage counts billing and finance among the domains
    const coverage = insights.find((i) => i.id === "insight-coverage");
    expect(coverage?.contentText).toContain("اتساع إدراك العقل: 4 مجالات");
    expect(coverage?.contentText).toContain("billing");
    expect(coverage?.contentText).toContain("finance");
    // Rule 4 — verdict awareness unaffected by revenue perceptions
    const verdicts = insights.find((i) => i.id === VERDICTS_INSIGHT_ID);
    expect(verdicts?.contentText).toContain("المؤسس أصدر 1 أحكام");
    // Rule 5 — the new pulse
    const pulse = insights.find((i) => i.id === REVENUE_PULSE_INSIGHT_ID);
    expect(pulse?.contentText).toBe(
      "نبض الإيراد: أُصدرت 2 فاتورة واستُلمت 1 دفعة (نسبة التحصيل 50%)",
    );
  });

  it("without revenue events, computeInsights output is exactly as before (no pulse id)", () => {
    const nodes = [
      perception("crm.appointment.booked", "appointment#1"),
      ackNode("insight-w11c-b", "rejected"),
    ];
    const ids = computeInsights(nodes).map((i) => i.id);
    expect(ids).toContain("insight-coverage");
    expect(ids).toContain(VERDICTS_INSIGHT_ID);
    expect(ids).not.toContain(REVENUE_PULSE_INSIGHT_ID);
  });

  it("revenue insight text never leaks payload field names", () => {
    const insight = pulseFrom([invoice(1), payment(1)]);
    expect(insight?.contentText).not.toContain("fields[");
    expect(insight?.contentText).not.toContain("a,b");
    expect(insight?.contentText.length ?? 0).toBeLessThanOrEqual(300);
  });
});

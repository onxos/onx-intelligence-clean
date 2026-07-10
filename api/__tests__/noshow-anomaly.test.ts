// ============================================================
// NO-SHOW ANOMALY — UNIT TESTS (Wave 12-b "Mind spots absence anomalies")
// Mock-pg pattern shared with revenue-pulse.test.ts.
// Covers rule 6 of the reflection cycle: the deterministic
// insight-anomaly-noshow object over the CRM appointment artery —
// perceived crm.appointment.noshow (N) vs crm.appointment.completed (M)
// events. Cases: zero no-shows ⇒ no insight, one no-show ⇒ still below
// the N ≥ 2 threshold, two no-shows without completions ⇒ counts with
// no ratio, mixed ⇒ correct counts and rounded no-show ratio, input
// order determinism, tick re-runs ⇒ upsert never duplicates, in-place
// update when a fresh no-show arrives, the insight is served over
// titan.listInsights, rulesEvaluated grew by one, and no perc-*/ack-*
// internals ever leak into the insight text.
// NOTE (justified deviation): the IURG type enum is closed (16 types,
// iuc-engine.ts) and the ingest schema rejects anything else, so the
// ANOMALY semantic is carried by the stable id insight-anomaly-noshow
// while the object stays PATTERN/R2 like every other insight.
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
  NOSHOW_ANOMALY_INSIGHT_ID,
  NOSHOW_EVENT,
  APPOINTMENT_COMPLETED_EVENT,
  NOSHOW_ANOMALY_MIN_COUNT,
  REVENUE_PULSE_INSIGHT_ID,
  VERDICTS_INSIGHT_ID,
  CYCLE_DEFINITIONS,
  computeInsights,
  runReflectionTick,
  getReflectionStatus,
  __resetReflectionCycleForTests,
  __setListFnForTests,
  type LiveGraphNode,
} from "../lib/reflection-cycle";

const BRIDGE_KEY = "wave12b-test-bridge-key";

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

function noshow(n: number): LiveGraphNode {
  return perception(NOSHOW_EVENT, `appointment#ns-${n}`);
}

function completed(n: number): LiveGraphNode {
  return perception(APPOINTMENT_COMPLETED_EVENT, `appointment#done-${n}`);
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

const anomalyFrom = (nodes: LiveGraphNode[]) =>
  computeInsights(nodes).find((i) => i.id === NOSHOW_ANOMALY_INSIGHT_ID);

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

describe("computeInsights — rule 6: below-threshold silent skip", () => {
  it("emits no insight-anomaly-noshow when zero no-shows were perceived", () => {
    const nodes = [
      perception("crm.appointment.booked", "appointment#1"),
      completed(1),
      completed(2),
      { id: "seed-patt", type: "PATTERN", contentText: "not a perception" },
    ];
    expect(anomalyFrom(nodes)).toBeUndefined();
  });

  it("emits nothing at all on an empty graph — no empty object, no crash", () => {
    expect(computeInsights([])).toEqual([]);
  });

  it("one single no-show stays below the N ≥ 2 threshold ⇒ no insight", () => {
    expect(NOSHOW_ANOMALY_MIN_COUNT).toBe(2);
    expect(anomalyFrom([noshow(1), completed(1), completed(2)])).toBeUndefined();
  });

  it("ignores noshow event names inside non-PERCEPTION nodes", () => {
    const nodes: LiveGraphNode[] = [
      {
        id: "seed-patt",
        type: "PATTERN",
        contentText: `platform-event ${NOSHOW_EVENT} on appointment#x`,
      },
      {
        id: "seed-patt-2",
        type: "PATTERN",
        contentText: `platform-event ${NOSHOW_EVENT} on appointment#y`,
      },
    ];
    expect(anomalyFrom(nodes)).toBeUndefined();
  });
});

describe("computeInsights — rule 6: no-shows without completions", () => {
  it("2 no-shows, 0 completed ⇒ exact deterministic Arabic text with no ratio segment", () => {
    const insight = anomalyFrom([noshow(1), noshow(2)]);
    expect(insight).toBeDefined();
    expect(insight).toMatchObject({
      id: NOSHOW_ANOMALY_INSIGHT_ID,
      type: "PATTERN",
      rank: 2,
      verification: "PROBABLE",
      trust: 0.75,
      amanah: 0.9,
      founderAlignment: 0.7,
      validated: true,
      sources: 2,
    });
    expect(insight?.contentText).toBe(
      "شذوذ الغيابات: رُصد 2 غياب عن المواعيد مقابل 0 موعد مكتمل",
    );
    expect(insight?.contentText).not.toContain("نسبة الغياب");
    expect(insight?.contentText).not.toContain("%");
  });
});

describe("computeInsights — rule 6: mixed no-shows and completions", () => {
  it("2 no-shows, 2 completed ⇒ correct counts, sources and 50% no-show ratio", () => {
    const insight = anomalyFrom([noshow(1), noshow(2), completed(1), completed(2)]);
    expect(insight?.sources).toBe(4);
    expect(insight?.contentText).toBe(
      "شذوذ الغيابات: رُصد 2 غياب عن المواعيد مقابل 2 موعد مكتمل (نسبة الغياب 50%)",
    );
  });

  it("rounds the ratio: 2 no-shows, 1 completed ⇒ 67%", () => {
    const insight = anomalyFrom([noshow(1), noshow(2), completed(1)]);
    expect(insight?.sources).toBe(3);
    expect(insight?.contentText).toBe(
      "شذوذ الغيابات: رُصد 2 غياب عن المواعيد مقابل 1 موعد مكتمل (نسبة الغياب 67%)",
    );
  });

  it("is deterministic: same perceptions in any order ⇒ identical text", () => {
    const nodes = [
      noshow(1),
      completed(1),
      noshow(2),
      perception("crm.appointment.booked", "appointment#9"),
      completed(2),
      noshow(3),
    ];
    const forward = anomalyFrom(nodes)?.contentText;
    const backward = anomalyFrom([...nodes].reverse())?.contentText;
    const shuffled = anomalyFrom([nodes[4], nodes[2], nodes[5], nodes[0], nodes[3], nodes[1]])?.contentText;
    expect(forward).toBe(
      "شذوذ الغيابات: رُصد 3 غياب عن المواعيد مقابل 2 موعد مكتمل (نسبة الغياب 60%)",
    );
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });
});

describe("runReflectionTick — rule 6 through the real iuc.ingest path", () => {
  it("re-running the tick ×3 upserts the single insight-anomaly-noshow object, never duplicates", async () => {
    __setListFnForTests(() => [noshow(1), noshow(2), completed(1)]);

    await runReflectionTick();
    await runReflectionTick();
    await runReflectionTick();

    const matches = listLiveObjects().filter((o) => o.id === NOSHOW_ANOMALY_INSIGHT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(matches[0]?.contentText).toBe(
      "شذوذ الغيابات: رُصد 2 غياب عن المواعيد مقابل 1 موعد مكتمل (نسبة الغياب 67%)",
    );
    expect(getReflectionStatus().ticksTotal).toBe(3);
  });

  it("a fresh no-show on the next tick updates the same object in place", async () => {
    const nodes = [noshow(1), noshow(2), completed(1), completed(2)];
    __setListFnForTests(() => nodes);

    await runReflectionTick();
    const before = listLiveObjects().find((o) => o.id === NOSHOW_ANOMALY_INSIGHT_ID);
    expect(before?.contentText).toContain("نسبة الغياب 50%");

    nodes.push(noshow(3), noshow(4));
    await runReflectionTick();

    const after = listLiveObjects().filter((o) => o.id === NOSHOW_ANOMALY_INSIGHT_ID);
    expect(after).toHaveLength(1);
    expect(after[0]?.contentText).toBe(
      "شذوذ الغيابات: رُصد 4 غياب عن المواعيد مقابل 2 موعد مكتمل (نسبة الغياب 67%)",
    );
  });

  it("each tick counts the no-show-anomaly rule in rulesEvaluated (5 + cycle defs — grew by one)", async () => {
    __setListFnForTests(() => []);
    await runReflectionTick();
    expect(getReflectionStatus().rulesEvaluated).toBe(5 + CYCLE_DEFINITIONS.length);
  });

  it("the no-show anomaly insight is served over titan.listInsights", async () => {
    __setListFnForTests(() => [noshow(1), noshow(2), completed(1), completed(2)]);
    await runReflectionTick();

    const served = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 200 });

    const anomaly = served.insights.find((i) => i.id === NOSHOW_ANOMALY_INSIGHT_ID);
    expect(anomaly).toBeDefined();
    expect(anomaly?.contentText).toContain("شذوذ الغيابات");
    expect(anomaly?.contentText).toContain("نسبة الغياب 50%");
  });
});

describe("rule 6 coexists with the other rules — none regress", () => {
  const payrollCycle = (aggId: string): LiveGraphNode[] =>
    CYCLE_DEFINITIONS[0].stages.map((stage) => perception(stage, `payroll_run#${aggId}`));

  it("rules 1-5 all still fire, unchanged, alongside the no-show anomaly", () => {
    const nodes = [
      ...payrollCycle("run-12b"),
      noshow(1),
      noshow(2),
      noshow(3),
      completed(1),
      ackNode("insight-w12b-a", "approved"),
      perception("billing.invoice.created", "invoice#1"),
      perception("finance.payment.received", "payment#1"),
    ];
    const insights = computeInsights(nodes);
    const ids = insights.map((i) => i.id);

    // Rule 1 — completed payroll cycle
    expect(ids).toContain("insight-cycle-payroll-run-12b");
    // Rule 2 — recurrence ×3 on the same noshow events, untouched
    const recurrence = insights.find((i) => i.id === "insight-pattern-crm.appointment.noshow");
    expect(recurrence?.contentText).toContain("×3");
    // Rule 3 — coverage counts crm among the domains
    const coverage = insights.find((i) => i.id === "insight-coverage");
    expect(coverage?.contentText).toContain("crm");
    // Rule 4 — verdict awareness unaffected by appointment perceptions
    const verdicts = insights.find((i) => i.id === VERDICTS_INSIGHT_ID);
    expect(verdicts?.contentText).toContain("المؤسس أصدر 1 أحكام");
    // Rule 5 — revenue pulse unaffected
    const pulse = insights.find((i) => i.id === REVENUE_PULSE_INSIGHT_ID);
    expect(pulse?.contentText).toContain("نبض الإيراد");
    // Rule 6 — the new anomaly: 3 no-shows vs 1 completed ⇒ 75%
    const anomaly = insights.find((i) => i.id === NOSHOW_ANOMALY_INSIGHT_ID);
    expect(anomaly?.contentText).toBe(
      "شذوذ الغيابات: رُصد 3 غياب عن المواعيد مقابل 1 موعد مكتمل (نسبة الغياب 75%)",
    );
  });

  it("without ≥2 no-shows, computeInsights output carries no anomaly id", () => {
    const nodes = [
      perception("crm.appointment.booked", "appointment#1"),
      noshow(1),
      ackNode("insight-w12b-b", "rejected"),
    ];
    const ids = computeInsights(nodes).map((i) => i.id);
    expect(ids).toContain("insight-coverage");
    expect(ids).toContain(VERDICTS_INSIGHT_ID);
    expect(ids).not.toContain(NOSHOW_ANOMALY_INSIGHT_ID);
  });

  it("anomaly insight text never leaks perc-*/ack-* internals or payload field names", () => {
    const insight = anomalyFrom([noshow(1), noshow(2), ackNode("insight-w12b-c", "approved")]);
    expect(insight?.contentText).not.toContain("perc-");
    expect(insight?.contentText).not.toContain("ack-");
    expect(insight?.contentText).not.toContain("fields[");
    expect(insight?.contentText).not.toContain("a,b");
    expect(insight?.contentText.length ?? 0).toBeLessThanOrEqual(300);
  });
});

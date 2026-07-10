// ============================================================
// VERDICT AWARENESS — UNIT TESTS (Wave 10-a "Mind reflects on verdicts")
// Mock-pg pattern shared with reflection-cycle.test.ts.
// Covers rule 4 of the reflection cycle: the always-updated
// insight-verdicts object summarizing the founder verdicts (ack-*
// objects planted by Wave 9-a). Cases: zero acks ⇒ no insight at all,
// one approval ⇒ correct Arabic text, mixed verdicts ⇒ correct counts
// and approval ratio, tick re-runs ⇒ upsert never duplicates, a flipped
// verdict ⇒ counts reflect the latest state, the insight is served over
// titan.listInsights, and ack objects themselves are never served.
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
  VERDICTS_INSIGHT_ID,
  computeInsights,
  runReflectionTick,
  __resetReflectionCycleForTests,
  __setListFnForTests,
  type LiveGraphNode,
} from "../lib/reflection-cycle";

const BRIDGE_KEY = "wave10a-test-bridge-key";

/** Caller whose ctx carries a real Request, with or without the bridge header. */
function bridgeCaller(key?: string) {
  const headers = new Headers();
  if (key) headers.set("x-onx-bridge-key", key);
  return appRouter.createCaller({
    req: new Request("http://platform.test/trpc/titan.listInsights", { headers }),
    resHeaders: new Headers(),
  } as TrpcContext);
}

/** Graph node with the exact shape insight-ack.buildAckObject plants. */
function ackNode(
  insightId: string,
  verdict: AckVerdict,
  overrides: Partial<LiveGraphNode> = {},
): LiveGraphNode {
  return {
    id: `${ACK_ID_PREFIX}${insightId}`,
    type: "PATTERN",
    contentText: `حكم المؤسس على الرؤية ${insightId}: ${VERDICT_LABEL_AR[verdict]} (قُرر في 2026-07-10T08:00:00.000Z)`,
    ageDays: 0,
    ...overrides,
  };
}

function perception(eventType: string, entity: string): LiveGraphNode {
  return {
    id: `perc-platform-${Math.random().toString(36).slice(2)}`,
    type: "PERCEPTION",
    contentText: `platform-event ${eventType} on ${entity} fields[a,b]`,
    ageDays: 0,
  };
}

const verdictsFrom = (nodes: LiveGraphNode[]) =>
  computeInsights(nodes).find((i) => i.id === VERDICTS_INSIGHT_ID);

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

describe("computeInsights — rule 4: zero verdicts ⇒ silent skip", () => {
  it("emits no insight-verdicts when the graph has no ack objects", () => {
    const nodes = [
      perception("crm.appointment.booked", "appointment#1"),
      { id: "seed-patt", type: "PATTERN", contentText: "not an ack" },
    ];
    expect(verdictsFrom(nodes)).toBeUndefined();
  });

  it("emits nothing at all on an empty graph — no empty object, no crash", () => {
    expect(computeInsights([])).toEqual([]);
  });

  it("ignores ack-prefixed nodes whose text carries no recognizable verdict", () => {
    const nodes: LiveGraphNode[] = [
      { id: "ack-insight-broken", type: "PATTERN", contentText: "نص بلا حكم" },
      { id: "ack-insight-empty", type: "PATTERN" },
    ];
    expect(verdictsFrom(nodes)).toBeUndefined();
  });
});

describe("computeInsights — rule 4: single approval", () => {
  it("one approved verdict ⇒ insight with exact deterministic Arabic text", () => {
    const insight = verdictsFrom([ackNode("insight-a", "approved")]);
    expect(insight).toBeDefined();
    expect(insight).toMatchObject({
      id: VERDICTS_INSIGHT_ID,
      type: "PATTERN",
      rank: 2,
      verification: "PROBABLE",
      trust: 0.75,
      amanah: 0.9,
      founderAlignment: 0.7,
      validated: true,
      sources: 1,
    });
    expect(insight?.contentText).toBe(
      "وعي الحكم: المؤسس أصدر 1 أحكام على رؤى العقل — 1 اعتماد و0 رفض (نسبة الاعتماد 100%)، آخر حكم: اعتماد",
    );
  });

  it("one rejected verdict ⇒ 0% approval and رفض as the latest verdict", () => {
    const insight = verdictsFrom([ackNode("insight-b", "rejected")]);
    expect(insight?.contentText).toBe(
      "وعي الحكم: المؤسس أصدر 1 أحكام على رؤى العقل — 0 اعتماد و1 رفض (نسبة الاعتماد 0%)، آخر حكم: رفض",
    );
  });
});

describe("computeInsights — rule 4: mixed verdicts", () => {
  it("counts, ratio and sources are correct over mixed acks", () => {
    const insight = verdictsFrom([
      ackNode("insight-a", "approved"),
      ackNode("insight-b", "approved"),
      ackNode("insight-c", "rejected"),
    ]);
    expect(insight?.sources).toBe(3);
    expect(insight?.contentText).toContain("المؤسس أصدر 3 أحكام");
    expect(insight?.contentText).toContain("2 اعتماد و1 رفض");
    expect(insight?.contentText).toContain("نسبة الاعتماد 67%");
  });

  it("latest verdict = freshest ack (smallest ageDays), deterministic id tiebreak", () => {
    const insight = verdictsFrom([
      ackNode("insight-old", "approved", { ageDays: 3 }),
      ackNode("insight-new", "rejected", { ageDays: 0 }),
    ]);
    expect(insight?.contentText).toContain("آخر حكم: رفض");
  });

  it("is deterministic: same acks in any order ⇒ identical text", () => {
    const nodes = [
      ackNode("insight-a", "approved"),
      ackNode("insight-b", "rejected"),
      ackNode("insight-c", "approved"),
    ];
    const forward = verdictsFrom(nodes)?.contentText;
    const backward = verdictsFrom([...nodes].reverse())?.contentText;
    expect(forward).toBeDefined();
    expect(forward).toEqual(backward);
  });
});

describe("runReflectionTick — rule 4 through the real iuc.ingest path", () => {
  it("re-running the tick upserts the single insight-verdicts object, never duplicates", async () => {
    __setListFnForTests(() => [
      ackNode("insight-w10a-idem-a", "approved"),
      ackNode("insight-w10a-idem-b", "rejected"),
    ]);

    await runReflectionTick();
    await runReflectionTick();
    await runReflectionTick();

    const matches = listLiveObjects().filter((o) => o.id === VERDICTS_INSIGHT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(matches[0]?.contentText).toContain("المؤسس أصدر 2 أحكام");
  });

  it("a flipped verdict (same ack updated اعتماد→رفض) ⇒ counts reflect the latest state", async () => {
    let verdict: AckVerdict = "approved";
    __setListFnForTests(() => [ackNode("insight-w10a-flip", verdict)]);

    await runReflectionTick();
    const before = listLiveObjects().find((o) => o.id === VERDICTS_INSIGHT_ID);
    expect(before?.contentText).toContain("1 اعتماد و0 رفض");

    verdict = "rejected";
    await runReflectionTick();

    const after = listLiveObjects().filter((o) => o.id === VERDICTS_INSIGHT_ID);
    expect(after).toHaveLength(1);
    expect(after[0]?.contentText).toContain("0 اعتماد و1 رفض");
    expect(after[0]?.contentText).toContain("نسبة الاعتماد 0%");
    expect(after[0]?.contentText).toContain("آخر حكم: رفض");
  });

  it("the verdicts insight is served over titan.listInsights; ack objects never are", async () => {
    __setListFnForTests(() => [ackNode("insight-w10a-served", "approved")]);
    await runReflectionTick();

    const served = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 200 });

    const verdicts = served.insights.find((i) => i.id === VERDICTS_INSIGHT_ID);
    expect(verdicts).toBeDefined();
    expect(verdicts?.contentText).toContain("وعي الحكم");
    expect(served.insights.some((i) => i.id.startsWith(ACK_ID_PREFIX))).toBe(false);
  });

  it("end-to-end meta loop: a real bridge ack on a real insight feeds rule 4", async () => {
    const caller = bridgeCaller(BRIDGE_KEY);
    await caller.iuc.ingest({
      id: "insight-w10a-e2e",
      type: "PATTERN",
      rank: 2,
      verification: "PROBABLE",
      contentText: "رؤية اختبارية للموجة 10-أ",
      ageDays: 0,
      sources: 3,
      trust: 0.75,
      amanah: 0.9,
      founderAlignment: 0.7,
      validated: true,
    });
    await caller.titan.acknowledgeInsight({
      insightId: "insight-w10a-e2e",
      verdict: "approved",
    });

    // Default list seam ⇒ the tick reads the REAL live graph incl. the ack.
    await runReflectionTick();

    const verdicts = listLiveObjects().find((o) => o.id === VERDICTS_INSIGHT_ID);
    expect(verdicts).toBeDefined();
    expect(verdicts?.contentText).toContain("وعي الحكم");
    expect(verdicts?.contentText).toContain("اعتماد");
  });
});

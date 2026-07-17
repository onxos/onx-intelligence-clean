// ============================================================
// INSIGHT ACK — UNIT TESTS (Wave 9-a "Founder verdict feeds back")
// Mock-pg pattern shared with insights-port.test.ts.
// Covers: bridge-guard security (no key / wrong key / disabled),
// successful acks planting ack-<insightId> PATTERN/R2 objects with
// the Arabic verdict text into the live graph (through the REAL
// iuc.ingest path), upsert idempotency (repeat/changed verdicts never
// duplicate), polite refusal of non-insight ids, never-throw on
// internal failure (seam), and the HT-10 ack counters.
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
import {
  ACK_ID_PREFIX,
  INSIGHT_ID_PREFIX,
  VERDICT_LABEL_AR,
  recordInsightAck,
  getInsightAckCounters,
  __resetInsightAckForTests,
  __setAckIngestFnForTests,
} from "../lib/insight-ack";

const BRIDGE_KEY = "wave9a-test-bridge-key";

/** Caller whose ctx carries a real Request, with or without the bridge header. */
function bridgeCaller(key?: string) {
  const headers = new Headers();
  if (key) headers.set("x-onx-bridge-key", key);
  return appRouter.createCaller({
    req: new Request("http://platform.test/trpc/titan.acknowledgeInsight", { headers }),
    resHeaders: new Headers(),
  } as TrpcContext);
}

/** Plant a reflection-style insight into the live graph (same shape Wave 7-c ingests). */
async function seedInsight(id: string): Promise<void> {
  await bridgeCaller().iuc.ingest({
    id,
    type: "PATTERN",
    rank: 2,
    verification: "PROBABLE",
    contentText: `رؤية اختبارية ${id}`,
    ageDays: 0,
    sources: 3,
    trust: 0.75,
    amanah: 0.9,
    founderAlignment: 0.7,
    validated: true,
  });
}

const ackCountInGraph = (insightId: string): number =>
  listLiveObjects().filter((o) => o.id === `${ACK_ID_PREFIX}${insightId}`).length;

const savedEnv = {
  bridgeEnabled: env.bridgeEnabled,
  bridgeSharedSecret: env.bridgeSharedSecret,
};

beforeEach(() => {
  __resetInsightAckForTests();
  queryMock.mockReset();
  env.bridgeEnabled = true;
  env.bridgeSharedSecret = BRIDGE_KEY;
});

afterEach(() => {
  env.bridgeEnabled = savedEnv.bridgeEnabled;
  env.bridgeSharedSecret = savedEnv.bridgeSharedSecret;
  __resetInsightAckForTests();
});

describe("titan.acknowledgeInsight — bridge-guard security", () => {
  it("rejects without a bridge key → BRIDGE_UNAUTHORIZED", async () => {
    await expect(
      bridgeCaller().titan.acknowledgeInsight({ insightId: "insight-x", verdict: "approved" }),
    ).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("rejects a wrong bridge key → BRIDGE_UNAUTHORIZED", async () => {
    await expect(
      bridgeCaller("wrong-key").titan.acknowledgeInsight({
        insightId: "insight-x",
        verdict: "approved",
      }),
    ).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("rejects when the bridge gate is disabled → BRIDGE_DISABLED", async () => {
    env.bridgeEnabled = false;
    await expect(
      bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
        insightId: "insight-x",
        verdict: "approved",
      }),
    ).rejects.toThrow(/BRIDGE_DISABLED/);
  });

  it("rejected calls plant nothing and advance no counter", async () => {
    await expect(
      bridgeCaller().titan.acknowledgeInsight({ insightId: "insight-x", verdict: "approved" }),
    ).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
    expect(ackCountInGraph("insight-x")).toBe(0);
    expect(getInsightAckCounters()).toEqual({ acksReceivedTotal: 0, acksFailedTotal: 0 });
  });
});

describe("titan.acknowledgeInsight — successful ack plants the verdict", () => {
  it("approved verdict on an existing insight → ack-<id> PATTERN/R2 with Arabic text", async () => {
    await seedInsight("insight-w9a-approve");

    const res = await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "insight-w9a-approve",
      verdict: "approved",
    });

    expect(res).toMatchObject({
      bridge: "titanBridge",
      ok: true,
      insightId: "insight-w9a-approve",
    });
    expect(Number.isNaN(Date.parse(res.timestamp))).toBe(false);
    // Exact bridge exposure contract — nothing internal leaks.
    expect(Object.keys(res).sort()).toEqual(["bridge", "insightId", "ok", "timestamp"]);

    const ack = listLiveObjects().find((o) => o.id === "ack-insight-w9a-approve");
    expect(ack).toMatchObject({ type: "PATTERN", rank: 2, verification: "PROBABLE" });
    expect(ack?.contentText).toContain("حكم المؤسس على الرؤية insight-w9a-approve");
    expect(ack?.contentText).toContain(VERDICT_LABEL_AR.approved);
  });

  it("rejected verdict carries the رفض label", async () => {
    await seedInsight("insight-w9a-reject");

    const res = await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "insight-w9a-reject",
      verdict: "rejected",
    });

    expect(res.ok).toBe(true);
    const ack = listLiveObjects().find((o) => o.id === "ack-insight-w9a-reject");
    expect(ack?.contentText).toContain(VERDICT_LABEL_AR.rejected);
  });

  it("decidedAt (ISO datetime) is accepted and recorded in the text", async () => {
    await seedInsight("insight-w9a-dated");
    const decidedAt = "2026-07-10T08:00:00.000Z";

    const res = await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "insight-w9a-dated",
      verdict: "approved",
      decidedAt,
    });

    expect(res.ok).toBe(true);
    const ack = listLiveObjects().find((o) => o.id === "ack-insight-w9a-dated");
    expect(ack?.contentText).toContain(decidedAt);
  });

  it("acks never masquerade as insights — Wave 8-a port ignores them", async () => {
    await seedInsight("insight-w9a-port");
    await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "insight-w9a-port",
      verdict: "approved",
    });

    const served = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 200 });

    expect(served.insights.some((i) => i.id.startsWith(ACK_ID_PREFIX))).toBe(false);
  });
});

describe("titan.acknowledgeInsight — idempotent upsert", () => {
  it("the same ack twice → one graph object, not two", async () => {
    await seedInsight("insight-w9a-idem");
    const caller = bridgeCaller(BRIDGE_KEY);

    await caller.titan.acknowledgeInsight({ insightId: "insight-w9a-idem", verdict: "approved" });
    await caller.titan.acknowledgeInsight({ insightId: "insight-w9a-idem", verdict: "approved" });

    expect(ackCountInGraph("insight-w9a-idem")).toBe(1);
  });

  it("a changed verdict updates the single object in place", async () => {
    await seedInsight("insight-w9a-flip");
    const caller = bridgeCaller(BRIDGE_KEY);

    await caller.titan.acknowledgeInsight({ insightId: "insight-w9a-flip", verdict: "approved" });
    await caller.titan.acknowledgeInsight({ insightId: "insight-w9a-flip", verdict: "rejected" });

    expect(ackCountInGraph("insight-w9a-flip")).toBe(1);
    const ack = listLiveObjects().find((o) => o.id === "ack-insight-w9a-flip");
    expect(ack?.contentText).toContain(VERDICT_LABEL_AR.rejected);
    expect(ack?.contentText).not.toContain(VERDICT_LABEL_AR.approved);
  });
});

describe("titan.acknowledgeInsight — polite refusal of non-insight ids", () => {
  it("lib-level: id without the insight- prefix → {ok:false, reason:'NOT_AN_INSIGHT'}", async () => {
    const result = await recordInsightAck({ insightId: "seed-patt", verdict: "approved" });
    expect(result).toEqual({ ok: false, reason: "NOT_AN_INSIGHT" });
    expect(INSIGHT_ID_PREFIX).toBe("insight-");
  });

  it("bridge-level: ok:false and NO ack object is planted", async () => {
    const res = await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "seed-patt",
      verdict: "approved",
    });

    expect(res).toMatchObject({ bridge: "titanBridge", ok: false, insightId: "seed-patt" });
    expect(ackCountInGraph("seed-patt")).toBe(0);
    // The refusal reason stays behind the bridge.
    expect(JSON.stringify(res)).not.toContain("NOT_AN_INSIGHT");
  });
});

describe("titan.acknowledgeInsight — never-throw on internal failure", () => {
  it("lib-level: ingest seam failure → {ok:false, reason} without throwing", async () => {
    __setAckIngestFnForTests(async () => {
      throw new Error("graph exploded");
    });

    await expect(
      recordInsightAck({ insightId: "insight-w9a-boom", verdict: "approved" }),
    ).resolves.toMatchObject({ ok: false, reason: expect.stringContaining("graph exploded") });
  });

  it("bridge-level: internal failure → ok:false, no throw, no internals leaked", async () => {
    __setAckIngestFnForTests(async () => {
      throw new Error("pg pool on fire at 10.0.0.7:5432");
    });

    const res = await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "insight-w9a-boom",
      verdict: "rejected",
    });

    expect(res).toMatchObject({ bridge: "titanBridge", ok: false, insightId: "insight-w9a-boom" });
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("pg pool");
    expect(serialized).not.toContain("reason");
  });
});

describe("HT-10 ack counters", () => {
  it("successful acks advance acksReceivedTotal only", async () => {
    await seedInsight("insight-w9a-count");
    const caller = bridgeCaller(BRIDGE_KEY);

    await caller.titan.acknowledgeInsight({ insightId: "insight-w9a-count", verdict: "approved" });
    await caller.titan.acknowledgeInsight({ insightId: "insight-w9a-count", verdict: "rejected" });

    expect(getInsightAckCounters()).toEqual({ acksReceivedTotal: 2, acksFailedTotal: 0 });
  });

  it("refusals and internal failures advance acksFailedTotal only", async () => {
    await recordInsightAck({ insightId: "not-an-insight", verdict: "approved" });
    __setAckIngestFnForTests(async () => {
      throw new Error("boom");
    });
    await recordInsightAck({ insightId: "insight-w9a-fail", verdict: "approved" });

    expect(getInsightAckCounters()).toEqual({ acksReceivedTotal: 0, acksFailedTotal: 2 });
  });

  it("both counters are exposed as numbers on health.reflection (HT-10)", async () => {
    await seedInsight("insight-w9a-health");
    await bridgeCaller(BRIDGE_KEY).titan.acknowledgeInsight({
      insightId: "insight-w9a-health",
      verdict: "approved",
    });
    await recordInsightAck({ insightId: "nope", verdict: "rejected" });

    const health = await bridgeCaller().health.reflection();

    expect(health.acksReceivedTotal).toBe(1);
    expect(health.acksFailedTotal).toBe(1);
    expect(typeof health.acksReceivedTotal).toBe("number");
    expect(typeof health.acksFailedTotal).toBe("number");
  });
});

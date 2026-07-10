// ============================================================
// INSIGHTS PORT — UNIT TESTS (Wave 8-a "Mind speaks back")
// Mock-pg pattern shared with reflection-cycle.test.ts.
// Covers: bridge-guard security (no key / wrong key / disabled),
// insight-only filtering with the exact exposure contract (no
// trust/amanah/founderAlignment ever cross the bridge), chronological
// ordering, afterTimestamp filtering, limit trim + hard cap at 200,
// never-throw on empty/broken graph, and the HT-10 served counter.
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
import { env } from "../lib/env";
import type { TrpcContext } from "../context";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getInsightsServedTotal,
  listInsightsFromGraph,
  __resetInsightsPortForTests,
  __setInsightsListFnForTests,
  type PortGraphNode,
} from "../lib/insights-port";

const BRIDGE_KEY = "wave8a-test-bridge-key";
const DAY_MS = 86_400_000;

/** Caller whose ctx carries a real Request, with or without the bridge header. */
function bridgeCaller(key?: string) {
  const headers = new Headers();
  if (key) headers.set("x-onx-bridge-key", key);
  return appRouter.createCaller({
    req: new Request("http://platform.test/trpc/titan.listInsights", { headers }),
    resHeaders: new Headers(),
  } as TrpcContext);
}

// Seeded nodes deliberately carry internal mind-only scores so the tests
// can prove they never cross the bridge.
type SeedNode = PortGraphNode & {
  trust?: number;
  amanah?: number;
  founderAlignment?: number;
};

function insightNode(id: string, ageDays = 0, overrides: Partial<SeedNode> = {}): SeedNode {
  return {
    id,
    type: "PATTERN",
    rank: 2,
    verification: "PROBABLE",
    contentText: `رؤية اختبارية ${id}`,
    ageDays,
    trust: 0.75,
    amanah: 0.9,
    founderAlignment: 0.7,
    ...overrides,
  };
}

const savedEnv = {
  bridgeEnabled: env.bridgeEnabled,
  bridgeSharedSecret: env.bridgeSharedSecret,
};

beforeEach(() => {
  __resetInsightsPortForTests();
  queryMock.mockReset();
  env.bridgeEnabled = true;
  env.bridgeSharedSecret = BRIDGE_KEY;
});

afterEach(() => {
  env.bridgeEnabled = savedEnv.bridgeEnabled;
  env.bridgeSharedSecret = savedEnv.bridgeSharedSecret;
  __resetInsightsPortForTests();
});

describe("titan.listInsights — bridge-guard security", () => {
  it("rejects without a bridge key → BRIDGE_UNAUTHORIZED", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);
    await expect(bridgeCaller().titan.listInsights({})).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("rejects a wrong bridge key → BRIDGE_UNAUTHORIZED", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);
    await expect(
      bridgeCaller("wrong-key").titan.listInsights({}),
    ).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("rejects when the bridge gate is disabled → BRIDGE_DISABLED", async () => {
    env.bridgeEnabled = false;
    await expect(bridgeCaller(BRIDGE_KEY).titan.listInsights({})).rejects.toThrow(/BRIDGE_DISABLED/);
  });

  it("rejected calls never advance the served counter", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);
    await expect(bridgeCaller().titan.listInsights({})).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
    expect(getInsightsServedTotal()).toBe(0);
  });
});

describe("titan.listInsights — exposure contract", () => {
  it("serves only insight-* objects — perceptions and seeds never cross", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-x"),
      { id: "perc-y", type: "PERCEPTION", contentText: "platform-event a.b on c#1", ageDays: 0 },
      { id: "seed-patt", type: "PATTERN", rank: 2 },
    ]);

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    expect(res.bridge).toBe("titanBridge");
    expect(res.count).toBe(1);
    expect(res.insights.map((i) => i.id)).toEqual(["insight-x"]);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("perc-y");
    expect(serialized).not.toContain("seed-patt");
  });

  it("each item carries ONLY {id, contentText, rank, verification, type, createdAt}", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    const item = res.insights[0];
    expect(Object.keys(item).sort()).toEqual([
      "contentText",
      "createdAt",
      "id",
      "rank",
      "type",
      "verification",
    ]);
    expect(item).toMatchObject({
      id: "insight-x",
      type: "PATTERN",
      rank: 2,
      verification: "PROBABLE",
    });
    expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);

    // Internal mind scores must never leak over the bridge.
    const serialized = JSON.stringify(res.insights);
    expect(serialized).not.toContain("trust");
    expect(serialized).not.toContain("amanah");
    expect(serialized).not.toContain("founderAlignment");
  });

  it("returns insights chronologically ascending (oldest first, id tiebreak)", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-b", 1),
      insightNode("insight-c", 0),
      insightNode("insight-a", 3),
    ]);

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    expect(res.insights.map((i) => i.id)).toEqual(["insight-a", "insight-b", "insight-c"]);
  });
});

describe("titan.listInsights — afterTimestamp filter", () => {
  it("keeps only insights created strictly after the cutoff", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-old", 5),
      insightNode("insight-new", 0),
    ]);
    const cutoff = new Date(Date.now() - DAY_MS).toISOString(); // 24h ago

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ afterTimestamp: cutoff });

    expect(res.count).toBe(1);
    expect(res.insights.map((i) => i.id)).toEqual(["insight-new"]);
  });

  it("returns everything when afterTimestamp predates all insights", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-old", 5),
      insightNode("insight-new", 0),
    ]);
    const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ afterTimestamp: cutoff });

    expect(res.count).toBe(2);
  });
});

describe("titan.listInsights — limit trim and hard cap", () => {
  const manyInsights = (n: number): SeedNode[] =>
    Array.from({ length: n }, (_, i) => insightNode(`insight-${String(i).padStart(4, "0")}`));

  it("defaults to 50 when no limit is given", async () => {
    __setInsightsListFnForTests(() => manyInsights(60));

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    expect(DEFAULT_LIMIT).toBe(50);
    expect(res.count).toBe(50);
    expect(res.insights).toHaveLength(50);
  });

  it("trims to the requested limit", async () => {
    __setInsightsListFnForTests(() => manyInsights(10));

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 2 });

    expect(res.count).toBe(2);
    expect(res.insights.map((i) => i.id)).toEqual(["insight-0000", "insight-0001"]);
  });

  it("hard-caps any requested limit at 200", async () => {
    __setInsightsListFnForTests(() => manyInsights(250));

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 5000 });

    expect(MAX_LIMIT).toBe(200);
    expect(res.count).toBe(200);
    expect(res.insights).toHaveLength(200);
  });
});

describe("titan.listInsights — never-throw on empty/broken graph", () => {
  it("empty graph → { insights: [], count: 0 } without throwing", async () => {
    __setInsightsListFnForTests(() => []);

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    expect(res.insights).toEqual([]);
    expect(res.count).toBe(0);
  });

  it("graph read failure → empty result, NEVER a throw", async () => {
    __setInsightsListFnForTests(() => {
      throw new Error("graph exploded");
    });

    const res = await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    expect(res).toMatchObject({ insights: [], count: 0 });
  });

  it("lib-level read is equally throw-free", () => {
    __setInsightsListFnForTests(() => {
      throw new Error("graph exploded");
    });

    expect(listInsightsFromGraph()).toEqual({ insights: [], count: 0 });
  });
});

describe("HT-10 insightsServedTotal counter", () => {
  it("advances by the number of insights actually delivered", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-a"), insightNode("insight-b")]);
    expect(getInsightsServedTotal()).toBe(0);

    await bridgeCaller(BRIDGE_KEY).titan.listInsights({});          // serves 2
    await bridgeCaller(BRIDGE_KEY).titan.listInsights({ limit: 1 }); // serves 1

    expect(getInsightsServedTotal()).toBe(3);
  });

  it("is exposed as a number on health.reflection (HT-10)", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-a"), insightNode("insight-b")]);
    await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    const health = await bridgeCaller().health.reflection();

    expect(health.insightsServedTotal).toBe(2);
    expect(typeof health.insightsServedTotal).toBe("number");
  });

  it("failed graph reads deliver nothing and add nothing", async () => {
    __setInsightsListFnForTests(() => {
      throw new Error("graph exploded");
    });

    await bridgeCaller(BRIDGE_KEY).titan.listInsights({});

    expect(getInsightsServedTotal()).toBe(0);
  });
});

// ============================================================
// HEALTH.INSIGHTSPUBLIC — UNIT TESTS (Wave 11-b "Mind pulse")
// Founder-facing read-only insight feed for /titan-conclave/pulse.
// Covers: public access (no bridge key, even with the bridge gate
// disabled), insight-* only filtering (ack-* / perc-* / seed-* never
// leak), exact exposure contract (no trust/amanah/founderAlignment),
// newest-first ordering, hard cap at 20, zod input bounds, the
// never-throw contract, and — critically — that this feed NEVER
// advances the HT-10 insightsServedTotal bridge counter.
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
  PUBLIC_INSIGHTS_MAX,
  getInsightsServedTotal,
  listPublicInsights,
  __resetInsightsPortForTests,
  __setInsightsListFnForTests,
  type PortGraphNode,
} from "../lib/insights-port";

/** Plain public caller — deliberately NO bridge key header. */
function publicCaller() {
  return appRouter.createCaller({
    req: new Request("http://platform.test/trpc/health.insightsPublic"),
    resHeaders: new Headers(),
  } as TrpcContext);
}

// Seeded nodes deliberately carry internal mind-only scores so the tests
// can prove they never reach the founder page.
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
});

afterEach(() => {
  env.bridgeEnabled = savedEnv.bridgeEnabled;
  env.bridgeSharedSecret = savedEnv.bridgeSharedSecret;
  __resetInsightsPortForTests();
});

describe("health.insightsPublic — public access", () => {
  it("serves insights WITHOUT any bridge key", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);

    const res = await publicCaller().health.insightsPublic({});

    expect(res.count).toBe(1);
    expect(res.insights[0].id).toBe("insight-x");
    expect(Number.isNaN(Date.parse(res.timestamp))).toBe(false);
  });

  it("keeps serving even when the bridge gate is disabled (not bridge-guarded)", async () => {
    env.bridgeEnabled = false;
    env.bridgeSharedSecret = "";
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);

    const res = await publicCaller().health.insightsPublic({});

    expect(res.count).toBe(1);
  });

  it("accepts a call with no input at all", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);

    const res = await publicCaller().health.insightsPublic();

    expect(res.count).toBe(1);
  });
});

describe("health.insightsPublic — insight-only filtering (no leaks)", () => {
  it("serves only insight-* objects — ack-*, perceptions and seeds never leak", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-x"),
      { id: "ack-insight-x-oz", type: "ACK", contentText: "founder verdict CONFIRMED", ageDays: 0 },
      { id: "perc-y", type: "PERCEPTION", contentText: "platform-event a.b on c#1", ageDays: 0 },
      { id: "seed-patt", type: "PATTERN", rank: 2 },
    ]);

    const res = await publicCaller().health.insightsPublic({});

    expect(res.count).toBe(1);
    expect(res.insights.map((i) => i.id)).toEqual(["insight-x"]);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("ack-");
    expect(serialized).not.toContain("perc-y");
    expect(serialized).not.toContain("seed-patt");
  });

  it("each item carries ONLY {id, contentText, rank, verification, type, createdAt}", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-x")]);

    const res = await publicCaller().health.insightsPublic({});

    const item = res.insights[0];
    expect(Object.keys(item).sort()).toEqual([
      "contentText",
      "createdAt",
      "id",
      "rank",
      "type",
      "verification",
    ]);
    expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);

    // Internal mind scores must never reach the founder page.
    const serialized = JSON.stringify(res.insights);
    expect(serialized).not.toContain("trust");
    expect(serialized).not.toContain("amanah");
    expect(serialized).not.toContain("founderAlignment");
  });

  it("includes the founder-verdicts mirror insight (insight-verdicts)", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-verdicts", 0, { contentText: "مرآة أحكام المؤسس" }),
      insightNode("insight-x", 1),
    ]);

    const res = await publicCaller().health.insightsPublic({});

    expect(res.insights.map((i) => i.id)).toContain("insight-verdicts");
  });
});

describe("health.insightsPublic — newest-first ordering and cap", () => {
  const manyInsights = (n: number): SeedNode[] =>
    Array.from({ length: n }, (_, i) => insightNode(`insight-${String(i).padStart(4, "0")}`, i));

  it("returns insights newest first (id tiebreak on equal timestamps)", async () => {
    __setInsightsListFnForTests(() => [
      insightNode("insight-old", 3),
      insightNode("insight-mid", 1),
      insightNode("insight-new", 0),
    ]);

    const res = await publicCaller().health.insightsPublic({});

    expect(res.insights.map((i) => i.id)).toEqual([
      "insight-new",
      "insight-mid",
      "insight-old",
    ]);
  });

  it("caps the feed at 20 by default", async () => {
    __setInsightsListFnForTests(() => manyInsights(30));

    const res = await publicCaller().health.insightsPublic({});

    expect(PUBLIC_INSIGHTS_MAX).toBe(20);
    expect(res.count).toBe(20);
    expect(res.insights).toHaveLength(20);
    // Newest first: age 0 (index 0) leads.
    expect(res.insights[0].id).toBe("insight-0000");
  });

  it("trims to a smaller requested limit", async () => {
    __setInsightsListFnForTests(() => manyInsights(10));

    const res = await publicCaller().health.insightsPublic({ limit: 3 });

    expect(res.count).toBe(3);
    expect(res.insights.map((i) => i.id)).toEqual([
      "insight-0000",
      "insight-0001",
      "insight-0002",
    ]);
  });

  it("rejects out-of-range limits at the input boundary (zod)", async () => {
    __setInsightsListFnForTests(() => manyInsights(5));

    await expect(publicCaller().health.insightsPublic({ limit: 0 })).rejects.toThrow();
    await expect(publicCaller().health.insightsPublic({ limit: 21 })).rejects.toThrow();
  });

  it("lib-level listPublicInsights clamps any limit to the 20 hard cap", () => {
    __setInsightsListFnForTests(() => manyInsights(30));

    expect(listPublicInsights({ limit: 5000 }).count).toBe(20);
    expect(listPublicInsights({ limit: -3 }).count).toBe(1);
  });
});

describe("health.insightsPublic — never-throw contract", () => {
  it("empty graph → { insights: [], count: 0 } without throwing", async () => {
    __setInsightsListFnForTests(() => []);

    const res = await publicCaller().health.insightsPublic({});

    expect(res.insights).toEqual([]);
    expect(res.count).toBe(0);
  });

  it("graph read failure → empty feed, NEVER a throw", async () => {
    __setInsightsListFnForTests(() => {
      throw new Error("graph exploded");
    });

    const res = await publicCaller().health.insightsPublic({});

    expect(res).toMatchObject({ insights: [], count: 0 });
  });
});

describe("health.insightsPublic — HT-10 counter isolation", () => {
  it("NEVER advances insightsServedTotal (that counter is bridge-only)", async () => {
    __setInsightsListFnForTests(() => [insightNode("insight-a"), insightNode("insight-b")]);
    expect(getInsightsServedTotal()).toBe(0);

    await publicCaller().health.insightsPublic({});
    await publicCaller().health.insightsPublic({ limit: 1 });

    expect(getInsightsServedTotal()).toBe(0);

    const health = await publicCaller().health.reflection();
    expect(health.insightsServedTotal).toBe(0);
  });
});

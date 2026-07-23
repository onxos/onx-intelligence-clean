// D13 — judgment formation from re-confirmed patterns
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, bridgeEnabled: true, bridgeSharedSecret: "test-bridge-secret" },
  };
});

import { appRouter } from "../router";
import { __resetEngineStateStoreForTests } from "../lib/engine-state-store";

const bridge = () =>
  appRouter.createCaller({
    req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
  } as never);

describe("D13 — judgments form only from re-confirmed patterns, with a human gate", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    __resetEngineStateStoreForTests();
  });

  it("no pattern without 3 repetitions, no judgment without re-confirmation growth", async () => {
    const caller = bridge();
    // 3 events → pattern on first cycle
    for (let i = 0; i < 3; i++) {
      await caller.runtime.feedEvent({ source: "test", eventType: "WIDGET_SOLD", entityId: `w-${i}` });
    }
    const c1 = await caller.runtime.learning.runCycle();
    expect(c1.newPatterns).toContain("test:WIDGET_SOLD");
    expect(c1.newJudgments).toHaveLength(0); // no judgment yet — not re-confirmed

    // 2 more events → growth ≥2 → judgment forms on next cycle
    for (let i = 3; i < 5; i++) {
      await caller.runtime.feedEvent({ source: "test", eventType: "WIDGET_SOLD", entityId: `w-${i}` });
    }
    const c2 = await caller.runtime.learning.runCycle();
    expect(c2.newJudgments).toHaveLength(1);
    expect(c2.newJudgments[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(c2.newJudgments[0].statement).toContain("WIDGET_SOLD");

    // idempotent: third cycle forms nothing new
    const c3 = await caller.runtime.learning.runCycle();
    expect(c3.newJudgments).toHaveLength(0);
    expect(c3.judgmentsTotal).toBe(1);
  });

  it("D-059: low-risk judgments auto-validate, high-risk stay PROPOSED", async () => {
    const caller = bridge();
    // low-risk: 10+ occurrences, high confidence, no guardian violations
    for (let i = 0; i < 3; i++) {
      await caller.runtime.feedEvent({ source: "test", eventType: "SAFE_PATTERN", entityId: `s-${i}` });
    }
    await caller.runtime.learning.runCycle(); // detected
    for (let i = 3; i < 12; i++) {
      await caller.runtime.feedEvent({ source: "test", eventType: "SAFE_PATTERN", entityId: `s-${i}` });
    }
    const c = await caller.runtime.learning.runCycle(); // 12 total → growth 9 → judgment
    const j = c.newJudgments[0] as { id: string; confidence: number };
    expect(j.confidence).toBeGreaterThanOrEqual(0.9);
    const { judgments } = await caller.runtime.learning.judgments();
    const stored = judgments.find((x) => (x as { id: string }).id === j.id) as { status: string; autoValidated?: boolean };
    expect(stored.status).toBe("VALIDATED");
    expect(stored.autoValidated).toBe(true);
  });

  it("human gate validates/rejects judgments and records the decision", async () => {
    const caller = bridge();
    for (let i = 0; i < 3; i++) {
      await caller.runtime.feedEvent({ source: "test", eventType: "ORDER_PLACED", entityId: `o-${i}` });
    }
    await caller.runtime.learning.runCycle(); // pattern detected
    for (let i = 3; i < 5; i++) {
      await caller.runtime.feedEvent({ source: "test", eventType: "ORDER_PLACED", entityId: `o-${i}` });
    }
    await caller.runtime.learning.runCycle(); // growth ≥2 → judgment formed
    const { judgments } = await caller.runtime.learning.judgments();
    expect(judgments.length).toBeGreaterThanOrEqual(1);
    const j = judgments[judgments.length - 1] as { id: string; status: string };
    expect(j.status).toBe("PROPOSED");

    const review = await caller.runtime.learning.reviewJudgment({
      judgmentId: j.id, decision: "VALIDATED", reviewer: "founder",
    });
    expect(review.reviewed).toBe(true);

    const missing = await caller.runtime.learning.reviewJudgment({
      judgmentId: "nope", decision: "REJECTED",
    });
    expect(missing.reviewed).toBe(false);
  });
});

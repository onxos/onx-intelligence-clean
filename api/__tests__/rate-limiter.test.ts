// ============================================================
// RATE LIMITER — STE-K-05 tests (deterministic token bucket)
// Proves: exhaustion → 429 with honest retryAfter; refill under a
// fake clock; per-client key isolation; health endpoint EXEMPT;
// two identical runs deterministic; the bridge stays fail-closed
// (public rate-limit gate never opens a guarded mutation).
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Enable the bridge so we can assert guarded mutations stay locked
// even while the public gate is exercised.
vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, bridgeEnabled: true, bridgeSharedSecret: "test-bridge-secret" },
  };
});

import {
  consumeToken,
  enforceRateLimit,
  clientKeyFromCtx,
  PUBLIC_READ_LIMIT,
  PUBLIC_READ_WINDOW_SEC,
  RATE_LIMIT_PERSISTENCE,
  __setRateLimiterClockForTests,
  __resetRateLimiterForTests,
} from "../lib/rate-limiter";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../router";
import { __resetCorpusIngestMemoryForTests } from "../corpus-query-router";

const ctxWith = (headers: Record<string, string> = {}) =>
  ({ req: { headers: new Headers(headers) }, resHeaders: new Headers() }) as never;

describe("rate limiter (STE-K-05)", () => {
  beforeEach(() => {
    __resetRateLimiterForTests();
    __setRateLimiterClockForTests(null);
  });
  afterEach(() => {
    __resetRateLimiterForTests();
    __setRateLimiterClockForTests(null);
  });

  it("declares its constants and honest persistence", () => {
    expect(PUBLIC_READ_LIMIT).toBe(60);
    expect(PUBLIC_READ_WINDOW_SEC).toBe(60);
    expect(RATE_LIMIT_PERSISTENCE).toBe("PER_INSTANCE_UNPERSISTED");
  });

  it("exhausts the bucket then returns 429 with an honest retryAfter", () => {
    const t = 1_000_000;
    __setRateLimiterClockForTests(() => t); // frozen clock: no refill
    // First LIMIT calls allowed.
    for (let i = 0; i < PUBLIC_READ_LIMIT; i++) {
      expect(consumeToken("client-a", "PUBLIC_READ").allowed).toBe(true);
    }
    // The next one is denied with a truthful wait.
    const denied = consumeToken("client-a", "PUBLIC_READ");
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.persistence).toBe("PER_INSTANCE_UNPERSISTED");
  });

  it("refills over time under a fake clock", () => {
    let t = 0;
    __setRateLimiterClockForTests(() => t);
    for (let i = 0; i < PUBLIC_READ_LIMIT; i++) consumeToken("client-b", "PUBLIC_READ");
    expect(consumeToken("client-b", "PUBLIC_READ").allowed).toBe(false);
    // Advance 1s → refill rate is 1 token/sec (60/60s) → exactly one allowed.
    t += 1000;
    expect(consumeToken("client-b", "PUBLIC_READ").allowed).toBe(true);
    expect(consumeToken("client-b", "PUBLIC_READ").allowed).toBe(false);
  });

  it("isolates buckets per client key", () => {
    const t = 5000;
    __setRateLimiterClockForTests(() => t);
    for (let i = 0; i < PUBLIC_READ_LIMIT; i++) consumeToken("client-x", "PUBLIC_READ");
    // client-x is drained…
    expect(consumeToken("client-x", "PUBLIC_READ").allowed).toBe(false);
    // …but an independent client is untouched.
    expect(consumeToken("client-y", "PUBLIC_READ").allowed).toBe(true);
  });

  it("derives the client key from proxy headers, falling back to anonymous", () => {
    expect(clientKeyFromCtx(ctxWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientKeyFromCtx(ctxWith({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientKeyFromCtx(ctxWith())).toBe("anonymous");
  });

  it("enforceRateLimit throws TOO_MANY_REQUESTS carrying retryAfter, sets Retry-After header", () => {
    const t = 9_000_000;
    __setRateLimiterClockForTests(() => t);
    const ctx = ctxWith({ "x-forwarded-for": "1.2.3.4" });
    for (let i = 0; i < PUBLIC_READ_LIMIT; i++) enforceRateLimit(ctx);
    try {
      enforceRateLimit(ctx);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe("TOO_MANY_REQUESTS");
      const payload = JSON.parse(e.message);
      expect(payload.error).toBe("RATE_LIMITED");
      expect(payload.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect((ctx as unknown as { resHeaders: Headers }).resHeaders.get("Retry-After")).toBe(
        String(payload.retryAfterSeconds),
      );
    }
  });

  describe("router integration", () => {
    beforeEach(() => {
      __resetCorpusIngestMemoryForTests();
      delete process.env.DATABASE_URL;
    });

    it("public surfaces expose the honest rateLimit disclosure", async () => {
      const caller = appRouter.createCaller(ctxWith({ "x-forwarded-for": "10.10.10.1" }));
      const r = await caller.corpusQuery.rankedSearch({ query: "entropy" });
      expect(r.rateLimit.limit).toBe(PUBLIC_READ_LIMIT);
      expect(r.rateLimit.persistence).toBe("PER_INSTANCE_UNPERSISTED");
      expect(r.rateLimit.remaining).toBeLessThan(PUBLIC_READ_LIMIT);
    });

    it("public surface returns 429 once the bucket is drained", async () => {
      const t = 20_000_000;
      __setRateLimiterClockForTests(() => t);
      const caller = appRouter.createCaller(ctxWith({ "x-forwarded-for": "10.10.10.2" }));
      for (let i = 0; i < PUBLIC_READ_LIMIT; i++) {
        await caller.intentEngine.classify({ text: "سؤال" });
      }
      await expect(caller.intentEngine.classify({ text: "سؤال" })).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    });

    it("EXEMPTS the health endpoints — never rate limited", async () => {
      const t = 30_000_000;
      __setRateLimiterClockForTests(() => t); // frozen: no refill would rescue a limited path
      const caller = appRouter.createCaller(ctxWith({ "x-forwarded-for": "10.10.10.3" }));
      // Far beyond the public ceiling — health must keep answering.
      for (let i = 0; i < PUBLIC_READ_LIMIT + 20; i++) {
        const live = await caller.health.live();
        expect(live.status).toBeDefined();
      }
    });

    it("keeps the bridge fail-closed: guarded mutation rejects without a key", async () => {
      const caller = appRouter.createCaller(ctxWith({ "x-forwarded-for": "10.10.10.4" }));
      await expect(
        caller.corpusQuery.ingest({ units: [{ domain: "SCIENCE", title: "x", body: "y", source: "z" }] }),
      ).rejects.toThrow();
    });

    it("is deterministic: identical drained sequences match", () => {
      __setRateLimiterClockForTests(() => 42_000_000);
      __resetRateLimiterForTests();
      const runA: boolean[] = [];
      for (let i = 0; i < PUBLIC_READ_LIMIT + 2; i++) runA.push(consumeToken("det", "PUBLIC_READ").allowed);
      __resetRateLimiterForTests();
      const runB: boolean[] = [];
      for (let i = 0; i < PUBLIC_READ_LIMIT + 2; i++) runB.push(consumeToken("det", "PUBLIC_READ").allowed);
      expect(JSON.stringify(runA)).toBe(JSON.stringify(runB));
    });
  });
});

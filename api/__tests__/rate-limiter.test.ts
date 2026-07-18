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
  decideRateLimit,
  stepBucket,
  clientKeyFromCtx,
  PUBLIC_READ_LIMIT,
  PUBLIC_READ_WINDOW_SEC,
  RATE_LIMIT_PERSISTENCE,
  RATE_LIMIT_PERSISTENCE_MEMORY,
  RATE_LIMIT_PERSISTENCE_POSTGRES,
  getLastRateLimitFallback,
  __setBucketStoreForTests,
  __setRateLimiterClockForTests,
  __resetRateLimiterForTests,
  type BucketStore,
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

  it("enforceRateLimit throws TOO_MANY_REQUESTS carrying retryAfter, sets Retry-After header", async () => {
    const t = 9_000_000;
    __setRateLimiterClockForTests(() => t);
    const ctx = ctxWith({ "x-forwarded-for": "1.2.3.4" });
    for (let i = 0; i < PUBLIC_READ_LIMIT; i++) await enforceRateLimit(ctx);
    try {
      await enforceRateLimit(ctx);
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

  // ---- STE-K-19: persistence upgrade + honest MEASURED disclosure ----
  describe("persistence upgrade (STE-K-19)", () => {
    const makeFakeStore = (persistence: typeof RATE_LIMIT_PERSISTENCE_POSTGRES) => {
      const map = new Map<string, { tokens: number; last: number }>();
      const store: BucketStore & { calls: number } = {
        persistence,
        calls: 0,
        async step(mapKey, now, category) {
          store.calls++;
          const { bucket, decision } = stepBucket(map.get(mapKey) ?? null, now, category, persistence);
          map.set(mapKey, bucket);
          return decision;
        },
      };
      return store;
    };

    it("declares BOTH honest measured modes; back-compat alias is memory mode", () => {
      expect(RATE_LIMIT_PERSISTENCE_MEMORY).toBe("PER_INSTANCE_UNPERSISTED");
      expect(RATE_LIMIT_PERSISTENCE_POSTGRES).toBe("POSTGRES_PERSISTED");
      expect(RATE_LIMIT_PERSISTENCE).toBe(RATE_LIMIT_PERSISTENCE_MEMORY);
    });

    it("stepBucket is pure: spends one token, refills honestly, and never mutates its input", () => {
      const first = stepBucket(null, 0, "PUBLIC_READ", RATE_LIMIT_PERSISTENCE_POSTGRES);
      expect(first.decision.allowed).toBe(true);
      expect(first.decision.remaining).toBe(PUBLIC_READ_LIMIT - 1);
      expect(first.decision.persistence).toBe("POSTGRES_PERSISTED");

      const drained = { tokens: 0.4, last: 0 };
      const denied = stepBucket(drained, 0, "PUBLIC_READ", RATE_LIMIT_PERSISTENCE_MEMORY);
      expect(denied.decision.allowed).toBe(false);
      expect(denied.decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      // input object untouched (pure) → identical inputs give identical output
      expect(drained.tokens).toBe(0.4);
      const again = stepBucket(drained, 0, "PUBLIC_READ", RATE_LIMIT_PERSISTENCE_MEMORY);
      expect(again.decision.retryAfterSeconds).toBe(denied.decision.retryAfterSeconds);
    });

    it("a persistent store serves POSTGRES_PERSISTED and its state SURVIVES across calls (round-trip)", async () => {
      __setRateLimiterClockForTests(() => 1000); // frozen: no refill masks the round-trip
      const store = makeFakeStore(RATE_LIMIT_PERSISTENCE_POSTGRES);
      __setBucketStoreForTests(store);
      const d1 = await decideRateLimit("client-pg", "PUBLIC_READ");
      expect(d1.persistence).toBe("POSTGRES_PERSISTED");
      expect(d1.remaining).toBe(PUBLIC_READ_LIMIT - 1);
      const d2 = await decideRateLimit("client-pg", "PUBLIC_READ");
      expect(d2.remaining).toBe(PUBLIC_READ_LIMIT - 2); // state persisted in the store
      expect(store.calls).toBe(2);
    });

    it("store failure falls back to memory and HONESTLY flips disclosure to UNPERSISTED (non-fatal)", async () => {
      __setRateLimiterClockForTests(() => 2000);
      const throwing: BucketStore = {
        persistence: RATE_LIMIT_PERSISTENCE_POSTGRES,
        async step() {
          throw new Error("db down");
        },
      };
      __setBucketStoreForTests(throwing);
      const d = await decideRateLimit("client-fb", "PUBLIC_READ");
      expect(d.allowed).toBe(true); // request still served — never fatal
      expect(d.persistence).toBe("PER_INSTANCE_UNPERSISTED"); // MEASURED fallback, not claimed
      const fb = getLastRateLimitFallback();
      expect(fb?.reason).toContain("db down");
    });

    it("enforceRateLimit surfaces the MEASURED persistence of the active store", async () => {
      __setBucketStoreForTests(makeFakeStore(RATE_LIMIT_PERSISTENCE_POSTGRES));
      const disc = await enforceRateLimit(ctxWith({ "x-forwarded-for": "9.9.9.9" }));
      expect(disc.persistence).toBe("POSTGRES_PERSISTED");
    });

    it("with no persistent store configured, the disclosure is honestly UNPERSISTED", async () => {
      delete process.env.DATABASE_URL;
      const disc = await enforceRateLimit(ctxWith({ "x-forwarded-for": "8.8.8.8" }));
      expect(disc.persistence).toBe("PER_INSTANCE_UNPERSISTED");
    });
  });
});

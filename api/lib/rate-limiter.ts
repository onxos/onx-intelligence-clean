// ============================================================
// RATE LIMITER (STE-K-05) — deterministic in-memory token bucket
// guarding the DETERMINISTIC PUBLIC surfaces opened across the
// waves (rankedSearch, classify, ask.onx, truthHistory,
// providers.status). Closes the last deploy gap: public reads had
// no abuse ceiling.
//
// HONEST DISCLOSURE (in comment AND in every response/error):
//   persistence = PER_INSTANCE_UNPERSISTED. The buckets live in
//   process memory only — they are NOT shared across instances and
//   RESET on every boot. This is a single-instance abuse ceiling,
//   not a distributed quota. Stated plainly so no one mistakes it
//   for a durable guarantee.
//
// Deterministic & testable: the clock is injectable, so refill
// behaviour is proven with a fake clock (no real waiting).
// ============================================================
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";

export type RateCategory = "PUBLIC_READ";

// Declared, exported constants — the public-read ceiling.
export const PUBLIC_READ_LIMIT = 60; // requests
export const PUBLIC_READ_WINDOW_SEC = 60; // per minute

const CATEGORY_LIMITS: Record<RateCategory, { limit: number; windowSec: number }> = {
  PUBLIC_READ: { limit: PUBLIC_READ_LIMIT, windowSec: PUBLIC_READ_WINDOW_SEC },
};

export const RATE_LIMIT_PERSISTENCE = "PER_INSTANCE_UNPERSISTED" as const;

interface Bucket {
  tokens: number;
  last: number; // ms timestamp of last refill
}

// Keyed by `${category}::${clientKey}` → isolated buckets per client.
const buckets = new Map<string, Bucket>();

// Injectable clock (ms). Tests replace it to drive refill deterministically.
let clock: () => number = () => Date.now();

export function __setRateLimiterClockForTests(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

export function __resetRateLimiterForTests(): void {
  buckets.clear();
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  category: RateCategory;
  persistence: typeof RATE_LIMIT_PERSISTENCE;
}

// Core token-bucket step: refill by elapsed time, then try to spend 1.
export function consumeToken(clientKey: string, category: RateCategory): RateDecision {
  const { limit, windowSec } = CATEGORY_LIMITS[category];
  const refillPerMs = limit / (windowSec * 1000); // tokens per millisecond
  const now = clock();
  const mapKey = `${category}::${clientKey}`;

  let bucket = buckets.get(mapKey);
  if (!bucket) {
    bucket = { tokens: limit, last: now };
    buckets.set(mapKey, bucket);
  }

  const elapsed = Math.max(0, now - bucket.last);
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillPerMs);
  bucket.last = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      limit,
      remaining: Math.floor(bucket.tokens),
      retryAfterSeconds: 0,
      category,
      persistence: RATE_LIMIT_PERSISTENCE,
    };
  }

  // Not enough for one token — report an HONEST wait time.
  const deficit = 1 - bucket.tokens;
  const retryAfterSeconds = Math.max(1, Math.ceil(deficit / refillPerMs / 1000));
  return {
    allowed: false,
    limit,
    remaining: 0,
    retryAfterSeconds,
    category,
    persistence: RATE_LIMIT_PERSISTENCE,
  };
}

// Derive a stable client key from proxy headers (Render sets
// x-forwarded-for). Never throws; falls back to "anonymous".
export function clientKeyFromCtx(ctx: TrpcContext): string {
  const headers = ctx?.req?.headers;
  if (!headers || typeof headers.get !== "function") return "anonymous";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "anonymous";
}

// Compact disclosure embedded in successful public responses.
export interface RateLimitDisclosure {
  limit: number;
  remaining: number;
  category: RateCategory;
  persistence: typeof RATE_LIMIT_PERSISTENCE;
}

// Enforce on a public surface. On success returns the disclosure to
// embed; on exhaustion throws a 429 (TOO_MANY_REQUESTS) carrying an
// honest retryAfterSeconds, and sets the Retry-After response header.
export function enforceRateLimit(
  ctx: TrpcContext,
  category: RateCategory = "PUBLIC_READ",
): RateLimitDisclosure {
  const decision = consumeToken(clientKeyFromCtx(ctx), category);
  if (!decision.allowed) {
    try {
      ctx.resHeaders?.set("Retry-After", String(decision.retryAfterSeconds));
    } catch {
      // resHeaders may be absent in non-HTTP callers — non-fatal.
    }
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: JSON.stringify({
        error: "RATE_LIMITED",
        retryAfterSeconds: decision.retryAfterSeconds,
        limit: decision.limit,
        category: decision.category,
        persistence: decision.persistence,
      }),
    });
  }
  return {
    limit: decision.limit,
    remaining: decision.remaining,
    category: decision.category,
    persistence: decision.persistence,
  };
}

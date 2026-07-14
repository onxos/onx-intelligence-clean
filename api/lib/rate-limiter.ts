// ============================================================
// RATE LIMITER (STE-K-05 → upgraded STE-K-19) — token bucket
// guarding the DETERMINISTIC PUBLIC surfaces opened across the
// waves (rankedSearch, classify, ask.onx, truthHistory,
// providers.status). Closes the last deploy gap: public reads had
// no abuse ceiling.
//
// HONEST DISCLOSURE — MEASURED PER WINDOW, NOT CLAIMED (STE-K-19):
//   Each decision carries the persistence of the store that ACTUALLY
//   served it:
//     • POSTGRES_PERSISTED       — the bucket state was read+written
//       in Postgres (shared across instances, survives restart).
//     • PER_INSTANCE_UNPERSISTED — served from process memory only
//       (NOT shared, RESETS on boot). This is the honest fallback:
//       if DATABASE_URL is unset OR the Postgres round-trip throws,
//       the decision is served from memory and the disclosure flips
//       to PER_INSTANCE_UNPERSISTED for THAT window. The mode always
//       reflects the real backing store measured that request — it is
//       never asserted ahead of the measurement.
//
// Deterministic & testable: the pure bucket math (stepBucket) is a
// side-effect-free function of (prev bucket, now) — proven with a
// fake clock (no real waiting). The persistence layer is an
// injectable BucketStore, so the persisted round-trip and the
// honest fallback flip are proven WITHOUT a live database.
// ============================================================
import { TRPCError } from "@trpc/server";
import { Pool, type PoolClient } from "pg";
import type { TrpcContext } from "../context";

export type RateCategory = "PUBLIC_READ";

// Declared, exported constants — the public-read ceiling.
export const PUBLIC_READ_LIMIT = 60; // requests
export const PUBLIC_READ_WINDOW_SEC = 60; // per minute

const CATEGORY_LIMITS: Record<RateCategory, { limit: number; windowSec: number }> = {
  PUBLIC_READ: { limit: PUBLIC_READ_LIMIT, windowSec: PUBLIC_READ_WINDOW_SEC },
};

// The two honest, MEASURED persistence modes a decision can carry.
export const RATE_LIMIT_PERSISTENCE_MEMORY = "PER_INSTANCE_UNPERSISTED" as const;
export const RATE_LIMIT_PERSISTENCE_POSTGRES = "POSTGRES_PERSISTED" as const;
export type RateLimitPersistence =
  | typeof RATE_LIMIT_PERSISTENCE_MEMORY
  | typeof RATE_LIMIT_PERSISTENCE_POSTGRES;

// Back-compat alias (STE-K-05 name) — the memory-mode label.
export const RATE_LIMIT_PERSISTENCE = RATE_LIMIT_PERSISTENCE_MEMORY;

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

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  category: RateCategory;
  persistence: RateLimitPersistence;
}

// ---- PURE token-bucket math (deterministic, side-effect free) ------
// Given the previous bucket (or null for a fresh key) and the current
// time, refill by elapsed time then try to spend one token. Returns
// the NEXT bucket state plus the honest decision. The persistence
// label is passed in so the same math serves both stores truthfully.
export function stepBucket(
  prev: Bucket | null,
  now: number,
  category: RateCategory,
  persistence: RateLimitPersistence,
): { bucket: Bucket; decision: RateDecision } {
  const { limit, windowSec } = CATEGORY_LIMITS[category];
  const refillPerMs = limit / (windowSec * 1000); // tokens per millisecond
  const bucket: Bucket = prev ? { tokens: prev.tokens, last: prev.last } : { tokens: limit, last: now };

  const elapsed = Math.max(0, now - bucket.last);
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillPerMs);
  bucket.last = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      bucket,
      decision: {
        allowed: true,
        limit,
        remaining: Math.floor(bucket.tokens),
        retryAfterSeconds: 0,
        category,
        persistence,
      },
    };
  }

  // Not enough for one token — report an HONEST wait time.
  const deficit = 1 - bucket.tokens;
  const retryAfterSeconds = Math.max(1, Math.ceil(deficit / refillPerMs / 1000));
  return {
    bucket,
    decision: {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds,
      category,
      persistence,
    },
  };
}

// Core in-memory step (STE-K-05 behaviour, UNPERSISTED). Kept sync so
// the pure math and the memory fallback stay trivially deterministic.
export function consumeToken(clientKey: string, category: RateCategory): RateDecision {
  const mapKey = `${category}::${clientKey}`;
  const { bucket, decision } = stepBucket(
    buckets.get(mapKey) ?? null,
    clock(),
    category,
    RATE_LIMIT_PERSISTENCE_MEMORY,
  );
  buckets.set(mapKey, bucket);
  return decision;
}

// ---- Persistent bucket store (STE-K-19) ----------------------------
// A store performs the ATOMIC read-modify-write for one bucket key and
// reports which backing store served it. The Postgres implementation
// does it inside a SELECT ... FOR UPDATE transaction so concurrent
// instances cannot race the same key.
export interface BucketStore {
  readonly persistence: RateLimitPersistence;
  step(mapKey: string, now: number, category: RateCategory): Promise<RateDecision>;
}

let pool: Pool | null = null;
let schemaReady = false;

export function isRateLimitPersistenceConfigured(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres");
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    if (!connectionString.startsWith("postgres")) {
      throw new Error("RATE_LIMIT_PG_NOT_CONFIGURED: DATABASE_URL is not postgres");
    }
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 5,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS onx_rate_limit_buckets (
    bucket_key VARCHAR(200) PRIMARY KEY,
    tokens DOUBLE PRECISION NOT NULL,
    last_ms BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  schemaReady = true;
}

const postgresStore: BucketStore = {
  persistence: RATE_LIMIT_PERSISTENCE_POSTGRES,
  async step(mapKey, now, category) {
    await ensureSchema();
    const p = getPool();
    const client: PoolClient = await p.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `SELECT tokens, last_ms FROM onx_rate_limit_buckets WHERE bucket_key = $1 FOR UPDATE`,
        [mapKey],
      );
      const row = res.rows[0];
      const prev: Bucket | null = row ? { tokens: Number(row.tokens), last: Number(row.last_ms) } : null;
      const { bucket, decision } = stepBucket(prev, now, category, RATE_LIMIT_PERSISTENCE_POSTGRES);
      await client.query(
        `INSERT INTO onx_rate_limit_buckets (bucket_key, tokens, last_ms, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (bucket_key)
         DO UPDATE SET tokens = EXCLUDED.tokens, last_ms = EXCLUDED.last_ms, updated_at = now()`,
        [mapKey, bucket.tokens, bucket.last],
      );
      await client.query("COMMIT");
      return decision;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // rollback best-effort — the outer catch owns the fallback.
      }
      throw err;
    } finally {
      client.release();
    }
  },
};

// Test seam: inject a fake store to prove the persisted round-trip and
// the honest fallback flip without a live database.
let injectedStore: BucketStore | null = null;
export function __setBucketStoreForTests(store: BucketStore | null): void {
  injectedStore = store;
}

function activeStore(): BucketStore | null {
  if (injectedStore) return injectedStore;
  if (isRateLimitPersistenceConfigured()) return postgresStore;
  return null; // no persistent backing → memory path
}

// Honest, non-fatal record of the last persistence fallback so the
// server-side operator can see when Postgres degraded to memory. Never
// throws; a rate-limit backing failure must never take the surface down.
export interface RateLimitFallbackInfo {
  at: string;
  reason: string;
}
let lastFallback: RateLimitFallbackInfo | null = null;
export function getLastRateLimitFallback(): RateLimitFallbackInfo | null {
  return lastFallback;
}

export function __resetRateLimiterForTests(): void {
  buckets.clear();
  pool = null;
  schemaReady = false;
  injectedStore = null;
  lastFallback = null;
}

// Decide the outcome for one client key. Tries the persistent store
// when configured; on ANY error falls back to the in-memory bucket and
// the returned decision honestly carries PER_INSTANCE_UNPERSISTED.
export async function decideRateLimit(
  clientKey: string,
  category: RateCategory,
): Promise<RateDecision> {
  const store = activeStore();
  if (store) {
    try {
      return await store.step(`${category}::${clientKey}`, clock(), category);
    } catch (err) {
      // Non-fatal: log the degradation server-side and serve from memory.
      lastFallback = {
        at: new Date().toISOString(),
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return consumeToken(clientKey, category);
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

// Compact disclosure embedded in successful public responses. The
// persistence is MEASURED (the store that actually served this call).
export interface RateLimitDisclosure {
  limit: number;
  remaining: number;
  category: RateCategory;
  persistence: RateLimitPersistence;
}

// Enforce on a public surface. On success returns the disclosure to
// embed; on exhaustion throws a 429 (TOO_MANY_REQUESTS) carrying an
// honest retryAfterSeconds, and sets the Retry-After response header.
// Async because the persistent backing store is async; the honest
// fallback keeps it working even when Postgres is unreachable.
export async function enforceRateLimit(
  ctx: TrpcContext,
  category: RateCategory = "PUBLIC_READ",
): Promise<RateLimitDisclosure> {
  const decision = await decideRateLimit(clientKeyFromCtx(ctx), category);
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

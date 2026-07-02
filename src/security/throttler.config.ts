/**
 * Phase 4 — per-endpoint rate-limit configuration.
 *
 * Constitutional endpoints get the strictest limits (SECH decisions), AI and
 * FIC are moderate, webhooks are generous (external systems), everything else
 * uses the default. `ttl` is a window in seconds; `limit` is requests/window.
 */
export interface ThrottleOptions {
  ttl: number;
  limit: number;
  /** Enforce even under NODE_ENV=test (used by the rate-limit e2e). */
  enforceInTest?: boolean;
}

export const THROTTLER_CONFIG = {
  sech: { ttl: 60, limit: 10 },
  ai: { ttl: 60, limit: 30 },
  fic: { ttl: 60, limit: 20 },
  default: { ttl: 60, limit: 60 },
  webhooks: { ttl: 60, limit: 120 },
} satisfies Record<string, ThrottleOptions>;

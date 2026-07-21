import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";
import { usageAggregates, recentUsage } from "./lib/provider-usage-store";
import { providerCapitalProfiles } from "./lib/provider-capital-engine";

/**
 * Provider Capital router — the AI ledger: every provider's real consumption
 * (calls, tokens, cost, latency, reliability) and its evidence-grounded
 * capital profile (EV-06 11-dimension model, D13/D17 discipline).
 * Bridge-protected. Read-only — recording happens inside the call paths.
 */
export const providerCapitalRouter = createRouter({
  /** Consumption summary per provider (AI ledger). */
  usage: protectedQuery
    .input(z.object({ windowHours: z.number().min(1).max(24 * 365).default(24 * 30) }))
    .query(async ({ input }) => ({
      ok: true as const,
      windowHours: input.windowHours,
      providers: await usageAggregates(input.windowHours),
    })),

  /** 11-dimension capital profile per provider, computed from live evidence. */
  profiles: protectedQuery
    .input(z.object({ windowHours: z.number().min(1).max(24 * 365).default(24 * 30) }))
    .query(async ({ input }) => ({
      ok: true as const,
      windowHours: input.windowHours,
      profiles: await providerCapitalProfiles(input.windowHours),
    })),

  /** Raw recent metered calls (audit trail). */
  recent: protectedQuery
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => ({
      ok: true as const,
      rows: await recentUsage(input.limit),
    })),
});

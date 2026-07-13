// ============================================================
// PROVIDERS ROUTER — STE-Q-01 "Honest provider union" (D-8)
// providers.status: public read (corpusQuery.status pattern) —
//   the honest tri-state array, never exposing key values.
// providers.liveValidate: behind the fail-closed bridge guard —
//   performs REAL probes and upgrades states to VALIDATED only
//   on actual success (to be run when keys arrive, STE-REC-03).
// ============================================================
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { assertBridgeAccess, getBridgeState } from "./bridge-guard";
import { getProviderStates, liveValidateProviders } from "./lib/provider-registry";

export const providersRouter = createRouter({
  status: publicQuery.query(({ ctx }) => {
    const rateLimit = enforceRateLimit(ctx);
    return {
      bridge: "providers",
      rateLimit,
      ...getBridgeState(),
      providers: getProviderStates(),
    };
  }),

  liveValidate: publicQuery.mutation(async ({ ctx }) => {
    assertBridgeAccess(ctx);
    const results = await liveValidateProviders();
    return {
      bridge: "providers",
      probedAt: new Date().toISOString(),
      results,
    };
  }),
});

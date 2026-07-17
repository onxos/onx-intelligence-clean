// ============================================================
// DEEP RESEARCH ROUTER — K1 over tRPC
//
// Surfaces the deterministic deep-research loop:
//   • plan — decompose a question into a closed sub-query list.
//   • run  — execute plan→collect→validate→contradict→report.
//
// GOVERNANCE (server-owned, fail-closed):
//   • The CLOCK is owned by the server (`new Date()`), never supplied by the
//     caller — there is no fabricated-time fallback in the engine.
//   • The PROVIDER is owned by the server. The client CANNOT inject source
//     fixtures; it may only opt into a clearly-labelled, deterministic DEMO
//     provider. With no live backend wired, the default is "unavailable" and
//     the report is honestly empty (with an explicit `providerStatus`).
//   • Recursion depth is clamped to the server-owned MAX_DEPTH_HARD_CAP both
//     at the schema boundary and again inside the engine (defence in depth).
//
// Contradiction handling is delegated to the B5 reality pipeline inside the
// engine; nothing is re-implemented here.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  planResearch,
  runDeepResearch,
  makeDemoProvider,
  makeUnavailableProvider,
  DEFAULT_MAX_DEPTH,
  MAX_DEPTH_HARD_CAP,
  type ProviderStatus,
} from "./lib/deep-research";

export const deepResearchRouter = createRouter({
  // Decompose a research question into a closed, deterministic sub-query set.
  plan: publicQuery
    .input(
      z.object({
        question: z.string().min(1),
        facets: z.array(z.string().min(1)).optional(),
        maxDepth: z.number().int().min(1).max(MAX_DEPTH_HARD_CAP).optional(),
      }),
    )
    .query(({ input }) =>
      planResearch(input.question, {
        facets: input.facets,
        maxDepth: input.maxDepth,
      }),
    ),

  // Run the full loop with a SERVER-OWNED provider and clock. No caller
  // fixtures and no caller clock are accepted.
  run: publicQuery
    .input(
      z.object({
        question: z.string().min(1),
        /** Opt into the deterministic, server-owned DEMO provider. */
        demo: z.boolean().optional(),
        maxDepth: z.number().int().min(1).max(MAX_DEPTH_HARD_CAP).optional(),
        reliabilityThreshold: z.number().min(0).max(1).optional(),
      }),
    )
    .query(async ({ input }) => {
      // Server owns the clock — real time, never a caller-supplied value.
      const now = new Date().toISOString();
      // Server owns the provider — no live backend is wired, so absent an
      // explicit demo opt-in the status is honestly "unavailable".
      const useDemo = input.demo === true;
      const provider = useDemo
        ? makeDemoProvider()
        : makeUnavailableProvider();
      const providerStatus: ProviderStatus = useDemo ? "demo" : "unavailable";
      return runDeepResearch(input.question, provider, {
        now,
        maxDepth: input.maxDepth ?? DEFAULT_MAX_DEPTH,
        reliabilityThreshold: input.reliabilityThreshold,
        providerStatus,
      });
    }),
});

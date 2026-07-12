// ============================================================
// DEEP RESEARCH ROUTER — K1 over tRPC
//
// Surfaces the deterministic deep-research loop:
//   • plan — decompose a question into a closed sub-query list
//   • run  — execute plan→collect→validate→contradict→report over an
//            explicit, caller-supplied source fixture map (the injectable
//            provider port). Keyless & deterministic; there is no hidden
//            live-retrieval backend, so an empty fixture map honestly
//            yields an empty (but well-formed) report — no fabricated data.
//
// Contradiction handling is delegated to the B5 reality pipeline inside
// the engine; nothing is re-implemented here.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  planResearch,
  runDeepResearch,
  makeStaticProvider,
  DEFAULT_MAX_DEPTH,
  type ResearchSource,
} from "./lib/deep-research";

const claimSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  text: z.string().optional(),
});

const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  publishedAt: z.string(),
  reliability: z.number(),
  claims: z.array(claimSchema),
});

const fixtureSchema = z.object({
  queryId: z.string().min(1),
  sources: z.array(sourceSchema),
});

export const deepResearchRouter = createRouter({
  // Decompose a research question into a closed, deterministic sub-query set.
  plan: publicQuery
    .input(
      z.object({
        question: z.string().min(1),
        facets: z.array(z.string().min(1)).optional(),
        maxDepth: z.number().int().min(1).optional(),
      }),
    )
    .query(({ input }) =>
      planResearch(input.question, {
        facets: input.facets,
        maxDepth: input.maxDepth,
      }),
    ),

  // Run the full loop over an explicit fixture map (injected provider).
  run: publicQuery
    .input(
      z.object({
        question: z.string().min(1),
        fixtures: z.array(fixtureSchema).optional(),
        maxDepth: z.number().int().min(1).optional(),
        reliabilityThreshold: z.number().min(0).max(1).optional(),
        /** Deterministic clock; defaults inside the engine. */
        now: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const byQueryId: Record<string, ResearchSource[]> = {};
      for (const f of input.fixtures ?? []) {
        byQueryId[f.queryId] = f.sources;
      }
      const provider = makeStaticProvider(byQueryId);
      return runDeepResearch(input.question, provider, {
        maxDepth: input.maxDepth ?? DEFAULT_MAX_DEPTH,
        reliabilityThreshold: input.reliabilityThreshold,
        now: input.now,
      });
    }),
});

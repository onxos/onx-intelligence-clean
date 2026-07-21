import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";
import { runAgenticLoop, listAgenticRuns, getAgenticRun } from "./lib/agentic-loop";
import { cacheStats, clearCache } from "./lib/answer-cache";

/**
 * Agentic Loop router — the brain as an agent: goal in, grounded answer out,
 * with real tool calls against live production data, persisted runs, and a
 * governance trail. Bridge-protected (users or machines).
 */
export const agenticLoopRouter = createRouter({
  run: protectedQuery
    .input(z.object({
      goal: z.string().min(3).max(4000),
      maxSteps: z.number().min(1).max(12).default(8),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(16).default([]),
    }))
    .mutation(async ({ input }) => runAgenticLoop(input.goal, input.maxSteps, input.history)),

  list: protectedQuery
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => listAgenticRuns(input.limit)),

  get: protectedQuery
    .input(z.object({ id: z.string().min(4) }))
    .query(async ({ input }) => getAgenticRun(input.id)),

  /** Knowledge-sovereignty cache: entries, hits, estimated tokens saved. */
  cacheStats: protectedQuery.query(async () => cacheStats()),

  /** Flush the learned-answer cache (founder command). */
  cacheClear: protectedQuery.mutation(async () => clearCache()),

  capabilities: protectedQuery.query(async () => ({
    tools: ["corpus_search", "corpus_stats", "agents_liveness", "task_queue_stats", "delegate_task"],
    providerConfigured: Boolean(process.env.OPENAI_API_KEY || (process.env.AGENTIC_API_KEY && process.env.AGENTIC_BASE_URL)),
    model: process.env.AGENTIC_MODEL || "gpt-4o-mini",
    customProvider: Boolean(process.env.AGENTIC_BASE_URL),
  })),
});

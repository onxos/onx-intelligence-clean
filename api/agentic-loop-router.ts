import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";
import { runAgenticLoop, listAgenticRuns, getAgenticRun } from "./lib/agentic-loop";

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
    }))
    .mutation(async ({ input }) => runAgenticLoop(input.goal, input.maxSteps)),

  list: protectedQuery
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => listAgenticRuns(input.limit)),

  get: protectedQuery
    .input(z.object({ id: z.string().min(4) }))
    .query(async ({ input }) => getAgenticRun(input.id)),

  capabilities: protectedQuery.query(async () => ({
    tools: ["corpus_search", "corpus_stats", "agents_liveness", "task_queue_stats", "delegate_task"],
    providerConfigured: Boolean(process.env.OPENAI_API_KEY || (process.env.AGENTIC_API_KEY && process.env.AGENTIC_BASE_URL)),
    model: process.env.AGENTIC_MODEL || "gpt-4o-mini",
    customProvider: Boolean(process.env.AGENTIC_BASE_URL),
  })),
});

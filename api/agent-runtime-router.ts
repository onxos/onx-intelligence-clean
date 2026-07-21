// ============================================================
// AGENT RUNTIME ROUTER — the agents' actual work loop.
// Every rhythm tick: the 50 registered agents beat, and the
// runtime claims queued tasks and executes the built-in handlers
// (health snapshot, corpus count, governance digest). External
// systems submit work via submitTask.
// ============================================================
import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";
import { agentLiveness, submitTask, taskStats } from "./lib/agent-runtime-store";

export const agentRuntimeRouter = createRouter({
  // Live view: 50 registered agents × latest heartbeat
  status: protectedQuery.query(async () => agentLiveness()),

  tasks: protectedQuery.query(async () => taskStats()),

  submitTask: protectedQuery
    .input(z.object({
      kind: z.enum(["health.snapshot", "governance.digest", "corpus.embed.check"]),
      agentId: z.string().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const taskId = await submitTask(input.kind, input.payload ?? {}, input.agentId);
      return { taskId, status: "QUEUED" };
    }),

  // One runtime cycle: delegates to the shared standing work loop
  // (api/lib/agent-runtime-store.agentTick) also driven by the rhythms.
  tick: protectedQuery
    .input(z.object({ rhythm: z.string().default("pulse"), maxTasks: z.number().min(0).max(10).default(3) }).optional())
    .mutation(async ({ input }) => {
      const { agentTick } = await import("./lib/agent-runtime-store");
      const result = await agentTick(input?.rhythm ?? "pulse", input?.maxTasks ?? 3);
      return { rhythm: input?.rhythm ?? "pulse", ...result, tickAt: new Date().toISOString() };
    }),
});

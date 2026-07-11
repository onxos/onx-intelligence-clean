// ============================================================
// ORCHESTRATOR ROUTER — ONX Orchestrator over tRPC (B2)
//
// Exposes the coordinator runtime: accept a mandate (decomposed into a
// CLOSED wave map), run it through distribution → execution → INDEPENDENT
// verification under a budget governor, resume stragglers, and return a
// report that separates PROVEN work from merely CLAIMED work.
//
// In-memory + deterministic (the mock executor needs no keys), so it runs
// in CI with no DB / secrets. Follows the ocmbr-router pattern.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { EXECUTOR_KINDS } from "./lib/orchestrator-engine";
import {
  createMandate,
  getMandate,
  listDecisions,
  reassignStragglers,
  report,
  runMandate,
  runTask,
} from "./lib/orchestrator-store";

const zExecutorKind = z.enum(
  EXECUTOR_KINDS as unknown as [string, ...string[]],
);

const zVerify = z.object({
  mustInclude: z.string().optional(),
  mustEqual: z.string().optional(),
  minLength: z.number().int().nonnegative().optional(),
});

const zTask = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  executor: zExecutorKind,
  estimatedCost: z.number().nonnegative(),
  verify: zVerify,
  maxAttempts: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const zWave = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  exitGate: z.string().min(1),
  tasks: z.array(zTask),
});

const zMandate = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  budget: z.number().positive(),
  waves: z.array(zWave),
});

export const orchestratorRouter = createRouter({
  // Accept a mandate and decompose it into a CLOSED wave map.
  createMandate: publicQuery.input(zMandate).mutation(({ input }) => {
    return createMandate({
      ...input,
      waves: input.waves.map((w) => ({
        ...w,
        tasks: w.tasks.map((t) => ({
          ...t,
          executor: t.executor as (typeof EXECUTOR_KINDS)[number],
        })),
      })),
    });
  }),

  // Run the whole mandate cycle and return the report.
  run: publicQuery
    .input(z.object({ mandateId: z.string().min(1), now: z.number().optional() }))
    .mutation(async ({ input }) => {
      return runMandate(input.mandateId, input.now);
    }),

  // Run a single task attempt (budget → distribute → execute → verify).
  runTask: publicQuery
    .input(z.object({ taskId: z.string().min(1), now: z.number().optional() }))
    .mutation(async ({ input }) => {
      return runTask(input.taskId, input.now);
    }),

  // Detect + reassign stragglers (timed-out / failed / rejected tasks).
  reassignStragglers: publicQuery
    .input(z.object({ mandateId: z.string().min(1), now: z.number().optional() }))
    .mutation(({ input }) => {
      return reassignStragglers(input.mandateId, input.now);
    }),

  // The mandate report — separates PROVEN from CLAIMED.
  report: publicQuery
    .input(z.object({ mandateId: z.string().min(1) }))
    .query(({ input }) => {
      if (!getMandate(input.mandateId)) return { found: false as const };
      return { found: true as const, report: report(input.mandateId) };
    }),

  // The reasoned decision log (neutrality / honesty audit trail).
  decisions: publicQuery
    .input(z.object({ mandateId: z.string().optional() }).optional())
    .query(({ input }) => listDecisions(input?.mandateId)),
});

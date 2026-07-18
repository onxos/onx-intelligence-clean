// ============================================================
// AGENT RUNTIME ROUTER — the agents' actual work loop.
// Every rhythm tick: the 50 registered agents beat, and the
// runtime claims queued tasks and executes the built-in handlers
// (health snapshot, corpus count, governance digest). External
// systems submit work via submitTask.
// ============================================================
import { z } from "zod";
import { createRouter, protectedQuery } from "./middleware";
import {
  agentLiveness,
  beat,
  claimTask,
  completeTask,
  ensureAgentSchema,
  submitTask,
  taskStats,
} from "./lib/agent-runtime-store";
import { Pool } from "pg";

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL ?? "";
  const isExternalHost = connectionString.includes("render.com");
  return new Pool({
    connectionString,
    max: 1,
    ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

/** Built-in task handlers — real work against the live system. */
async function executeTask(kind: string, payload: unknown): Promise<unknown> {
  const p = getPool();
  try {
    switch (kind) {
      case "health.snapshot": {
        const { rows } = await p.query(
          `SELECT count(*)::int AS corpus FROM onx_knowledge_corpus`);
        return { corpusRecords: rows[0].corpus, at: new Date().toISOString() };
      }
      case "governance.digest": {
        const { rows } = await p.query(
          `SELECT count(*)::int AS decisions, count(*) FILTER (WHERE NOT passed)::int AS blocked
             FROM onx_governance_decisions WHERE "createdAt" > now() - interval '1 hour'`);
        return rows[0];
      }
      case "corpus.embed.check": {
        const { rows } = await p.query(
          `SELECT count(*)::int AS total, count(embedding)::int AS embedded FROM onx_knowledge_corpus`);
        return rows[0];
      }
      default:
        return { echo: payload, note: "no built-in handler — echoed" };
    }
  } finally {
    await p.end().catch(() => undefined);
  }
}

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

  // One runtime cycle: all agents beat + process up to `maxTasks` queued tasks.
  // Called by the pulse rhythm and available on demand.
  tick: protectedQuery
    .input(z.object({ rhythm: z.string().default("pulse"), maxTasks: z.number().min(0).max(10).default(3) }).optional())
    .mutation(async ({ input }) => {
      await ensureAgentSchema();
      const rhythm = input?.rhythm ?? "pulse";
      const maxTasks = input?.maxTasks ?? 3;
      const p = getPool();
      let agentsBeat = 0;
      try {
        const { rows } = await p.query(`SELECT id FROM agents WHERE status='ACTIVE'`);
        for (const a of rows) {
          await beat(a.id as string, rhythm, 0);
          agentsBeat++;
        }
      } finally {
        await p.end().catch(() => undefined);
      }
      let processed = 0;
      for (let i = 0; i < maxTasks; i++) {
        const task = await claimTask();
        if (!task) break;
        try {
          const result = await executeTask(task.kind, task.payload);
          await completeTask(task.taskId, result, true);
        } catch (e) {
          await completeTask(task.taskId, { error: String(e).slice(0, 200) }, false);
        }
        processed++;
      }
      return { rhythm, agentsBeat, tasksProcessed: processed, tickAt: new Date().toISOString() };
    }),
});

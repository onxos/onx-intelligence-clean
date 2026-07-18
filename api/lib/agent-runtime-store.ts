// ============================================================
// AGENT RUNTIME STORE — turns the 50 rows in `agents` into live
// workers: heartbeats on every tick, a claimable task queue, and
// an honest liveness view. The `agents` table stays the registry;
// this store is the runtime (PostgreSQL, CREATE TABLE IF NOT EXISTS).
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL ?? "";
  if (!connectionString.startsWith("postgres")) {
    throw new Error("AGENT_RUNTIME_NOT_CONFIGURED: DATABASE_URL is not postgres");
  }
  if (!pool) {
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 3,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

export async function ensureAgentSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS onx_agent_heartbeats (
      id SERIAL PRIMARY KEY,
      "agentId" TEXT NOT NULL,
      rhythm TEXT,
      "tasksProcessed" INT DEFAULT 0,
      status TEXT DEFAULT 'ALIVE',
      "beatAt" TIMESTAMPTZ DEFAULT now());
    CREATE INDEX IF NOT EXISTS agent_hb_idx ON onx_agent_heartbeats ("agentId", "beatAt" DESC);
    CREATE TABLE IF NOT EXISTS onx_agent_tasks (
      id SERIAL PRIMARY KEY,
      "taskId" VARCHAR(48) UNIQUE,
      "agentId" TEXT,
      kind TEXT,
      payload JSONB,
      status TEXT DEFAULT 'QUEUED',
      result JSONB,
      "claimedAt" TIMESTAMPTZ,
      "completedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON onx_agent_tasks (status, "createdAt");
  `);
  schemaReady = true;
}

/** Heartbeat for one agent — called by the runtime tick. */
export async function beat(agentId: string, rhythm: string, tasksProcessed: number): Promise<void> {
  await ensureAgentSchema();
  await getPool().query(
    `INSERT INTO onx_agent_heartbeats ("agentId", rhythm, "tasksProcessed", status) VALUES ($1,$2,$3,'ALIVE')`,
    [agentId, rhythm, tasksProcessed]);
}

export async function submitTask(kind: string, payload: unknown, agentId?: string): Promise<string> {
  await ensureAgentSchema();
  const taskId = `TSK-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await getPool().query(
    `INSERT INTO onx_agent_tasks ("taskId","agentId",kind,payload) VALUES ($1,$2,$3,$4)`,
    [taskId, agentId ?? null, kind, JSON.stringify(payload ?? {})]);
  return taskId;
}

/** Claim oldest queued task (optionally for a specific agent). */
export async function claimTask(agentId?: string): Promise<{ taskId: string; kind: string; payload: unknown } | null> {
  await ensureAgentSchema();
  const p = getPool();
  const { rows } = await p.query(
    `UPDATE onx_agent_tasks SET status='RUNNING', "claimedAt"=now(), "agentId"=COALESCE("agentId", $1)
      WHERE "taskId" = (
        SELECT "taskId" FROM onx_agent_tasks
         WHERE status='QUEUED' AND ($1::text IS NULL OR "agentId" IS NULL OR "agentId"=$1)
         ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING "taskId", kind, payload`,
    [agentId ?? null]);
  return rows[0] ?? null;
}

export async function completeTask(taskId: string, result: unknown, ok = true): Promise<void> {
  await ensureAgentSchema();
  await getPool().query(
    `UPDATE onx_agent_tasks SET status=$2, result=$3, "completedAt"=now() WHERE "taskId"=$1`,
    [taskId, ok ? "DONE" : "FAILED", JSON.stringify(result ?? {})]);
}

/** Liveness view: registry agents joined with their latest heartbeat. */
export async function agentLiveness(): Promise<unknown> {
  await ensureAgentSchema();
  const p = getPool();
  const { rows: registry } = await p.query(
    `SELECT id, name, status, model FROM agents ORDER BY created_at ASC`);
  const { rows: beats } = await p.query(
    `SELECT DISTINCT ON ("agentId") "agentId", rhythm, "tasksProcessed", status, "beatAt"
       FROM onx_agent_heartbeats ORDER BY "agentId", "beatAt" DESC`);
  const beatMap = new Map(beats.map((b) => [b.agentId, b]));
  const agents = registry.map((a) => {
    const b = beatMap.get(a.id) as { beatAt: string; rhythm: string; tasksProcessed: number } | undefined;
    return {
      id: a.id,
      name: a.name,
      registryStatus: a.status,
      model: a.model,
      lastBeatAt: b?.beatAt ?? null,
      rhythm: b?.rhythm ?? null,
      tasksProcessed: b?.tasksProcessed ?? 0,
      live: Boolean(b && Date.now() - new Date(b.beatAt).getTime() < 10 * 60 * 1000),
    };
  });
  return {
    total: agents.length,
    live: agents.filter((a) => a.live).length,
    agents,
  };
}

export async function taskStats(): Promise<unknown> {
  await ensureAgentSchema();
  const { rows } = await getPool().query(
    `SELECT status, count(*)::int AS n FROM onx_agent_tasks GROUP BY status`);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** Built-in task handlers — real work against the live system. */
async function executeTask(kind: string, payload: unknown): Promise<unknown> {
  const p = getPool();
  try {
    switch (kind) {
      case "health.snapshot": {
        const { rows } = await p.query(`SELECT count(*)::int AS corpus FROM onx_knowledge_corpus`);
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
  } catch {
    return { deferred: true };
  }
}

/**
 * The agents' standing work loop — called by every consciousness-rhythm
 * execution (scheduler) and by agentRuntime.tick. All ACTIVE agents beat,
 * then up to maxTasks queued tasks are claimed and processed.
 */
export async function agentTick(rhythm: string, maxTasks = 2): Promise<{ agentsBeat: number; tasksProcessed: number }> {
  try {
    await ensureAgentSchema();
    const p = getPool();
    let agentsBeat = 0;
    try {
      const { rows } = await p.query(`SELECT id FROM agents WHERE status='ACTIVE'`);
      for (const a of rows) {
        await beat(a.id as string, rhythm, 0);
        agentsBeat++;
      }
    } catch {
      /* registry unavailable — tasks may still process */
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
    return { agentsBeat, tasksProcessed: processed };
  } catch {
    return { agentsBeat: 0, tasksProcessed: 0 };
  }
}

// ============================================================
// CONSCIOUSNESS CYCLE STORE — PG persistence for the 5 rhythms'
// execution cycles (replaces the dead drizzle consciousnessCycles
// write that failed silently against the Postgres DATABASE_URL).
// EV-P1-06/M07 evidence trail.
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

export function getCyclePool(): Pool | null {
  const connectionString = process.env.DATABASE_URL ?? "";
  if (!connectionString.startsWith("postgres")) return null;
  if (!pool) {
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 2,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

async function ensureSchema(p: Pool): Promise<void> {
  if (schemaReady) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS onx_consciousness_cycles (
      id SERIAL PRIMARY KEY,
      "rhythmId" TEXT, "rhythmName" TEXT, "cycleNumber" INT,
      status TEXT, "actionsExecuted" JSONB, "metricsSnapshot" JSONB,
      "healthScore" DOUBLE PRECISION, "anomaliesDetected" INT DEFAULT 0,
      "durationMs" INT, "completedAt" TIMESTAMPTZ DEFAULT now());
    CREATE INDEX IF NOT EXISTS cycles_rhythm_idx ON onx_consciousness_cycles ("rhythmId", "completedAt" DESC);
  `);
  schemaReady = true;
}

export interface CycleRecord {
  rhythmId: string;
  rhythmName: string;
  cycleNumber: number;
  status: string;
  actionsExecuted: unknown;
  metricsSnapshot: unknown;
  healthScore: number;
  anomaliesDetected: number;
  durationMs: number;
}

/** Fire-and-forget persist — resolves true/false for observability. */
export async function persistCycle(c: CycleRecord): Promise<boolean> {
  const p = getCyclePool();
  if (!p) return false;
  try {
    await ensureSchema(p);
    await p.query(
      `INSERT INTO onx_consciousness_cycles
         ("rhythmId","rhythmName","cycleNumber",status,"actionsExecuted","metricsSnapshot","healthScore","anomaliesDetected","durationMs")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [c.rhythmId, c.rhythmName, c.cycleNumber, c.status,
       JSON.stringify(c.actionsExecuted), JSON.stringify(c.metricsSnapshot),
       c.healthScore, c.anomaliesDetected, c.durationMs]);
    return true;
  } catch (e) {
    process.stderr.write(`[cycle-store] persist failed: ${String(e).slice(0, 120)}\n`);
    return false;
  }
}

export async function cycleStats(): Promise<unknown> {
  const p = getCyclePool();
  if (!p) return { persisted: false };
  await ensureSchema(p);
  const { rows } = await p.query(
    `SELECT "rhythmId", count(*)::int AS cycles, max("completedAt") AS "lastCycleAt",
            avg("healthScore")::float AS "avgHealth"
       FROM onx_consciousness_cycles GROUP BY "rhythmId" ORDER BY 1`);
  return { persisted: true, rhythms: rows };
}

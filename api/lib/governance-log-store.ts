// ============================================================
// GOVERNANCE DECISION LOG — PG persistence for constitutional
// guardian decisions (EV-P1-01 evidence trail). Previously these
// decisions lived only in stderr lines; now every blocked/allowed
// constitutional check is queryable. Fire-and-forget from the
// middleware — never blocks the request path.
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady = false;

function getPool(): Pool | null {
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

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS onx_governance_decisions (
      id SERIAL PRIMARY KEY,
      "auditId" TEXT,
      path TEXT,
      "userId" TEXT,
      role TEXT,
      "amanahScore" DOUBLE PRECISION,
      passed BOOLEAN,
      level TEXT,
      "shadowTrusted" BOOLEAN,
      "createdAt" TIMESTAMPTZ DEFAULT now());
    CREATE INDEX IF NOT EXISTS gov_decisions_path_idx ON onx_governance_decisions (path, "createdAt" DESC);
  `);
  schemaReady = true;
}

export interface GovernanceDecision {
  auditId: string;
  path: string;
  userId: string;
  role: string;
  amanahScore: number;
  passed: boolean;
  level: string;
  shadowTrusted: boolean;
}

/** Non-blocking persist — errors are observed, never thrown. */
export function recordGovernanceDecision(d: GovernanceDecision): void {
  const p = getPool();
  if (!p) return;
  void ensureSchema()
    .then(() =>
      p.query(
        `INSERT INTO onx_governance_decisions ("auditId",path,"userId",role,"amanahScore",passed,level,"shadowTrusted")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [d.auditId, d.path, d.userId, d.role, d.amanahScore, d.passed, d.level, d.shadowTrusted],
      ),
    )
    .catch((e) => process.stderr.write(`[gov-log] persist failed: ${String(e).slice(0, 120)}\n`));
}

export async function listGovernanceDecisions(limit = 50): Promise<unknown[]> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query(
    `SELECT * FROM onx_governance_decisions ORDER BY "createdAt" DESC LIMIT $1`, [limit]);
  return rows;
}

export async function governanceDecisionStats(): Promise<unknown> {
  const p = getPool();
  if (!p) return { persisted: false };
  await ensureSchema();
  const { rows } = await p.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT passed)::int AS blocked,
            count(*) FILTER (WHERE passed)::int AS allowed,
            max("createdAt") AS "lastDecisionAt"
       FROM onx_governance_decisions`);
  return { persisted: true, ...rows[0] };
}

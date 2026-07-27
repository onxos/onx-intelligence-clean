import { Pool, type QueryResult } from "pg";

export const DATABASE_READINESS_SQL = "SELECT 1 AS ok";

export type DatabaseReadinessState =
  | "READY"
  | "NOT_CONFIGURED"
  | "INVALID_CONFIGURATION"
  | "UNAVAILABLE";

export interface DatabaseReadinessResult {
  ready: boolean;
  state: DatabaseReadinessState;
  backend: "postgres" | "none";
  proof: "SELECT_1" | "NOT_EXECUTED";
  latencyMs: number;
  checkedAt: string;
}

type QueryExecutor = {
  query: (sql: string) => Promise<QueryResult>;
};

let readinessPool: Pool | null = null;
let readinessPoolConnectionString: string | null = null;

function createReadinessPool(connectionString: string): Pool {
  const isExternalHost = connectionString.includes("render.com");
  return new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 3_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

function getReadinessPool(connectionString: string): Pool {
  if (!readinessPool || readinessPoolConnectionString !== connectionString) {
    void readinessPool?.end().catch(() => undefined);
    readinessPool = createReadinessPool(connectionString);
    readinessPoolConnectionString = connectionString;
  }
  return readinessPool;
}

/**
 * Strict database-backed readiness proof.
 *
 * This does one read-only round trip (`SELECT 1`) and deliberately returns no
 * connection string, hostname, database name, SQL error, or other topology
 * metadata. HTTP/process liveness alone never makes this result READY.
 */
export async function probeDatabaseReadiness(options?: {
  connectionString?: string;
  executor?: QueryExecutor;
  now?: () => Date;
}): Promise<DatabaseReadinessResult> {
  const started = Date.now();
  const checkedAt = (options?.now?.() ?? new Date()).toISOString();
  const connectionString =
    options?.connectionString ?? process.env.DATABASE_URL ?? "";

  if (!connectionString) {
    return {
      ready: false,
      state: "NOT_CONFIGURED",
      backend: "none",
      proof: "NOT_EXECUTED",
      latencyMs: 0,
      checkedAt,
    };
  }

  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    return {
      ready: false,
      state: "INVALID_CONFIGURATION",
      backend: "none",
      proof: "NOT_EXECUTED",
      latencyMs: 0,
      checkedAt,
    };
  }

  const executor = options?.executor ?? getReadinessPool(connectionString);
  try {
    const result = await executor.query(DATABASE_READINESS_SQL);
    const ok = result.rows?.[0]?.ok === 1;
    return {
      ready: ok,
      state: ok ? "READY" : "UNAVAILABLE",
      backend: "postgres",
      proof: "SELECT_1",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  } catch {
    return {
      ready: false,
      state: "UNAVAILABLE",
      backend: "postgres",
      proof: "SELECT_1",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  }
}

export async function closeDatabaseReadinessPoolForTests(): Promise<void> {
  const pool = readinessPool;
  readinessPool = null;
  readinessPoolConnectionString = null;
  await pool?.end().catch(() => undefined);
}

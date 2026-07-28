import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let pool: Pool | null = null;
let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

// GAP-001 (ONX-FRR-2026-001): the intelligence-object subsystem was wired to a
// MySQL2/planetscale Drizzle driver while the live database is PostgreSQL, so
// every intelligence.* endpoint returned HTTP 500 (MySQL backtick SQL rejected
// by Postgres). This factory now speaks Postgres via node-postgres, matching
// the driver every other durable store in this service already uses.
export function getDb() {
  if (!instance) {
    const connectionString = env.databaseUrl;
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 4,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    instance = drizzle(pool, { schema: fullSchema });
  }
  return instance;
}

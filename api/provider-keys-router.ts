import { z } from "zod";
import { createRouter, protectedQuery, protectedPermissionProcedure } from "./middleware";
import { Pool } from "pg";

// M-11: writing/removing third-party provider secrets requires runtime:admin
// for human principals (bridge machines remain accepted server-to-server).
const adminKeysProcedure = protectedPermissionProcedure("runtime:admin");

/**
 * Provider Keys Vault — runtime-managed third-party API keys.
 *
 * Founder pastes a provider key ONCE (via this API now, via the ONX admin
 * UI next); every bridge capability (ElevenLabs voice, Gemini, future
 * providers) reads from this vault first, falling back to env vars.
 * Keys are stored in the intelligence PG (single-tenant founder infra,
 * bridge-secret-authed). Values are never returned by any read endpoint —
 * only existence/metadata.
 */
let pool: Pool | null = null;
let schemaReady = false;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({ connectionString, max: 2, ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}) });
  }
  if (!schemaReady) {
    schemaReady = true;
    void pool.query(
      `CREATE TABLE IF NOT EXISTS onx_provider_keys (
        provider TEXT PRIMARY KEY,
        key_value TEXT NOT NULL,
        label TEXT DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT now()
      )`,
    ).catch(() => undefined);
  }
  return pool;
}

/** Read a provider key: vault first, then env fallback. Used by bridge capabilities. */
export async function getProviderKey(provider: string, envVar?: string): Promise<string | null> {
  try {
    const res = await getPool().query("SELECT key_value FROM onx_provider_keys WHERE provider = $1", [provider]);
    const v = res.rows?.[0]?.key_value as string | undefined;
    if (v && v.length > 3) return v;
  } catch {
    /* vault unavailable — env fallback below */
  }
  if (envVar && process.env[envVar]) return process.env[envVar]!;
  return null;
}

export const providerKeysRouter = createRouter({
  set: adminKeysProcedure
    .input(z.object({
      provider: z.string().min(2).max(64),
      keyValue: z.string().min(4).max(4000),
      label: z.string().max(200).default(""),
    }))
    .mutation(async ({ input }) => {
      await getPool().query(
        `INSERT INTO onx_provider_keys (provider, key_value, label, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (provider) DO UPDATE SET key_value = $2, label = $3, updated_at = now()`,
        [input.provider, input.keyValue, input.label],
      );
      return { ok: true as const, provider: input.provider };
    }),

  /** Metadata only — key values are never exposed. */
  list: protectedQuery.query(async () => {
    try {
      const res = await getPool().query("SELECT provider, label, updated_at FROM onx_provider_keys ORDER BY provider");
      return { ok: true as const, keys: res.rows as Array<{ provider: string; label: string; updated_at: string }> };
    } catch {
      return { ok: true as const, keys: [] as Array<{ provider: string; label: string; updated_at: string }> };
    }
  }),

  remove: adminKeysProcedure
    .input(z.object({ provider: z.string().min(2).max(64) }))
    .mutation(async ({ input }) => {
      await getPool().query("DELETE FROM onx_provider_keys WHERE provider = $1", [input.provider]);
      return { ok: true as const };
    }),
});

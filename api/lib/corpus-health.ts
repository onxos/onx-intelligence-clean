// ============================================================
// CORPUS PERSISTENCE PROOF — durable-pg health probe
// ------------------------------------------------------------
// Answers ONE honest question at runtime: does the corpus adapter
// (iurg-pg-store.ts) REALLY persist to Postgres right now, on THIS
// process's DATABASE_URL?  It follows the fleet's proof pattern —
// report persistence=POSTGRES *only after* a real write→read→verify
// round-trip on the pg pool succeeds (never a text flag derived from
// the env string).
//
//   • mode is detected from the live store (getPersistenceStatus().mode).
//   • In "pg" mode it upserts a throwaway probe row, reads it back with a
//     targeted query, verifies the content-hash survived the JSONB
//     round-trip, then deletes the probe (leaves the corpus untouched).
//     Success ⇒ persistence:"POSTGRES", roundTrip:true.
//     Any failure ⇒ persistence:"MEMORY" (the in-memory mirror is what
//     actually holds data when pg is down — fail-honest, error captured).
//   • In "memory"/"mysql" mode it reports that mode honestly with
//     roundTrip:false and NO false POSTGRES claim.
//
// Numbers / mode / booleans / truncated error only — never corpus contents.
// Deterministic + side-effect-clean: the probe id is prefixed
// `corpus-health-probe-` and is always deleted in a finally block.
// ============================================================
import { getPersistenceStatus } from "./iurg-store";
import {
  pgUpsertObject,
  pgGetObjectsByIdPrefix,
  pgDeleteObjectsByIdPrefix,
} from "./iurg-pg-store";
import { contentHash } from "./corpus";
import type { IurgObjectInput } from "../iuc-engine";

/** Durability level we could actually PROVE this instant. */
export type CorpusPersistenceLevel = "POSTGRES" | "MYSQL" | "MEMORY";

export interface CorpusPersistenceProof {
  /** Proven durability level (POSTGRES only after a live pg round-trip). */
  persistence: CorpusPersistenceLevel;
  /** Store mode detected from the live adapter (env-derived). */
  mode: "pg" | "mysql" | "memory";
  /** True only when write→read→verify all succeeded on Postgres. */
  roundTrip: boolean;
  /** True when the probe row was read back with a matching content hash. */
  writtenBack: boolean;
  /** The probe id used for the round-trip (null when no pg write attempted). */
  probeId: string | null;
  /** Wall-clock latency of the pg round-trip in ms (null when not attempted). */
  latencyMs: number | null;
  /** ISO timestamp of the check. */
  checkedAt: string;
  /** Human-readable, non-sensitive summary. */
  note: string;
  /** Truncated pg error message when the round-trip failed. */
  error?: string;
}

const PROBE_PREFIX = "corpus-health-probe-";

/**
 * Run a live corpus persistence proof against the current DATABASE_URL.
 * Safe to call anywhere (boot, cron, a health endpoint) — it never throws
 * and always cleans up its probe row.
 */
export async function corpusPersistenceProof(): Promise<CorpusPersistenceProof> {
  const checkedAt = new Date().toISOString();
  const mode = getPersistenceStatus().mode;

  if (mode !== "pg") {
    const level: CorpusPersistenceLevel = mode === "mysql" ? "MYSQL" : "MEMORY";
    return {
      persistence: level,
      mode,
      roundTrip: false,
      writtenBack: false,
      probeId: null,
      latencyMs: null,
      checkedAt,
      note:
        mode === "memory"
          ? "No postgres DATABASE_URL configured — corpus is served from the in-memory mirror (ephemeral). Durable-pg is proven in CI."
          : "Store mode is mysql; the corpus pg adapter (postgres) is not the active durable path here.",
    };
  }

  // Live pg mode: prove a real read-after-write round-trip.
  const probeText = `corpus persistence probe ${checkedAt}`;
  const probeId = `${PROBE_PREFIX}${contentHash(probeText).slice(0, 24)}`;
  const expectedHash = contentHash(probeText);
  const probe: IurgObjectInput & { id: string } = {
    id: probeId,
    type: "PERCEPTION",
    verification: "POSSIBLE",
    contentText: probeText,
    provenance: {
      type: "SYNTHETIC",
      citation: "corpus-health-probe",
      sourceAuthority: "onx-corpus-health",
    },
    quality: 0,
    contentHash: expectedHash,
    domainTag: "OPERATIONS",
  };

  const started = Date.now();
  let writtenBack = false;
  let error: string | undefined;
  try {
    await pgUpsertObject(probe);
    const rows = await pgGetObjectsByIdPrefix(probeId);
    const hit = rows.find((r) => r.id === probeId);
    writtenBack = !!hit && hit.contentHash === expectedHash;
    const latencyMs = Date.now() - started;

    if (writtenBack) {
      return {
        persistence: "POSTGRES",
        mode,
        roundTrip: true,
        writtenBack: true,
        probeId,
        latencyMs,
        checkedAt,
        note: `Postgres read-after-write OK: probe upserted and read back with matching content hash in ${latencyMs}ms.`,
      };
    }
    error = hit
      ? "probe read back but content hash mismatch"
      : "probe not found on read-back";
  } catch (err) {
    error = (err as Error).message?.slice(0, 200) ?? "unknown pg error";
  } finally {
    // Never leave the probe behind, whatever happened.
    await pgDeleteObjectsByIdPrefix(PROBE_PREFIX).catch(() => {});
  }

  // pg mode but the round-trip did NOT prove durability — fail honest.
  return {
    persistence: "MEMORY",
    mode,
    roundTrip: false,
    writtenBack,
    probeId,
    latencyMs: Date.now() - started,
    checkedAt,
    note: "Postgres round-trip did NOT verify — corpus durability is unproven on this instance; the in-memory mirror is authoritative until pg recovers.",
    error,
  };
}

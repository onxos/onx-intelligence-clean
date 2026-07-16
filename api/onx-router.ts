// ============================================================
// ONX ROUTER — STE-V-01 unified self-verification endpoint +
// STE-K-03 truth ledger (the system remembers its truth).
// onx.selfVerify / truth.history: public reads (providers.status
// pattern) — honest reports, no secrets (keyPrefix only).
// truth.snapshot: behind the fail-closed bridge guard.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { buildSelfVerification } from "./lib/self-verify";
import { assertBridgeAccess } from "./bridge-guard";
import { getTruthHistory, recordTruthSnapshot, summarizeTruthLedger } from "./lib/truth-ledger";
import { getCorpusBridgeSurfaceProof, getIntentBridgeSurfaceProof } from "./lib/bridge-surface-proof";
import { getTitanBridgeStatusProof } from "./lib/bridge-runtime-proof";
import { computeBridgeSurfacesChecksum } from "./lib/bridge-surfaces-checksum";

export const onxRouter = createRouter({
  // STE-K-15: the honest self-audit now also surfaces a MEASURED
  // truth-ledger summary (latest fingerprint + drift flag + count),
  // read from the ledger — an empty ledger reports state:"EMPTY".
  selfVerify: publicQuery.query(async () => {
    const report = await buildSelfVerification();
    const truthLedgerSummary = await summarizeTruthLedger();
    return { ...report, truthLedgerSummary };
  }),

  bridgeSurfaces: publicQuery.query(async () => {
    const [corpusQuery, titanBridge] = await Promise.all([
      getCorpusBridgeSurfaceProof(),
      Promise.resolve(getTitanBridgeStatusProof()),
    ]);
    const intentEngine = getIntentBridgeSurfaceProof();
    const surfaces = [corpusQuery, intentEngine, titanBridge];
    const ready = surfaces.filter((s) => s.compatibility === "BRIDGE_READY").length;
    const guarded = surfaces.length - ready;
    // STE-P-289: the aggregate checksum is computed by the SHARED canonical
    // helper — the same function the live smoke contract uses to RECOMPUTE
    // it from the served parts, so a forged aggregate can never pass.
    const checksum = computeBridgeSurfacesChecksum(surfaces, ready, guarded);
    return {
      access: "PUBLIC_READ" as const,
      total: surfaces.length,
      ready,
      guarded,
      checksum,
      surfaces: {
        corpusQuery,
        intentEngine,
        titanBridge,
      },
    };
  }),

  // STE-K-03: append the CURRENT self-verification to the ledger.
  truthSnapshot: publicQuery.mutation(async ({ ctx }) => {
    assertBridgeAccess(ctx);
    return recordTruthSnapshot();
  }),

  // STE-K-03: last N snapshots with automatic drift flags — public
  // read, summary fields only (no secrets anywhere in the chain).
  truthHistory: publicQuery
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      return { rateLimit, ...(await getTruthHistory(input.limit)) };
    }),
});

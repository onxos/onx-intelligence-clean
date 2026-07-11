// ============================================================
// CODEX GUARD ROUTER — charter enforcement over tRPC (B1)
// - scan: run deviation rules over provided file contents
// - evaluateClaim: score a maturity claim against the OCMBR ledger
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  evaluateClaim,
  scanFiles,
  scanText,
} from "./lib/codex-guard";
import { MATURITY_STATES, type MaturityState } from "./lib/ocmbr-engine";
import { capabilityStatus, isSeeded, seed } from "./lib/ocmbr-store";

const zState = z.enum(MATURITY_STATES as unknown as [string, ...string[]]);

export const codexGuardRouter = createRouter({
  scanText: publicQuery
    .input(
      z.object({
        source: z.string(),
        filename: z.string().optional(),
        isProduction: z.boolean().optional(),
      }),
    )
    .query(({ input }) => scanText(input.source, input)),

  scan: publicQuery
    .input(
      z.object({
        files: z.array(
          z.object({ filename: z.string(), content: z.string() }),
        ),
      }),
    )
    .query(({ input }) => scanFiles(input.files)),

  // Evaluate a claim ("capability X is VERIFIED") against real OCMBR evidence.
  evaluateClaim: publicQuery
    .input(
      z.object({
        capabilityCode: z.string(),
        claimedState: zState,
      }),
    )
    .query(({ input }) => {
      if (!isSeeded()) seed();
      const status = capabilityStatus(input.capabilityCode);
      const actual = status ? status.state : null;
      return evaluateClaim(
        input.claimedState as MaturityState,
        actual as MaturityState | null,
      );
    }),
});

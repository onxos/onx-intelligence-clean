// ============================================================
// OCMBR ROUTER — the executive truth ledger over tRPC (B0)
//
// Every capability's maturity is COMPUTED from evidence (see
// api/lib/ocmbr-engine.ts), never declared. In-memory + deterministic,
// so it runs in CI with no DB / keys. Seeds the current project's real
// capabilities on first read so the ledger is never empty.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { EVIDENCE_KINDS, MATURITY_LABEL_AR } from "./lib/ocmbr-engine";
import {
  addCriterion,
  addUnit,
  capabilityStatus,
  isSeeded,
  listCriteria,
  listEvidence,
  listUnits,
  matrix,
  recordEvidence,
  registerCapability,
  seed,
  summary,
} from "./lib/ocmbr-store";

function ensureSeeded() {
  if (!isSeeded()) seed();
}

const zEvidenceKind = z.enum(
  EVIDENCE_KINDS as unknown as [string, ...string[]],
);

export const ocmbrRouter = createRouter({
  // The full maturity matrix — computed states for every capability.
  matrix: publicQuery.query(() => {
    ensureSeeded();
    return {
      labels: MATURITY_LABEL_AR,
      summary: summary(),
      capabilities: matrix(),
    };
  }),

  // Aggregate counts by state.
  summary: publicQuery.query(() => {
    ensureSeeded();
    return summary();
  }),

  // One capability's full dossier: units, criteria, evidence, state.
  capability: publicQuery
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      ensureSeeded();
      const status = capabilityStatus(input.code);
      if (!status) return { found: false as const };
      return {
        found: true as const,
        status,
        units: listUnits(input.code),
        criteria: listCriteria(input.code),
        evidence: listEvidence(input.code),
      };
    }),

  registerCapability: publicQuery
    .input(
      z.object({
        code: z.string().min(1),
        title: z.string().min(1),
        program: z.string().min(1),
        owner: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      ensureSeeded();
      return registerCapability(input);
    }),

  addUnit: publicQuery
    .input(
      z.object({
        capabilityCode: z.string().min(1),
        kind: z.enum(["code", "test", "doc", "demo", "runtime"]),
        path: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      ensureSeeded();
      return addUnit(input);
    }),

  addCriterion: publicQuery
    .input(
      z.object({
        capabilityCode: z.string().min(1),
        statement: z.string().min(1),
        verifyCommand: z.string().optional(),
        id: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      ensureSeeded();
      return addCriterion(input);
    }),

  recordEvidence: publicQuery
    .input(
      z.object({
        capabilityCode: z.string().min(1),
        kind: zEvidenceKind,
        criterionId: z.string().optional(),
        command: z.string().optional(),
        output: z.string().optional(),
        commit: z.string().optional(),
        date: z.string().optional(),
        verifier: z.string().optional(),
        passed: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      ensureSeeded();
      const record = recordEvidence({
        ...input,
        kind: input.kind as (typeof EVIDENCE_KINDS)[number],
      });
      // Return the freshly recomputed state so callers see the effect.
      return { record, status: capabilityStatus(input.capabilityCode) };
    }),

  // Force (re)seed of the current project's real capabilities.
  seed: publicQuery
    .input(z.object({ force: z.boolean().optional() }).optional())
    .mutation(({ input }) => seed(input?.force ?? false)),
});

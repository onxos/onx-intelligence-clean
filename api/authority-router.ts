// ============================================================
// AUTHORITY ROUTER — B3 constitution-as-runtime over tRPC
//
// Exposes the three fail-closed constitutional services as a single
// surface, built on the shared middleware (createRouter/publicQuery):
//   • Authority Gate — A0–A5 ladder + tamper-evident hash-chain audit.
//   • CCMR           — classify assets/decisions into root/constitution/
//                      owner/evidence.
//   • CEvP           — evaluate a proposed change for power preservation.
//
// State is the in-memory `authorityGate` singleton (deterministic, no DB /
// keys), following the ocmbr-router / ocmbr-store convention.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  AUTHORITY_LABEL_AR,
  AUTHORITY_LEVELS,
  authorityGate,
} from "./lib/authority-gate";
import { CCMR_LABEL_AR, classify, classifyMany } from "./lib/ccmr";
import { evaluateChange } from "./lib/cevp-guard";

const zLevel = z.enum(AUTHORITY_LEVELS as unknown as [string, ...string[]]);

const zAsset = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  text: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const zMeasure = z.object({
  capability: z.number(),
  coverage: z.number(),
  integrity: z.number(),
  reversibility: z.number(),
});

const zChange = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  before: zMeasure,
  after: zMeasure,
  proof: z
    .array(z.object({ kind: z.string(), ref: z.string() }))
    .optional(),
});

export const authorityRouter = createRouter({
  // --- Authority Gate ----------------------------------------------------

  /** Static description of the ladder (labels + auto-grant ceiling). */
  ladder: publicQuery.query(() => ({
    levels: AUTHORITY_LEVELS,
    labels: AUTHORITY_LABEL_AR,
    autoGrantCeiling: "A2" as const,
  })),

  /** Evaluate an authority request and append the decision to the chain. */
  requestAuthority: publicQuery
    .input(
      z.object({
        requestId: z.string().optional(),
        subject: z.string().min(1),
        action: z.string().min(1),
        requested: zLevel,
        ownerApproval: z
          .object({ approver: z.string(), grantedLevel: zLevel })
          .nullish(),
      }),
    )
    .mutation(({ input }) => {
      const record = authorityGate.request({
        requestId: input.requestId,
        subject: input.subject,
        action: input.action,
        requested: input.requested as (typeof AUTHORITY_LEVELS)[number],
        ownerApproval: input.ownerApproval
          ? {
              approver: input.ownerApproval.approver,
              grantedLevel: input.ownerApproval
                .grantedLevel as (typeof AUTHORITY_LEVELS)[number],
            }
          : null,
      });
      return record;
    }),

  /** The full audit chain plus a live integrity verdict. */
  chain: publicQuery.query(() => {
    const records = authorityGate.exportChain();
    return {
      length: records.length,
      verification: authorityGate.verifyChain(records),
      records,
    };
  }),

  /** Verify the chain's integrity (tamper detection). */
  verify: publicQuery.query(() => authorityGate.verifyChain()),

  // --- CCMR --------------------------------------------------------------

  classify: publicQuery
    .input(z.object({ asset: zAsset }))
    .query(({ input }) => classify(input.asset)),

  classifyMany: publicQuery
    .input(z.object({ assets: z.array(zAsset) }))
    .query(({ input }) => ({
      labels: CCMR_LABEL_AR,
      classifications: classifyMany(input.assets),
    })),

  // --- CEvP --------------------------------------------------------------

  evaluateChange: publicQuery
    .input(z.object({ change: zChange }))
    .query(({ input }) => evaluateChange(input.change)),

  // --- Combined governance decision -------------------------------------

  /**
   * One constitutional pass over a proposed action: classify it (CCMR),
   * check it preserves power (CEvP), and gate its authority (A0–A5, logged).
   * Authority is only recorded as requested when CEvP accepts — a contracting
   * change is denied before it can escalate (fail-closed composition).
   */
  govern: publicQuery
    .input(
      z.object({
        asset: zAsset,
        change: zChange,
        request: z.object({
          subject: z.string().min(1),
          action: z.string().min(1),
          requested: zLevel,
          ownerApproval: z
            .object({ approver: z.string(), grantedLevel: zLevel })
            .nullish(),
        }),
      }),
    )
    .mutation(({ input }) => {
      const classification = classify(input.asset);
      const evaluation = evaluateChange(input.change);

      // If the change contracts power, refuse the escalation outright: gate
      // the request at A0 (observe only) so nothing above A2 can slip through.
      const gated =
        evaluation.decision === "ACCEPT"
          ? {
              subject: input.request.subject,
              action: input.request.action,
              requested: input.request
                .requested as (typeof AUTHORITY_LEVELS)[number],
              ownerApproval: input.request.ownerApproval
                ? {
                    approver: input.request.ownerApproval.approver,
                    grantedLevel: input.request.ownerApproval
                      .grantedLevel as (typeof AUTHORITY_LEVELS)[number],
                  }
                : null,
            }
          : {
              subject: input.request.subject,
              action: input.request.action,
              requested: "A0" as (typeof AUTHORITY_LEVELS)[number],
              ownerApproval: null,
            };

      const record = authorityGate.request(gated);

      return {
        classification,
        evaluation,
        authority: record,
        approved:
          evaluation.decision === "ACCEPT" && record.decision === "GRANTED",
      };
    }),
});

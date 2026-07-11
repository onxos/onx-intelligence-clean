// ============================================================
// CAPABILITY FACTORY ROUTER — the governed capability loop over tRPC (B2-γ)
//
// Surfaces the factory's closed loop: PROPOSE a capability (→ OCMBR
// DOCUMENTED), GENERATE it (fail-closed without an explicit A2 approval,
// then guard → independent verify → promote), and read STATUS.
//
// The generation surface uses the deterministic keyless mock executor and
// the default independent-verification gate — no keys, reproducible in CI.
// Follows the methods-library-router / orchestrator-router pattern.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  authorizeGeneration,
  generateCapability,
  proposeCapability,
} from "./lib/capability-factory";
import { capabilityStatus } from "./lib/ocmbr-store";

const zLevel = z.enum(["A0", "A1", "A2", "A3", "A4", "A5"]);

const zApproval = z
  .object({
    approver: z.string(),
    grantedLevel: zLevel,
  })
  .nullable()
  .optional();

const zProposal = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  program: z.string().min(1),
  rationale: z.string().min(1),
  acceptance: z.array(z.string().min(1)),
  owner: z.string().optional(),
});

export const capabilityFactoryRouter = createRouter({
  // Register a proposed capability in OCMBR as DOCUMENTED (DOC evidence only).
  propose: publicQuery
    .input(zProposal)
    .mutation(({ input }) => proposeCapability(input)),

  // Pure authority check — fail-closed without an explicit A2 approval.
  authorize: publicQuery
    .input(z.object({ code: z.string().min(1), approval: zApproval }))
    .query(({ input }) =>
      authorizeGeneration({
        capabilityCode: input.code,
        approval: input.approval ?? null,
      }),
    ),

  // Run the governed generation cycle with the deterministic mock executor.
  generate: publicQuery
    .input(z.object({ code: z.string().min(1), approval: zApproval }))
    .mutation(({ input }) =>
      generateCapability({ code: input.code, approval: input.approval ?? null }),
    ),

  // Read the OCMBR-computed maturity for a capability — fail-closed on unknown.
  status: publicQuery
    .input(z.object({ code: z.string().min(1) }))
    .query(({ input }) => {
      const status = capabilityStatus(input.code);
      if (!status) return { found: false as const };
      return {
        found: true as const,
        state: status.state,
        labelAr: status.labelAr,
        reason: status.reason,
        evidenceCount: status.evidenceCount,
        criteriaCount: status.criteriaCount,
      };
    }),
});

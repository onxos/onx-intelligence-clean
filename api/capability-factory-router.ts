// ============================================================
// CAPABILITY FACTORY ROUTER — governed self-extension over tRPC (B2-γ)
//
// Exposes the founder's Capability Factory: propose a capability, register
// it as DOCUMENTED, then run the GOVERNED generation cycle — fail-CLOSED
// behind the real B3 AuthorityGate (no owner approval ⇒ DENIED, nothing
// generated). Generation → codex-guard (B1) → independent verification
// (B2-α) → OCMBR graduation (B0), with a reasoned decision log.
//
// In-memory + deterministic (the mock executor needs no keys), so it runs
// in CI with no DB / secrets. Follows the orchestrator-router pattern.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { AUTHORITY_LEVELS, type OwnerApproval } from "./lib/authority-gate";
import { governanceInvariant } from "./lib/capability-factory";
import {
  generateCapability,
  listDecisions,
  proposeAndRegister,
  capabilityState,
} from "./lib/capability-factory-store";

const zAuthorityLevel = z.enum(
  AUTHORITY_LEVELS as unknown as [string, ...string[]],
);

const zOwnerApproval = z
  .object({
    approver: z.string().min(1),
    grantedLevel: zAuthorityLevel,
  })
  .nullish();

const zProposal = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  program: z.string().min(1).optional(),
  rationale: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  owner: z.string().min(1).optional(),
});

export const capabilityFactoryRouter = createRouter({
  // The governance invariant: proof that autonomy is capped at A2.
  governance: publicQuery.query(() => governanceInvariant()),

  // Step 1–2: propose a capability and register it as DOCUMENTED only.
  propose: publicQuery.input(zProposal).mutation(({ input }) => {
    return proposeAndRegister(input);
  }),

  // The full governed cycle. Without a valid owner approval this is DENIED
  // and nothing is generated (fail-closed) — the capability stays DOCUMENTED.
  generate: publicQuery
    .input(
      z.object({
        proposal: zProposal,
        ownerApproval: zOwnerApproval,
      }),
    )
    .mutation(({ input }) => {
      return generateCapability(
        input.proposal,
        (input.ownerApproval ?? null) as OwnerApproval | null,
      );
    }),

  // The current OCMBR-computed state of a capability (honest source of truth).
  status: publicQuery
    .input(z.object({ code: z.string().min(1) }))
    .query(({ input }) => {
      const status = capabilityState(input.code);
      return status
        ? { found: true as const, status }
        : { found: false as const };
    }),

  // The reasoned decision log (why GRANTED/DENIED, what evidence).
  decisions: publicQuery
    .input(z.object({ code: z.string().min(1).optional() }).optional())
    .query(({ input }) => listDecisions(input?.code)),
});

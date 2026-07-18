// ============================================================
// TITAN DECISION ROUTER (Phase P) — operational Titan surface
//
// Exposes the DURABLE, DETERMINISTIC Titan Decision Engine as public
// rate-limited surfaces (same convention as ask.onx / corpusQuery):
//   titanDecision.decide         → ground + authorize + persist a decision
//   titanDecision.history        → durable read-back of decisions
//   titanDecision.accuracy       → evaluation metric from outcomes
//   titanDecision.recordOutcome  → outcome feedback (CONFIRMED/REJECTED)
//   titanDecision.registry       → the 5 titan identities (no secrets)
//
// This is the operational replacement for the prompt-only GPT-4o
// callTitan path: no LLM key required, fully live-provable.
// Authorization is enforced INSIDE the engine (AuthorityGate): a
// decision above the autonomy ceiling is REQUIRES_APPROVAL and is
// never auto-executed (fail-closed).
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { decideTitan, TitanEngineError } from "./lib/titan-engine";
import { TRPCError } from "@trpc/server";
import { TITAN_REGISTRY, TITAN_IDS } from "./lib/titan-registry";
import {
  recordTitanDecision,
  getTitanDecisions,
  getTitanAccuracy,
  recordTitanOutcome,
} from "./lib/titan-decision-store";

export const titanDecisionRouter = createRouter({
  registry: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      titans: TITAN_IDS.map((id) => {
        const t = TITAN_REGISTRY[id];
        return {
          id: t.id,
          name: t.name,
          nameAr: t.nameAr,
          domain: t.domain,
          actionAuthority: t.actionAuthority,
          hasVeto: t.hasVeto,
        };
      }),
    };
  }),

  decide: publicQuery
    .input(
      z.object({
        titanId: z.string().min(1).max(32),
        subject: z.string().min(1).max(500),
        query: z.string().min(1).max(2000),
        topK: z.number().min(1).max(20).default(5),
        domain: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await decideTitan({
          titanId: input.titanId,
          subject: input.subject,
          query: input.query,
          topK: input.topK,
          domain: input.domain,
        });
      } catch (e) {
        if (e instanceof TitanEngineError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordTitanDecision(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        decision: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        titanId: z.string().min(1).max(32).optional(),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getTitanDecisions({
        titanId: input.titanId,
        limit: input.limit,
      });
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(z.object({ titanId: z.string().min(1).max(32).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getTitanAccuracy(input.titanId);
      return { access: "PUBLIC_READ" as const, rateLimit, ...metric };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["CONFIRMED", "REJECTED"]),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordTitanOutcome(input.id, input.outcome, input.note);
      if (!result.found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `TITAN_DECISION_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        decision: result.decision,
      };
    }),
});

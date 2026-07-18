import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { D15ProofError, verifyD15 } from "./lib/d15-proof-engine";
import {
  getD15Accuracy,
  getD15History,
  isD15PersistenceConfigured,
  recordD15Outcome,
  recordD15Verification,
} from "./lib/d15-proof-store";

export const d15ProofRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isD15PersistenceConfigured(),
      capabilities: [
        "durable-state",
        "corpus-tool",
        "memory-history",
        "authority-gate",
        "evaluation",
        "outcome-feedback",
      ],
    };
  }),

  verify: publicQuery
    .input(
      z.object({
        suiteId: z.string().trim().min(1).max(120),
        mode: z.enum(["CRITERIA", "CONTRADICTION", "STRESS", "FAULT"]).default("CRITERIA"),
        target: z.string().trim().min(1).max(2000),
        stressLevel: z.number().min(0).max(10).default(3),
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await verifyD15(input);
      } catch (e) {
        if (e instanceof D15ProofError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordD15Verification(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        verification: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        mode: z.enum(["CRITERIA", "CONTRADICTION", "STRESS", "FAULT"]).optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getD15History(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z
        .object({
          mode: z.enum(["CRITERIA", "CONTRADICTION", "STRESS", "FAULT"]).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getD15Accuracy(input.mode);
      return { access: "PUBLIC_READ" as const, rateLimit, ...metric };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["CONFIRMED", "REJECTED", "DEFERRED"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordD15Outcome(input.id, input.outcome, input.note);
      if (!result.found || !result.verification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `D15_PROOF_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        verification: result.verification,
      };
    }),
});

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import {
  adviseFounder,
  FounderCompanionError,
} from "./lib/founder-companion-engine";
import {
  getFounderAccuracy,
  getFounderAdviceHistory,
  isFounderPersistenceConfigured,
  recordFounderAdvice,
  recordFounderOutcome,
} from "./lib/founder-companion-store";

export const founderCompanionRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isFounderPersistenceConfigured(),
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

  advise: publicQuery
    .input(
      z.object({
        prompt: z.string().min(1).max(2000),
        impact: z.enum(["OPERATIONAL", "EXECUTIVE", "STRATEGIC"]).default("STRATEGIC"),
        topK: z.number().min(1).max(20).default(5),
        domain: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await adviseFounder(input);
      } catch (e) {
        if (e instanceof FounderCompanionError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordFounderAdvice(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        advice: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        impact: z.enum(["OPERATIONAL", "EXECUTIVE", "STRATEGIC"]).optional(),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getFounderAdviceHistory(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z.object({
        impact: z.enum(["OPERATIONAL", "EXECUTIVE", "STRATEGIC"]).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getFounderAccuracy(input.impact);
      return { access: "PUBLIC_READ" as const, rateLimit, ...metric };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["APPLIED", "REJECTED", "DEFERRED"]),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordFounderOutcome(input.id, input.outcome, input.note);
      if (!result.found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `FOUNDER_ADVICE_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        advice: result.advice,
      };
    }),
});


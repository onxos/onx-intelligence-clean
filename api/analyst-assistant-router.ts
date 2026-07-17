import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { AnalystAssistantError, analyzeInsight } from "./lib/analyst-assistant-engine";
import {
  getAnalystAccuracy,
  getAnalystHistory,
  isAnalystPersistenceConfigured,
  recordAnalystInsight,
  recordAnalystOutcome,
} from "./lib/analyst-assistant-store";

export const analystAssistantRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isAnalystPersistenceConfigured(),
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

  analyze: publicQuery
    .input(
      z.object({
        question: z.string().min(1).max(2000),
        domain: z.enum(["BUSINESS", "FINANCE", "OPERATIONS", "RISK"]).default("BUSINESS"),
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await analyzeInsight(input);
      } catch (e) {
        if (e instanceof AnalystAssistantError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordAnalystInsight(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        insight: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        domain: z.enum(["BUSINESS", "FINANCE", "OPERATIONS", "RISK"]).optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getAnalystHistory(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z.object({
        domain: z.enum(["BUSINESS", "FINANCE", "OPERATIONS", "RISK"]).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getAnalystAccuracy(input.domain);
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
      const result = await recordAnalystOutcome(input.id, input.outcome, input.note);
      if (!result.found || !result.insight) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `ANALYST_INSIGHT_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        insight: result.insight,
      };
    }),
});


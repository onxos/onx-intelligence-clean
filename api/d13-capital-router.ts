import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { D13CapitalError, capitalizeD13 } from "./lib/d13-capital-engine";
import {
  getD13Accuracy,
  getD13History,
  isD13PersistenceConfigured,
  recordD13Capital,
  recordD13Outcome,
} from "./lib/d13-capital-store";

export const d13CapitalRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isD13PersistenceConfigured(),
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

  capitalize: publicQuery
    .input(
      z.object({
        signalId: z.string().trim().min(1).max(200),
        amount: z.number().positive().max(1000000),
        category: z
          .enum(["WISDOM", "JUDGMENT", "UNDERSTANDING", "PATTERN", "PROCESS"])
          .default("WISDOM"),
        rationale: z.string().trim().min(1).max(3000),
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await capitalizeD13(input);
      } catch (e) {
        if (e instanceof D13CapitalError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordD13Capital(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        capital: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        category: z
          .enum(["WISDOM", "JUDGMENT", "UNDERSTANDING", "PATTERN", "PROCESS"])
          .optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getD13History(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z
        .object({
          category: z
            .enum(["WISDOM", "JUDGMENT", "UNDERSTANDING", "PATTERN", "PROCESS"])
            .optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getD13Accuracy(input.category);
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
      const result = await recordD13Outcome(input.id, input.outcome, input.note);
      if (!result.found || !result.record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `D13_CAPITAL_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        capital: result.record,
      };
    }),
});


import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { D14CoordinationError, coordinateD14 } from "./lib/d14-coordination-engine";
import {
  getD14Accuracy,
  getD14History,
  isD14PersistenceConfigured,
  recordD14Coordination,
  recordD14Outcome,
} from "./lib/d14-coordination-store";

export const d14CoordinationRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isD14PersistenceConfigured(),
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

  coordinate: publicQuery
    .input(
      z.object({
        topic: z.string().trim().min(1).max(2000),
        context: z
          .enum(["FOUNDER", "CLINIC", "PERSONAL", "BUILDER", "OPERATOR", "ANALYST", "PLATFORM"])
          .default("PLATFORM"),
        route: z
          .enum([
            "L1_FOUNDER",
            "L2_SIL",
            "L3_COMPANION",
            "L4_PARTNER",
            "L5_REALITY",
            "L6_PROCESS",
            "L7_EXTERNAL",
            "L8_GENERAL",
          ])
          .default("L6_PROCESS"),
        conflictLevel: z.number().min(0).max(10).default(3),
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await coordinateD14(input);
      } catch (e) {
        if (e instanceof D14CoordinationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordD14Coordination(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        coordination: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        context: z
          .enum(["FOUNDER", "CLINIC", "PERSONAL", "BUILDER", "OPERATOR", "ANALYST", "PLATFORM"])
          .optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getD14History(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z
        .object({
          context: z
            .enum(["FOUNDER", "CLINIC", "PERSONAL", "BUILDER", "OPERATOR", "ANALYST", "PLATFORM"])
            .optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getD14Accuracy(input.context);
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
      const result = await recordD14Outcome(input.id, input.outcome, input.note);
      if (!result.found || !result.decision) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `D14_COORDINATION_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        coordination: result.decision,
      };
    }),
});

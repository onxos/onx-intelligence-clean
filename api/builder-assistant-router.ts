import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { BuilderAssistantError, planBuilder } from "./lib/builder-assistant-engine";
import {
  getBuilderAccuracy,
  getBuilderHistory,
  isBuilderPersistenceConfigured,
  recordBuilderOutcome,
  recordBuilderPlan,
} from "./lib/builder-assistant-store";

export const builderAssistantRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isBuilderPersistenceConfigured(),
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

  plan: publicQuery
    .input(
      z.object({
        task: z.string().min(1).max(2000),
        scope: z.enum(["FEATURE", "ARCHITECTURE", "REFACTOR", "DELIVERY"]).default("FEATURE"),
        topK: z.number().int().min(1).max(20).default(5),
        domain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await planBuilder(input);
      } catch (e) {
        if (e instanceof BuilderAssistantError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordBuilderPlan(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        plan: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        scope: z.enum(["FEATURE", "ARCHITECTURE", "REFACTOR", "DELIVERY"]).optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getBuilderHistory(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z.object({
        scope: z.enum(["FEATURE", "ARCHITECTURE", "REFACTOR", "DELIVERY"]).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getBuilderAccuracy(input.scope);
      return { access: "PUBLIC_READ" as const, rateLimit, ...metric };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["SHIPPED", "ROLLED_BACK", "DEFERRED"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordBuilderOutcome(input.id, input.outcome, input.note);
      if (!result.found || !result.plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `BUILDER_PLAN_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        plan: result.plan,
      };
    }),
});

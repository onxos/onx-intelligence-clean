import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import {
  PersonalAssistantError,
  planPersonal,
} from "./lib/personal-assistant-engine";
import {
  getPersonalAccuracy,
  getPersonalHistory,
  isPersonalPersistenceConfigured,
  recordPersonalOutcome,
  recordPersonalPlan,
} from "./lib/personal-assistant-store";

export const personalAssistantRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isPersonalPersistenceConfigured(),
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
        request: z.string().min(1).max(2000),
        context: z.enum(["PERSONAL", "WELLNESS", "PRODUCTIVITY", "FINANCE"]).default("PERSONAL"),
        topK: z.number().min(1).max(20).default(5),
        domain: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await planPersonal(input);
      } catch (e) {
        if (e instanceof PersonalAssistantError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordPersonalPlan(draft);
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
        context: z.enum(["PERSONAL", "WELLNESS", "PRODUCTIVITY", "FINANCE"]).optional(),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getPersonalHistory(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z.object({
        context: z.enum(["PERSONAL", "WELLNESS", "PRODUCTIVITY", "FINANCE"]).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getPersonalAccuracy(input.context);
      return { access: "PUBLIC_READ" as const, rateLimit, ...metric };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["COMPLETED", "ABANDONED", "DEFERRED"]),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordPersonalOutcome(input.id, input.outcome, input.note);
      if (!result.found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `PERSONAL_PLAN_NOT_FOUND: ${input.id}`,
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


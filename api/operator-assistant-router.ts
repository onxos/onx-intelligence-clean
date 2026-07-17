import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { OperatorAssistantError, actOperator } from "./lib/operator-assistant-engine";
import {
  getOperatorAccuracy,
  getOperatorHistory,
  isOperatorPersistenceConfigured,
  recordOperatorAction,
  recordOperatorOutcome,
} from "./lib/operator-assistant-store";

export const operatorAssistantRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isOperatorPersistenceConfigured(),
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

  act: publicQuery
    .input(
      z.object({
        incident: z.string().min(1).max(2000),
        domain: z.enum(["INCIDENT", "RELIABILITY", "SECURITY", "COST"]).default("INCIDENT"),
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await actOperator(input);
      } catch (e) {
        if (e instanceof OperatorAssistantError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordOperatorAction(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        action: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        domain: z.enum(["INCIDENT", "RELIABILITY", "SECURITY", "COST"]).optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getOperatorHistory(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(
      z.object({
        domain: z.enum(["INCIDENT", "RELIABILITY", "SECURITY", "COST"]).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getOperatorAccuracy(input.domain);
      return { access: "PUBLIC_READ" as const, rateLimit, ...metric };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["MITIGATED", "ESCALATED", "DEFERRED"]),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordOperatorOutcome(input.id, input.outcome, input.note);
      if (!result.found || !result.action) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `OPERATOR_ACTION_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        action: result.action,
      };
    }),
});


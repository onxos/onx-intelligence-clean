import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { D12LearningError, transitionD12 } from "./lib/d12-learning-engine";
import {
  getD12Accuracy,
  getD12History,
  isD12PersistenceConfigured,
  recordD12Outcome,
  recordD12Transition,
} from "./lib/d12-learning-store";

const D12_STATE = [
  "RAW",
  "VALIDATED",
  "PATTERN",
  "UNDERSTANDING",
  "JUDGMENT",
  "WISDOM",
  "CAPITALIZED",
  "DECAYING",
  "CORRECTING",
  "ARCHIVED",
] as const;

const D12_TRIGGER = [
  "PROVENANCE_GROUNDED",
  "PATTERN_DETECTED",
  "UNDERSTANDING_LADDER",
  "CONSTITUTIONAL_VALIDATION",
  "WISDOM_MATURATION",
  "CAPITALIZATION",
  "AMANAH_DECAY",
  "CORRECTION_APPLIED",
  "UNLEARN",
] as const;

export const d12LearningRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isD12PersistenceConfigured(),
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

  transition: publicQuery
    .input(
      z.object({
        objectId: z.string().trim().min(1).max(200),
        fromState: z.enum(D12_STATE),
        toState: z.enum(D12_STATE),
        trigger: z.enum(D12_TRIGGER),
        rationale: z.string().trim().min(1).max(3000),
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await transitionD12(input);
      } catch (e) {
        if (e instanceof D12LearningError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordD12Transition(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        transition: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        objectId: z.string().trim().min(1).max(200).optional(),
        toState: z.enum(D12_STATE).optional(),
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getD12History(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery
    .input(z.object({ toState: z.enum(D12_STATE).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getD12Accuracy(input.toState);
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
      const result = await recordD12Outcome(input.id, input.outcome, input.note);
      if (!result.found || !result.transition) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `D12_TRANSITION_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        transition: result.transition,
      };
    }),
});


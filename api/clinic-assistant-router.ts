import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import {
  ClinicAssistantError,
  assessClinicCase,
} from "./lib/clinic-assistant-engine";
import {
  getClinicAccuracy,
  getClinicAssessments,
  isClinicPersistenceConfigured,
  recordClinicAssessment,
  recordClinicOutcome,
} from "./lib/clinic-assistant-store";

export const clinicAssistantRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isClinicPersistenceConfigured(),
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

  assess: publicQuery
    .input(
      z.object({
        species: z.string().min(1).max(64),
        chiefComplaint: z.string().min(1).max(1000),
        symptoms: z.array(z.string().min(1).max(200)).min(1).max(20),
        topK: z.number().min(1).max(20).default(5),
        domain: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await assessClinicCase(input);
      } catch (e) {
        if (e instanceof ClinicAssistantError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordClinicAssessment(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        assessment: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        species: z.string().min(1).max(64).optional(),
        limit: z.number().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getClinicAssessments(input);
      return {
        access: "PUBLIC_READ" as const,
        rateLimit,
        ...result,
      };
    }),

  accuracy: publicQuery
    .input(z.object({ species: z.string().min(1).max(64).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const metric = await getClinicAccuracy(input.species);
      return {
        access: "PUBLIC_READ" as const,
        rateLimit,
        ...metric,
      };
    }),

  recordOutcome: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        outcome: z.enum(["IMPROVED", "NOT_IMPROVED", "REFERRED"]),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await recordClinicOutcome(input.id, input.outcome, input.note);
      if (!result.found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `CLINIC_ASSESSMENT_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        assessment: result.assessment,
      };
    }),
});


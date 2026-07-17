// ============================================================
// ALLOCATION ROUTER — D13.5 (M6) — MED v2.0 §3
// Exposes the allocation engine: APS, P1-P7 priorities, 5 modes,
// and detection of the 7 failure patterns. Pure / CI-safe.
// ============================================================
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import {
  APS_DIMENSIONS,
  PRIORITIES,
  ALLOCATION_MODES,
  FAILURE_PATTERNS,
  ECONOMIC_LAWS,
  ALLOCATION_OBJECTIVES,
  TRANSFER_PATHS,
  computeAPS,
  resolvePriority,
  selectMode,
  detectFailures,
  allocate,
  type PriorityId,
} from "./allocation-engine";
import {
  ALLOCATION_RELEVANCE_THRESHOLD,
  decideDurableAllocation,
  AllocationDurableError,
} from "./lib/allocation-durable-engine";
import {
  getAllocationAccuracy,
  getAllocationHistory,
  isAllocationPersistenceConfigured,
  recordAllocationDecision,
  recordAllocationOutcome,
} from "./lib/allocation-durable-store";

const zApsScores = z.object({
  FI: z.number().optional(),
  CS: z.number().optional(),
  FA: z.number().optional(),
  CM: z.number().optional(),
  RC: z.number().optional(),
  WL: z.number().optional(),
});

const PRIORITY_IDS = PRIORITIES.map((p) => p.id) as unknown as [PriorityId, ...PriorityId[]];
const zPriorities = z.array(z.enum(PRIORITY_IDS));

const zSignals = z.object({
  continuityRisk: z.boolean().optional(),
  provenHighValue: z.boolean().optional(),
  newOpportunity: z.boolean().optional(),
  crossDomainNeed: z.boolean().optional(),
  transformationReady: z.boolean().optional(),
});

const zState = z.object({
  preservationRatio: z.number().optional(),
  expansionRatio: z.number().optional(),
  numAllocations: z.number().optional(),
  maxDomainShare: z.number().optional(),
  driftFromIntent: z.number().optional(),
  churnRate: z.number().optional(),
  claimedCompounding: z.boolean().optional(),
  momentum: z.number().optional(),
  actionRate: z.number().optional(),
});

const zRequest = z.object({
  apsScores: zApsScores,
  priorities: zPriorities,
  signals: zSignals,
  state: zState,
});

export const allocationRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    return {
      access: "PUBLIC_READ" as const,
      rateLimit,
      persistenceConfigured: isAllocationPersistenceConfigured(),
      relevanceThreshold: ALLOCATION_RELEVANCE_THRESHOLD,
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

  dimensions: publicQuery.query(() => ({ dimensions: APS_DIMENSIONS })),
  computeAPS: publicQuery.input(zApsScores).query(({ input }) => ({ aps: computeAPS(input) })),

  priorities: publicQuery.query(() => ({ priorities: PRIORITIES })),
  resolvePriority: publicQuery.input(z.object({ applicable: zPriorities }))
    .query(({ input }) => ({ winner: resolvePriority(input.applicable) })),

  modes: publicQuery.query(() => ({ modes: ALLOCATION_MODES })),
  selectMode: publicQuery.input(zSignals).query(({ input }) => ({ mode: selectMode(input) })),

  failurePatterns: publicQuery.query(() => ({ patterns: FAILURE_PATTERNS })),
  detectFailures: publicQuery.input(zState).query(({ input }) => ({ failures: detectFailures(input) })),

  reference: publicQuery.query(() => ({
    economicLaws: ECONOMIC_LAWS,
    objectives: ALLOCATION_OBJECTIVES,
    transferPaths: TRANSFER_PATHS,
  })),

  allocate: publicQuery.input(zRequest).query(({ input }) => allocate(input)),

  decide: publicQuery
    .input(
      z.object({
        question: z.string().min(1).max(2000),
        request: zRequest,
        topK: z.number().int().min(1).max(20).default(5),
        corpusDomain: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      let draft;
      try {
        draft = await decideDurableAllocation(input);
      } catch (e) {
        if (e instanceof AllocationDurableError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
      const stored = await recordAllocationDecision(draft);
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: stored.persistence,
        decision: {
          id: stored.id,
          ...draft,
          outcome: "PENDING" as const,
        },
      };
    }),

  history: publicQuery
    .input(
      z.object({
        limit: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      const result = await getAllocationHistory(input);
      return { access: "PUBLIC_READ" as const, rateLimit, ...result };
    }),

  accuracy: publicQuery.query(async ({ ctx }) => {
    const rateLimit = await enforceRateLimit(ctx);
    const metric = await getAllocationAccuracy();
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
      const result = await recordAllocationOutcome(input.id, input.outcome, input.note);
      if (!result.found || !result.decision) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `ALLOCATION_DECISION_NOT_FOUND: ${input.id}`,
        });
      }
      return {
        access: "PUBLIC_WRITE" as const,
        rateLimit,
        persistence: result.persistence,
        decision: result.decision,
      };
    }),
});

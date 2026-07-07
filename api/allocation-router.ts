// ============================================================
// ALLOCATION ROUTER — D13.5 (M6) — MED v2.0 §3
// Exposes the allocation engine: APS, P1-P7 priorities, 5 modes,
// and detection of the 7 failure patterns. Pure / CI-safe.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
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

export const allocationRouter = createRouter({
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

  allocate: publicQuery
    .input(z.object({ apsScores: zApsScores, priorities: zPriorities, signals: zSignals, state: zState }))
    .query(({ input }) => allocate(input)),
});

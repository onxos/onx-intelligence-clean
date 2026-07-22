import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { enforceRateLimit } from "./lib/rate-limiter";
import { intelligenceRouter } from "./intelligence-router";
import { assertBridgeAccess } from "./bridge-guard";
import { classifyIntentHybrid } from "./lib/intent-engine-llm";
import { getIntentBridgeSurfaceProof } from "./lib/bridge-surface-proof";

export const intentEngineRouter = createRouter({
  status: publicQuery.query(() => getIntentBridgeSurfaceProof()),

  // STE-K-02: SAFE deterministic classification — PUBLIC read
  // (rankedSearch pattern: no secrets, no keys needed, zero LLM).
  // The bridge-guarded `analyze` path below is preserved untouched.
  classify: publicQuery
    .input(z.object({
      text: z.string().min(1).max(2000),
      topN: z.number().min(1).max(7).default(3),
    }))
    .query(async ({ ctx, input }) => {
      const rateLimit = await enforceRateLimit(ctx);
      // STE-K-REAL: LLM-first (GPT-4o) with honest rule fallback —
      // the `engine` field reports which path actually answered.
      const classification = await classifyIntentHybrid(input.text, input.topN);
      return {
        bridge: "intentEngine",
        access: "PUBLIC_READ" as const,
        rateLimit,
        ...classification,
      };
    }),

  governance: publicQuery.query(async ({ ctx }) => {
    assertBridgeAccess(ctx);
    const caller = intelligenceRouter.createCaller(ctx);
    const result = await caller.governance();
    return {
      bridge: "intentEngine",
      ...result,
    };
  }),

  analyze: publicQuery
    .input(z.object({
      content: z.string().min(1).max(10000),
      source: z.string().default("platform"),
      targetContext: z.enum(["PERSONAL", "INSTITUTIONAL", "STRATEGIC", "OPERATIONAL"]).default("INSTITUTIONAL"),
      priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
      amanahScore: z.number().min(0).max(1).default(0.75),
    }))
    .mutation(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      const caller = intelligenceRouter.createCaller(ctx);
      const created = await caller.intend({
        content: input.content,
        originSource: "L5_REALITY",
        creatorIdentity: input.source,
        sourceLayer: "L5_REALITY",
        ownershipClass: "INSTITUTIONAL",
        amanahScore: input.amanahScore,
        privacyLevel: "INSTITUTIONAL",
      });

      const objectId = created.object.objectId;
      const routeDecision = await caller.route({
        objectId,
        targetContext: input.targetContext,
        priority: input.priority,
      });

      return {
        bridge: "intentEngine",
        objectId,
        routing: routeDecision,
        governance: created.governance,
        continuity: created.continuity,
        metrics: created.metrics,
      };
    }),
});

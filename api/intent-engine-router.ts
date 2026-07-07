import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { intelligenceRouter } from "./intelligence-router";
import { assertBridgeAccess, getBridgeState } from "./bridge-guard";

export const intentEngineRouter = createRouter({
  status: publicQuery.query(() => ({
    bridge: "intentEngine",
    ...getBridgeState(),
  })),

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

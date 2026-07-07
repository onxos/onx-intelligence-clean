import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { knowledgeRouter } from "./knowledge-router";
import { assertBridgeAccess, getBridgeState } from "./bridge-guard";

export const corpusQueryRouter = createRouter({
  status: publicQuery.query(() => ({
    bridge: "corpusQuery",
    ...getBridgeState(),
  })),

  domains: publicQuery.query(async ({ ctx }) => {
    assertBridgeAccess(ctx);
    const caller = knowledgeRouter.createCaller(ctx);
    const result = await caller.domains();
    return {
      bridge: "corpusQuery",
      ...result,
    };
  }),

  search: publicQuery
    .input(z.object({
      query: z.string().min(1),
      domain: z.string().optional(),
      tier: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
      useVector: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      assertBridgeAccess(ctx);
      const caller = knowledgeRouter.createCaller(ctx);
      const result = await caller.search(input);
      return {
        bridge: "corpusQuery",
        ...result,
      };
    }),
});

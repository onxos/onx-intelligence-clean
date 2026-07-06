import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const analyticsRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "analytics",
    status: "active",
    items: ["analytics-alpha", "analytics-beta", "analytics-gamma"]
  }))
});

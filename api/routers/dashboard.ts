import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const dashboardRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "dashboard",
    status: "active",
    items: ["dashboard-alpha", "dashboard-beta", "dashboard-gamma"]
  }))
});

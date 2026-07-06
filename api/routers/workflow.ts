import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const workflowRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "workflow",
    status: "active",
    items: ["workflow-alpha", "workflow-beta", "workflow-gamma"]
  }))
});

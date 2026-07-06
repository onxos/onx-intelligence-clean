import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const connectorsRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "connectors",
    status: "active",
    items: ["connectors-alpha", "connectors-beta", "connectors-gamma"]
  }))
});

import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const sentimentRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "sentiment",
    status: "active",
    items: ["sentiment-alpha", "sentiment-beta", "sentiment-gamma"]
  }))
});

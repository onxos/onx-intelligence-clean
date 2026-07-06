import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const searchRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "search",
    status: "active",
    items: ["search-alpha", "search-beta", "search-gamma"]
  }))
});

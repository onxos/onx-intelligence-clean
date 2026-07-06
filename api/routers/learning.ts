import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const learningRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "learning",
    status: "active",
    items: ["learning-alpha", "learning-beta", "learning-gamma"]
  }))
});

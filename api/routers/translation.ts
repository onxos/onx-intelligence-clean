import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const translationRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "translation",
    status: "active",
    items: ["translation-alpha", "translation-beta", "translation-gamma"]
  }))
});

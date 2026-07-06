import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const evidenceRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "evidence",
    status: "active",
    items: ["evidence-alpha", "evidence-beta", "evidence-gamma"]
  }))
});

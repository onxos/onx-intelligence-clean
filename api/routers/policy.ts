import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const policyRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "policy",
    status: "active",
    items: ["policy-alpha", "policy-beta", "policy-gamma"]
  }))
});

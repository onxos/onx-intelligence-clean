import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const securityRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "security",
    status: "active",
    items: ["security-alpha", "security-beta", "security-gamma"]
  }))
});

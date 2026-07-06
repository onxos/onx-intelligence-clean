import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const profilesRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "profiles",
    status: "active",
    items: ["profiles-alpha", "profiles-beta", "profiles-gamma"]
  }))
});

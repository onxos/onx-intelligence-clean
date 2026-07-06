import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const governanceRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "governance",
    status: "active",
    items: ["governance-alpha", "governance-beta", "governance-gamma"]
  }))
});

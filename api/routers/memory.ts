import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const memoryRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "memory",
    status: "active",
    items: ["memory-alpha", "memory-beta", "memory-gamma"]
  }))
});

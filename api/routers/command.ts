import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const commandRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "command",
    status: "active",
    items: ["command-alpha", "command-beta", "command-gamma"]
  }))
});

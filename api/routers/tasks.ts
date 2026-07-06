import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const tasksRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "tasks",
    status: "active",
    items: ["tasks-alpha", "tasks-beta", "tasks-gamma"]
  }))
});

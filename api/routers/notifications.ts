import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const notificationsRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "notifications",
    status: "active",
    items: ["notifications-alpha", "notifications-beta", "notifications-gamma"]
  }))
});

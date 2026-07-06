import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const workspaceRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "workspace",
    status: "active",
    items: ["workspace-alpha", "workspace-beta", "workspace-gamma"]
  }))
});

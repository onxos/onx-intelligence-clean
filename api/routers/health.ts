import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(() => ({ pong: true, service: "onx-intelligence-v2" }))
});

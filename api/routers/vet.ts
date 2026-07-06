import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const vetRouter = createTRPCRouter({
  score: publicProcedure.query(() => ({ trustScore: 98, signal: "green" }))
});

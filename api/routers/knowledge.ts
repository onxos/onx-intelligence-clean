import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { knowledgeStats } from "../lib/datasets";

export const knowledgeRouter = createTRPCRouter({
  stats: publicProcedure.query(() => knowledgeStats),
  domains: publicProcedure.query(() => Array.from({ length: knowledgeStats.domains }, (_, i) => `Domain-${i + 1}`))
});

import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { rhythms } from "../lib/datasets";

export const schedulerRouter = createTRPCRouter({
  rhythms: publicProcedure.query(() => rhythms),
  status: publicProcedure.query(() => ({ active: true, count: rhythms.length }))
});

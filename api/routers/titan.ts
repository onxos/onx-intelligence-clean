import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { titans } from "../lib/datasets";

export const titanRouter = createTRPCRouter({
  listTitans: publicProcedure.query(() => titans)
});

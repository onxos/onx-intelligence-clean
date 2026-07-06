import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const aiBrainRouter = createTRPCRouter({
  think: publicProcedure
    .input(z.object({ prompt: z.string().min(2) }))
    .mutation(({ input }: { input: { prompt: string } }) => ({ insight: `Simulated strategic response for: ${input.prompt}` }))
});

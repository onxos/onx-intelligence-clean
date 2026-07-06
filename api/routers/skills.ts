import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { skills } from "../lib/datasets";

export const skillsRouter = createTRPCRouter({
  list: publicProcedure.query(() => skills),
  categories: publicProcedure.query(() => [...new Set(skills.map((s) => s.category))])
});

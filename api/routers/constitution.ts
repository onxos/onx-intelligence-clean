import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { principles } from "../lib/datasets";
import { Guardian, USFIPv2Engine } from "../lib/runtime-stubs";

const guardian = new Guardian();
const engine = new USFIPv2Engine();

export const constitutionRouter = createTRPCRouter({
  principles: publicProcedure.query(() => principles),
  evaluate: publicProcedure.query(() => ({
    guardian: guardian.validate("constitutional-audit"),
    engine: engine.evaluate("constitutional-readiness")
  }))
});

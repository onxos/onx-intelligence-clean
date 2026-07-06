import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { runtimeStubs, type ContinuityLayer, type CapitalCategory } from "../lib/runtime-stubs";

const continuity: ContinuityLayer[] = [
  { id: "core", status: "active" },
  { id: "backup", status: "standby" }
];

const capital: CapitalCategory[] = ["human", "social", "institutional", "knowledge"];

export const runtimeRouter = createTRPCRouter({
  status: publicProcedure.query(() => ({ ...runtimeStubs, continuity, capital }))
});

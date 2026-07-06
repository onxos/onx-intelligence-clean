import { createTRPCRouter, publicProcedure } from "../lib/trpc";
import { titans } from "../lib/datasets";

export const titanBridgeRouter = createTRPCRouter({
  listTitans: publicProcedure.query(() => titans),
  commandBridge: publicProcedure.query(() => ({ online: true, personas: titans.length }))
});

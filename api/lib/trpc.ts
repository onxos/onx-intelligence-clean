import superjson from "superjson";
import { initTRPC } from "@trpc/server";

const t = initTRPC.context<{}>().create({
  transformer: superjson
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

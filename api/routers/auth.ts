import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const authRouter = createTRPCRouter({
  session: publicProcedure.query(() => ({ authenticated: false, role: "guest" })),
  login: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(({ input }: { input: { email: string } }) => ({ ok: true, email: input.email }))
});

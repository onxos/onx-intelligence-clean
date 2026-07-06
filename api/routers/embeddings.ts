import { createTRPCRouter, publicProcedure } from "../lib/trpc";

export const embeddingsRouter = createTRPCRouter({
  list: publicProcedure.query(() => ({
    router: "embeddings",
    status: "active",
    items: ["embeddings-alpha", "embeddings-beta", "embeddings-gamma"]
  }))
});

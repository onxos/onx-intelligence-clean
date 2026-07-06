import { authRouter } from "./auth-router";
import { intelligenceRouter } from "./intelligence-router";
import { modelGatewayRouter } from "./model-gateway-router";
import { toolGatewayRouter } from "./tool-gateway-router";
import { runtimeRouter } from "./runtime-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  intelligence: intelligenceRouter,
  modelGateway: modelGatewayRouter,
  toolGateway: toolGatewayRouter,
  runtime: runtimeRouter,
});

export type AppRouter = typeof appRouter;

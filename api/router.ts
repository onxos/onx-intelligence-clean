import { authRouter } from "./auth-router";
import { intelligenceRouter } from "./intelligence-router";
import { modelGatewayRouter } from "./model-gateway-router";
import { toolGatewayRouter } from "./tool-gateway-router";
import { runtimeRouter } from "./runtime-router";
import { titanBridgeRouter } from "./titan-bridge-router";
import { constitutionRouter } from "./constitution-router";
import { authHardeningRouter } from "./auth-hardening-router";
import { aiBrainRouter } from "./ai-brain-router";
import { knowledgeRouter } from "./knowledge-router";
import { titanKbRouter } from "./titan-kb-router";
import { vetIntelligenceRouter } from "./vet-intelligence-router";
import { institutionalRouter } from "./institutional-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  intelligence: intelligenceRouter,
  modelGateway: modelGatewayRouter,
  toolGateway: toolGatewayRouter,
  runtime: runtimeRouter,
  titan: titanBridgeRouter,
  constitution: constitutionRouter,
  authHardening: authHardeningRouter,
  aiBrain: aiBrainRouter,
  knowledge: knowledgeRouter,
  titanKb: titanKbRouter,
  vet: vetIntelligenceRouter,
  institutional: institutionalRouter,
});

export type AppRouter = typeof appRouter;

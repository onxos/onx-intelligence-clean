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
import { skillsRouter } from "./skills-router";
import { cepRouter } from "./cep-router";
import { ocppRouter } from "./ocpp-router";
import { cevpRouter } from "./cevp-router";
import { ccopRouter } from "./ccop-router";
import { cosRouter } from "./cos-router";
import { ucrRouter } from "./ucr-router";
import { schedulerRouter } from "./scheduler-router";
import { passwordResetRouter } from "./password-reset-router";
import { modelFederationRouter } from "./model-federation-router";
import { healthRouter } from "./health-router";
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
  skills: skillsRouter,
  cep: cepRouter,
  ocpp: ocppRouter,
  cevp: cevpRouter,
  ccop: ccopRouter,
  cos: cosRouter,
  ucr: ucrRouter,
  scheduler: schedulerRouter,
  passwordReset: passwordResetRouter,
  modelFederation: modelFederationRouter,
  health: healthRouter,
});

export type AppRouter = typeof appRouter;

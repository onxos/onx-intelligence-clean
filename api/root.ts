import { createTRPCRouter } from "./lib/trpc";
import { healthRouter } from "./routers/health";
import { constitutionRouter } from "./routers/constitution";
import { titanBridgeRouter } from "./routers/titan-bridge";
import { titanRouter } from "./routers/titan";
import { knowledgeRouter } from "./routers/knowledge";
import { skillsRouter } from "./routers/skills";
import { schedulerRouter } from "./routers/scheduler";
import { cepRouter, ocppRouter, cevpRouter, ccopRouter, cosRouter, ucrRouter } from "./routers/programs";
import { vetRouter } from "./routers/vet";
import { authRouter } from "./routers/auth";
import { aiBrainRouter } from "./routers/ai-brain";
import { runtimeRouter } from "./routers/runtime";
import { memoryRouter } from "./routers/memory";
import { governanceRouter } from "./routers/governance";
import { evidenceRouter } from "./routers/evidence";
import { dashboardRouter } from "./routers/dashboard";
import { commandRouter } from "./routers/command";
import { notificationsRouter } from "./routers/notifications";
import { analyticsRouter } from "./routers/analytics";
import { translationRouter } from "./routers/translation";
import { sentimentRouter } from "./routers/sentiment";
import { embeddingsRouter } from "./routers/embeddings";
import { searchRouter } from "./routers/search";
import { tasksRouter } from "./routers/tasks";
import { workflowRouter } from "./routers/workflow";
import { policyRouter } from "./routers/policy";
import { securityRouter } from "./routers/security";
import { profilesRouter } from "./routers/profiles";
import { workspaceRouter } from "./routers/workspace";
import { connectorsRouter } from "./routers/connectors";
import { learningRouter } from "./routers/learning";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  constitution: constitutionRouter,
  "titan-bridge": titanBridgeRouter,
  titan: titanRouter,
  knowledge: knowledgeRouter,
  skills: skillsRouter,
  scheduler: schedulerRouter,
  cep: cepRouter,
  ocpp: ocppRouter,
  cevp: cevpRouter,
  ccop: ccopRouter,
  cos: cosRouter,
  ucr: ucrRouter,
  vet: vetRouter,
  auth: authRouter,
  "ai-brain": aiBrainRouter,
  runtime: runtimeRouter,
  memory: memoryRouter,
  governance: governanceRouter,
  evidence: evidenceRouter,
  dashboard: dashboardRouter,
  command: commandRouter,
  notifications: notificationsRouter,
  analytics: analyticsRouter,
  translation: translationRouter,
  sentiment: sentimentRouter,
  embeddings: embeddingsRouter,
  search: searchRouter,
  tasks: tasksRouter,
  workflow: workflowRouter,
  policy: policyRouter,
  security: securityRouter,
  profiles: profilesRouter,
  workspace: workspaceRouter,
  connectors: connectorsRouter,
  learning: learningRouter
});

export type AppRouter = typeof appRouter;

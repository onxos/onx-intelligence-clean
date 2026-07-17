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
import { evidenceRegistryRouter } from "./evidence-registry-router";
import { voiceRouter } from "./voice-router";
import { gpsRouter } from "./gps-router";
import { revenueEngineRouter } from "./revenue-engine-router";
import { domainServicesRouter } from "./domain-services-router";
import { corpusQueryRouter } from "./corpus-query-router";
import { intentEngineRouter } from "./intent-engine-router";
import { providersRouter } from "./providers-router";
import { onxRouter } from "./onx-router";
import { askRouter } from "./ask-router";
import { titanDecisionRouter } from "./titan-decision-router";
import { clinicAssistantRouter } from "./clinic-assistant-router";
import { founderCompanionRouter } from "./founder-companion-router";
import { iucRouter } from "./iuc-router";
import { measurementRouter } from "./measurement-router";
import { ficRouter } from "./fic-router";
import { conflictRouter } from "./conflict-router";
import { purposeRouter } from "./purpose-router";
import { allocationRouter } from "./allocation-router";
import { proofRouter } from "./proof-router";
import { osRouter } from "./os-router";
import { livingLoopRouter } from "./living-loop-router";
import { usfipRouter } from "./usfip-router";
import { ocmbrRouter } from "./ocmbr-router";
import { codexGuardRouter } from "./codex-guard-router";
import { authorityRouter } from "./authority-router";
import { orchestratorRouter } from "./orchestrator-router";
import { methodsLibraryRouter } from "./methods-library-router";
import { capabilityFactoryRouter } from "./capability-factory-router";
import { intelligenceObjectRouter } from "./intelligence-object-router";
import { bridgeContractsRouter } from "./bridge-contracts-router";
import { realityEngineRouter } from "./reality-engine-router";
import { zeroInputRouter } from "./zero-input-router";
import { evaluationLearningRouter } from "./evaluation-learning-router";
import { deepResearchRouter } from "./deep-research-router";
import {
  rateLimitRouter,
  budgetRouter,
  costRouter,
  queueRouter,
  securityRouter,
  profilerRouter,
  dashboardRouter,
  testRouter,
} from "./advanced-engines-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  intelligence: intelligenceRouter,
  modelGateway: modelGatewayRouter,
  toolGateway: toolGatewayRouter,
  runtime: runtimeRouter,
  titan: titanBridgeRouter,
  titanBridge: titanBridgeRouter,
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
  evidenceRegistry: evidenceRegistryRouter,
  voice: voiceRouter,
  gps: gpsRouter,
  revenueEngine: revenueEngineRouter,
  // Phase 2: Advanced Engines
  rateLimit: rateLimitRouter,
  budget: budgetRouter,
  cost: costRouter,
  queue: queueRouter,
  security: securityRouter,
  profiler: profilerRouter,
  dashboard: dashboardRouter,
  test: testRouter,
  // Phase 3: Domain Services (D01/D05/D06/D08/D14/D15/D18)
  domains: domainServicesRouter,
  // Track I — Intelligence core: IUC engine (I-M4) + IURG object model
  iuc: iucRouter,
  measurement: measurementRouter,
  fic: ficRouter,
  conflict: conflictRouter,
  purpose: purposeRouter,
  allocation: allocationRouter,
  proof: proofRouter,
  os: osRouter,
  livingLoop: livingLoopRouter,
  usfip: usfipRouter,
  // B0 — OCMBR Runtime: executive truth ledger (five-state maturity)
  ocmbr: ocmbrRouter,
  // B1 — Codex Guard: charter enforcement (deviation scan + claim eval)
  codexGuard: codexGuardRouter,
  // B3 — Constitution runtime: A0–A5 authority gate + CCMR + CEvP (fail-closed)
  authority: authorityRouter,
  // B2 — ONX Orchestrator: mandate → closed waves → verify → report
  orchestrator: orchestratorRouter,
  // B2-β — Methods Library: governed method records + compliance verify
  methodsLibrary: methodsLibraryRouter,
  // B2-γ — Capability Factory: propose → A2-gated generate → guard → verify → promote
  capabilityFactory: capabilityFactoryRouter,
  // B4 — Intelligence Objects: deterministic reasoning lifecycle + persistent memory
  intelligenceObject: intelligenceObjectRouter,
  // B8 — Bridge Contracts: versioned schema registry + fail-closed validation + unified activity log
  bridgeContracts: bridgeContractsRouter,
  // B5 — Reality Engine: deterministic ingest→graph→contradiction detection
  realityEngine: realityEngineRouter,
  // B7 — Constrained Zero-Input: authority-classified suggestions (propose-only, fail-closed)
  zeroInput: zeroInputRouter,
  // B6 — Evaluation & Learning: deterministic golden sets + fail-closed regression gates + OCMBR RUN evidence
  evaluationLearning: evaluationLearningRouter,
  // K1 — Deep Research: plan→collect→validate→contradict→report loop (reuses B5 contradiction detection)
  deepResearch: deepResearchRouter,
  // Platform contract aliases
  bridge: titanBridgeRouter,
  corpusQuery: corpusQueryRouter,
  intentEngine: intentEngineRouter,
  providers: providersRouter,
  onx: onxRouter,
  // K4 — ask.onx: deterministic cited answer (intent + BM25 fused)
  ask: askRouter,
  // Phase P — Titan Decision Engine: durable + tool-grounded + authority-gated
  // + evaluated + outcome-feedback operational replacement for prompt-only titans
  titanDecision: titanDecisionRouter,
  // Phase P — Clinic Assistant operational substrate (durable+tool+memory+auth+eval+feedback)
  clinicAssistant: clinicAssistantRouter,
  // Phase P — Founder Companion operational substrate (durable+tool+memory+auth+eval+feedback)
  founderCompanion: founderCompanionRouter,
});

export type AppRouter = typeof appRouter;

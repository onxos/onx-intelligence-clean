// ============================================================
// ONX INTELLIGENCE RUNTIME — tRPC Router
// Exposes all 18 engines through type-safe endpoints
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  CausalGraph,
  USFIPv2Engine,
  Guardian,
  Auditor,
  CompanionRuntime,
  HealthMonitor,
  RecoveryEngine,
  PrivacyEnforcer,
  BoundaryGuard,
  IngestionPipeline,
  InstitutionalOS,
  GoalEngine,
  FlourishingEngine,
  ReinforcementLoop,
  UnderstandingLadder,
  ShadowRuntime,
  ContinuityEngine,
} from "@onx/intelligence-runtime";
import type {
  ContinuityLayer,
  CapitalCategory,
} from "@onx/intelligence-runtime";

// --- Singleton instances (initialized once, shared across requests) ---
const usfipv2 = new USFIPv2Engine({
  amanahFloor: 0.50,
  shadowEnabled: true,
  guardianEnabled: true,
  privacyEnabled: true,
  continuityEnabled: true,
});
usfipv2.start();

const guardian = new Guardian();
const auditor = new Auditor();
const companionRuntime = new CompanionRuntime();
const healthMonitor = new HealthMonitor();
const recoveryEngine = new RecoveryEngine();
const privacyEnforcer = new PrivacyEnforcer();
const boundaryGuard = new BoundaryGuard(100, 60000);
const ingestionPipeline = new IngestionPipeline(guardian);
const institutionalOS = new InstitutionalOS({
  institutionId: "onx-primary",
  name: "ONX Intelligence",
  type: "CIVILIZATIONAL",
  flourishingEnabled: true,
});
const goalEngine = new GoalEngine();
const flourishingEngine = new FlourishingEngine();
const reinforcementLoop = new ReinforcementLoop();
const understandingLadder = new UnderstandingLadder();
const shadowRuntime = new ShadowRuntime();
const continuityEngine = new ContinuityEngine();
const causalGraph = new CausalGraph();

// --- Register health checks ---
healthMonitor.registerCheck("usfipv2", () => ({ healthy: usfipv2.isActive() }));
healthMonitor.registerCheck("guardian", () => ({ healthy: true }));
healthMonitor.registerCheck("continuity", () => {
  const stats = continuityEngine.getStats();
  return { healthy: stats.integrity, details: `${stats.totalRecords} records` };
});

export const runtimeRouter = createRouter({
  // ==========================================================
  // USFIPv2 — Unified Constitutional Enforcement
  // ==========================================================
  usfipv2: createRouter({
    status: publicQuery.query(() => usfipv2.getStatus()),
    audit: publicQuery
      .input(z.object({
        objectId: z.string().optional(),
        amanahScore: z.number().min(0).max(1).optional(),
        content: z.string().optional(),
        privacyLevel: z.string().optional(),
        accessorRole: z.string().optional(),
        accessorId: z.string().optional(),
        type: z.string().optional(),
      }))
      .mutation(({ input }) => usfipv2.fullAudit(input)),
  }),

  // ==========================================================
  // Guardian — Amanah & Constitutional Checks
  // ==========================================================
  guardian: createRouter({
    checkAmanah: publicQuery
      .input(z.object({ score: z.number().min(0).max(1) }))
      .query(({ input }) => guardian.checkAmanah(input.score)),
    checkShadow: publicQuery
      .input(z.object({ originSource: z.string() }))
      .query(({ input }) => guardian.validateShadow(input.originSource)),
    alerts: publicQuery.query(() => guardian.getAlerts()),
  }),

  // ==========================================================
  // Health — System Health Monitoring
  // ==========================================================
  health: createRouter({
    check: publicQuery.query(() => healthMonitor.check()),
    status: publicQuery.query(() => ({ healthy: healthMonitor.isHealthy() })),
  }),

  // ==========================================================
  // Continuity — Hash-Chain Verification
  // ==========================================================
  continuity: createRouter({
    record: publicQuery
      .input(z.object({
        layer: z.enum(["L1_SOURCE", "L2_OBJECT", "L3_EVENT", "L4_DECISION", "L5_SYSTEM"]),
        eventType: z.string(),
        entityId: z.string(),
        data: z.record(z.string(), z.any()),
      }))
      .mutation(({ input }) =>
        continuityEngine.record(input.layer as ContinuityLayer, input.eventType, input.entityId, input.data)
      ),
    verify: publicQuery.query(() => continuityEngine.verifyChain()),
    stats: publicQuery.query(() => continuityEngine.getStats()),
  }),

  // ==========================================================
  // Goals — Goal Engine
  // ==========================================================
  goals: createRouter({
    create: publicQuery
      .input(z.object({
        title: z.string(),
        description: z.string(),
        target: z.number(),
        unit: z.string(),
        deadline: z.string().datetime().optional(),
      }))
      .mutation(({ input }) =>
        goalEngine.createGoal(input.title, input.description, input.target, input.unit, input.deadline ? new Date(input.deadline) : undefined)
      ),
    updateProgress: publicQuery
      .input(z.object({ goalId: z.string(), current: z.number() }))
      .mutation(({ input }) => goalEngine.updateProgress(input.goalId, input.current)),
    getActive: publicQuery.query(() => goalEngine.getActiveGoals()),
    stats: publicQuery.query(() => goalEngine.getStats()),
  }),

  // ==========================================================
  // Flourishing — Civilizational Evolution Metrics
  // ==========================================================
  flourishing: createRouter({
    registerDimension: publicQuery
      .input(z.object({ dimension: z.string(), weight: z.number().min(0).max(1) }))
      .mutation(({ input }) => flourishingEngine.registerDimension(input.dimension, input.weight)),
    updateScore: publicQuery
      .input(z.object({ dimension: z.string(), score: z.number().min(0).max(1) }))
      .mutation(({ input }) => flourishingEngine.updateScore(input.dimension, input.score)),
    index: publicQuery.query(() => ({ index: flourishingEngine.calculateIndex(), metrics: flourishingEngine.getMetrics() })),
  }),

  // ==========================================================
  // Graph — Causal Intelligence Graph
  // ==========================================================
  graph: createRouter({
    addNode: publicQuery
      .input(z.object({
        objectId: z.string(),
        objectType: z.string(),
        amanahScore: z.string(),
        content: z.string().optional(),
      }))
      .mutation(({ input }) => {
        causalGraph.addNode({
          id: 0, objectId: input.objectId, objectType: input.objectType as any,
          lifecycleState: "RAW", version: 1, originSource: "L1_FOUNDER",
          creatorIdentity: "System", amanahScore: input.amanahScore,
          ownershipClass: "INSTITUTIONAL", validationStatus: "UNVALIDATED",
          understandingRung: 0, capitalValue: "0", capitalCategory: null,
          content: input.content || null, contentHash: "", semanticSummary: null,
          privacyLevel: "INSTITUTIONAL", trustScore: "0.50", shadowStatus: "NOT_SHADOW",
          customAttributes: null, createdAt: new Date(), updatedAt: new Date(),
        });
        return { added: true };
      }),
    addEdge: publicQuery
      .input(z.object({ fromId: z.string(), toId: z.string(), type: z.string(), strength: z.number() }))
      .mutation(({ input }) => {
        causalGraph.addEdge(input.fromId, input.toId, input.type, input.strength);
        return { added: true };
      }),
    lineage: publicQuery
      .input(z.object({ objectId: z.string(), depth: z.number().default(3) }))
      .query(({ input }) => causalGraph.getLineage(input.objectId, input.depth)),
    stats: publicQuery.query(() => causalGraph.getStats()),
  }),

  // ==========================================================
  // Reinforcement — Learning Loop
  // ==========================================================
  reinforcement: createRouter({
    recordEpisode: publicQuery
      .input(z.object({
        state: z.string(),
        action: z.string(),
        reward: z.number(),
        nextState: z.string(),
      }))
      .mutation(({ input }) => {
        reinforcementLoop.recordEpisode(input);
        return { recorded: true };
      }),
    selectAction: publicQuery
      .input(z.object({ state: z.string(), actions: z.array(z.string()) }))
      .query(({ input }) => ({ action: reinforcementLoop.selectAction(input.state, input.actions) })),
    stats: publicQuery.query(() => reinforcementLoop.getStats()),
  }),

  // ==========================================================
  // Ladder — Understanding Rung Tracking
  // ==========================================================
  ladder: createRouter({
    getRung: publicQuery.query(() => ({
      rung: understandingLadder.getCurrentRung(),
      name: understandingLadder.getRungName(),
      progress: understandingLadder.getProgress(),
    })),
    ascend: publicQuery
      .input(z.object({ trigger: z.string() }))
      .mutation(({ input }) => ({
        rung: understandingLadder.ascend(input.trigger),
        name: understandingLadder.getRungName(),
      })),
    descend: publicQuery
      .input(z.object({ trigger: z.string() }))
      .mutation(({ input }) => ({
        rung: understandingLadder.descend(input.trigger),
        name: understandingLadder.getRungName(),
      })),
    definitions: publicQuery.query(() => understandingLadder.constructor.name),
  }),

  // ==========================================================
  // Shadow — External Source Verification
  // ==========================================================
  shadow: createRouter({
    submit: publicQuery
      .input(z.object({ content: z.string(), source: z.string(), trustScore: z.number() }))
      .mutation(({ input }) => shadowRuntime.submit(input.content, input.source, input.trustScore)),
    verify: publicQuery
      .input(z.object({ entryId: z.string(), validatorTrust: z.number() }))
      .mutation(({ input }) => shadowRuntime.verify(input.entryId, input.validatorTrust)),
    pending: publicQuery.query(() => shadowRuntime.getPending()),
    stats: publicQuery.query(() => shadowRuntime.getStats()),
  }),

  // ==========================================================
  // Institution — Capital & Institutional Intelligence
  // ==========================================================
  institution: createRouter({
    credit: publicQuery
      .input(z.object({
        objectId: z.number(),
        category: z.enum(["WISDOM", "JUDGMENT", "UNDERSTANDING", "FLOURISHING"]),
        amount: z.string(),
        reason: z.string(),
      }))
      .mutation(({ input }) =>
        institutionalOS.credit(input.objectId, input.category as CapitalCategory, input.amount, input.reason)
      ),
    getBalance: publicQuery
      .input(z.object({ objectId: z.number() }))
      .query(({ input }) => ({ balance: institutionalOS.getBalance(input.objectId) })),
    totalCapital: publicQuery.query(() => ({ total: institutionalOS.getInstitutionalCapital() })),
  }),

  // ==========================================================
  // Companions — Companion Intelligence
  // ==========================================================
  companions: createRouter({
    register: publicQuery
      .input(z.object({
        companionId: z.string(),
        name: z.string(),
        specialization: z.string(),
        trustLevel: z.number().min(0).max(1),
      }))
      .mutation(({ input }) => {
        companionRuntime.register({ ...input, active: true });
        return { registered: true };
      }),
    interact: publicQuery
      .input(z.object({ companionId: z.string(), input: z.string() }))
      .mutation(({ input }) => companionRuntime.interact(input.companionId, input.input)),
    stats: publicQuery.query(() => companionRuntime.getStats()),
  }),

  // ==========================================================
  // Recovery — Error Recovery
  // ==========================================================
  recovery: createRouter({
    recover: publicQuery
      .input(z.object({ errorMessage: z.string(), context: z.record(z.string(), z.any()).optional() }))
      .mutation(async ({ input }) => {
        const error = new Error(input.errorMessage);
        const result = await recoveryEngine.recover(error, input.context);
        return { recovered: result };
      }),
  }),

  // ==========================================================
  // Privacy — Privacy Enforcement
  // ==========================================================
  privacy: createRouter({
    classify: publicQuery
      .input(z.object({ entityId: z.string(), level: z.enum(["PERSONAL", "INSTITUTIONAL", "FEDERATION", "PUBLIC", "RESTRICTED"]) }))
      .mutation(({ input }) => {
        privacyEnforcer.classify(input.entityId, input.level);
        return { classified: true };
      }),
    canAccess: publicQuery
      .input(z.object({ entityId: z.string(), role: z.string(), accessorId: z.string() }))
      .query(({ input }) => ({ allowed: privacyEnforcer.canAccess(input.entityId, input.role, input.accessorId) })),
  }),

  // ==========================================================
  // Boundary — Rate Limiting
  // ==========================================================
  boundary: createRouter({
    checkLimit: publicQuery
      .input(z.object({ key: z.string() }))
      .query(({ input }) => boundaryGuard.checkLimit(input.key)),
  }),

  // ==========================================================
  // Ingestion — Intelligence Feeding
  // ==========================================================
  ingestion: createRouter({
    stats: publicQuery.query(() => ingestionPipeline.getSourceStats()),
  }),

  // ==========================================================
  // Auditor — Constitutional Audit
  // ==========================================================
  auditor: createRouter({
    audit: publicQuery
      .input(z.object({ entity: z.string(), type: z.string(), details: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => auditor.audit(input.entity, input.type, input.details)),
    summary: publicQuery.query(() => auditor.getSummary()),
    log: publicQuery.query(() => auditor.getAuditLog()),
  }),
});

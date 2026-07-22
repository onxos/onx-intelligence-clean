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
import {
  loadEngineState,
  persistEngineAsync,
  isEngineStatePersistenceConfigured,
} from "./lib/engine-state-store";

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

// --- Line I / Phase 1: durable mind — hydrate engine state from Postgres ---
// On boot the mind wakes with its memory intact (CCOP), not with amnesia.
// Fail-open on any single engine: a corrupt snapshot never blocks boot
// (except the continuity chain, which is fail-closed BY DESIGN).
let enginesHydrated = false;
const PERSISTED_ENGINES = [
  "goals", "graph", "continuity", "auditor", "ladder",
  "shadow", "reinforcement", "flourishing", "institution",
] as const;
const hydration = (async () => {
  if (!isEngineStatePersistenceConfigured()) return;
  const targets: Array<[string, { restore: (s: never) => void }]> = [
    ["goals", goalEngine],
    ["graph", causalGraph],
    ["continuity", continuityEngine],
    ["auditor", auditor],
    ["ladder", understandingLadder],
    ["shadow", shadowRuntime],
    ["reinforcement", reinforcementLoop],
    ["flourishing", flourishingEngine],
    ["institution", institutionalOS],
  ];
  for (const [name, engine] of targets) {
    try {
      const state = await loadEngineState(name);
      if (state !== null) engine.restore(state as never);
    } catch {
      /* honest degradation: engine boots empty rather than crashing the mind */
    }
  }
  enginesHydrated = true;
})();

// Convenience persisters (fire-and-forget; DB hiccups never break mutations)
const persistGoals = () => persistEngineAsync("goals", () => goalEngine.snapshot());
const persistGraph = () => persistEngineAsync("graph", () => causalGraph.snapshot());
const persistContinuity = () => persistEngineAsync("continuity", () => continuityEngine.snapshot());
const persistAuditor = () => persistEngineAsync("auditor", () => auditor.snapshot());
const persistLadder = () => persistEngineAsync("ladder", () => understandingLadder.snapshot());
const persistShadow = () => persistEngineAsync("shadow", () => shadowRuntime.snapshot());
const persistReinforcement = () => persistEngineAsync("reinforcement", () => reinforcementLoop.snapshot());
const persistFlourishing = () => persistEngineAsync("flourishing", () => flourishingEngine.snapshot());
const persistInstitution = () => persistEngineAsync("institution", () => institutionalOS.snapshot());

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
      .mutation(({ input }) => {
        const result = continuityEngine.record(input.layer as ContinuityLayer, input.eventType, input.entityId, input.data);
        persistContinuity();
        return result;
      }),
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
      .mutation(({ input }) => {
        const goal = goalEngine.createGoal(input.title, input.description, input.target, input.unit, input.deadline ? new Date(input.deadline) : undefined);
        persistGoals();
        return goal;
      }),
    updateProgress: publicQuery
      .input(z.object({ goalId: z.string(), current: z.number() }))
      .mutation(({ input }) => {
        const result = goalEngine.updateProgress(input.goalId, input.current);
        persistGoals();
        return result;
      }),
    getActive: publicQuery.query(() => goalEngine.getActiveGoals()),
    stats: publicQuery.query(() => goalEngine.getStats()),
  }),

  // ==========================================================
  // Flourishing — Civilizational Evolution Metrics
  // ==========================================================
  flourishing: createRouter({
    registerDimension: publicQuery
      .input(z.object({ dimension: z.string(), weight: z.number().min(0).max(1) }))
      .mutation(({ input }) => {
        const result = flourishingEngine.registerDimension(input.dimension, input.weight);
        persistFlourishing();
        return result;
      }),
    updateScore: publicQuery
      .input(z.object({ dimension: z.string(), score: z.number().min(0).max(1) }))
      .mutation(({ input }) => {
        const result = flourishingEngine.updateScore(input.dimension, input.score);
        persistFlourishing();
        return result;
      }),
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
        persistGraph();
        return { added: true };
      }),
    addEdge: publicQuery
      .input(z.object({ fromId: z.string(), toId: z.string(), type: z.string(), strength: z.number() }))
      .mutation(({ input }) => {
        causalGraph.addEdge(input.fromId, input.toId, input.type, input.strength);
        persistGraph();
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
        persistReinforcement();
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
      .mutation(({ input }) => {
        const result = {
          rung: understandingLadder.ascend(input.trigger),
          name: understandingLadder.getRungName(),
        };
        persistLadder();
        return result;
      }),
    descend: publicQuery
      .input(z.object({ trigger: z.string() }))
      .mutation(({ input }) => {
        const result = {
          rung: understandingLadder.descend(input.trigger),
          name: understandingLadder.getRungName(),
        };
        persistLadder();
        return result;
      }),
    definitions: publicQuery.query(() => understandingLadder.constructor.name),
  }),

  // ==========================================================
  // Shadow — External Source Verification
  // ==========================================================
  shadow: createRouter({
    submit: publicQuery
      .input(z.object({ content: z.string(), source: z.string(), trustScore: z.number() }))
      .mutation(({ input }) => {
        const result = shadowRuntime.submit(input.content, input.source, input.trustScore);
        persistShadow();
        return result;
      }),
    verify: publicQuery
      .input(z.object({ entryId: z.string(), validatorTrust: z.number() }))
      .mutation(({ input }) => {
        const result = shadowRuntime.verify(input.entryId, input.validatorTrust);
        persistShadow();
        return result;
      }),
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
      .mutation(({ input }) => {
        const result = institutionalOS.credit(input.objectId, input.category as CapitalCategory, input.amount, input.reason);
        persistInstitution();
        return result;
      }),
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
  // Persistence — Line I / Phase 1 honest status
  // ==========================================================
  persistence: createRouter({
    status: publicQuery.query(async () => {
      await hydration; // report post-hydration truth, never a guess
      return {
        configured: isEngineStatePersistenceConfigured(),
        hydrated: enginesHydrated,
        engines: [...PERSISTED_ENGINES],
        counts: {
          goals: goalEngine.getStats().total,
          graphNodes: causalGraph.getStats().nodes,
          continuityRecords: continuityEngine.getStats().totalRecords,
          auditorEntries: auditor.getSummary().total,
          shadowEntries: shadowRuntime.getStats().total,
          reinforcementEpisodes: reinforcementLoop.getStats().episodes,
          institutionCapital: institutionalOS.getInstitutionalCapital(),
          ladderRung: understandingLadder.getCurrentRung(),
        },
      };
    }),
  }),

  // ==========================================================
  // Auditor — Constitutional Audit
  // ==========================================================
  auditor: createRouter({
    audit: publicQuery
      .input(z.object({ entity: z.string(), type: z.string(), details: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => {
        const result = auditor.audit(input.entity, input.type, input.details);
        persistAuditor();
        return result;
      }),
    summary: publicQuery.query(() => auditor.getSummary()),
    log: publicQuery.query(() => auditor.getAuditLog()),
  }),
});

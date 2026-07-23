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
import { assertBridgeAccess } from "./bridge-guard";
import { env } from "./lib/env";

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
  "guardian", "ingestion",
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
    ["guardian", guardian],
    ["ingestion", ingestionPipeline],
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
const persistGuardian = () => persistEngineAsync("guardian", () => guardian.snapshot());
const persistIngestion = () => persistEngineAsync("ingestion", () => ingestionPipeline.snapshot());

// --- D11 feeding: real events from anywhere in the API enter the engines ---
// Corpus ingest, knowledge additions, intent analysis and future sources
// all flow through here → continuity ledger + causal graph + auditor +
// ingestion counters. This is the blood stream of Line I / Phase 2.
export const engineEvents = {
  recordContinuity(
    layer: ContinuityLayer,
    eventType: string,
    entityId: string,
    data: Record<string, unknown>,
  ) {
    const result = continuityEngine.record(layer, eventType, entityId, data);
    persistContinuity();
    return result;
  },
  addCausalNode(objectId: string, attrs: Record<string, unknown>) {
    causalGraph.addNode({ id: 0, objectId, ...attrs });
    persistGraph();
  },
  addCausalEdge(fromId: string, toId: string, type: string, strength: number) {
    causalGraph.addEdge(fromId, toId, type, strength);
    persistGraph();
  },
  audit(entity: string, type: string, details: Record<string, unknown>) {
    auditor.audit(entity, type, details);
    persistAuditor();
  },
  noteIngestion(source: string, count: number) {
    ingestionPipeline.noteSource(source);
    ingestionPipeline.noteProcessed(count);
    persistIngestion(); // counters are part of the durable mind too
  },
  /** Wait for boot hydration before reading engine state. */
  ready() { return hydration; },
};

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
      .query(({ input }) => {
        const result = guardian.checkAmanah(input.score);
        persistGuardian();
        return result;
      }),
    checkShadow: publicQuery
      .input(z.object({ originSource: z.string() }))
      .query(({ input }) => {
        const result = guardian.validateShadow(input.originSource);
        persistGuardian();
        return result;
      }),
    alerts: publicQuery.query(() => guardian.getAlerts()),
    stats: publicQuery.query(() => guardian.getStats()),
    // Human gate: acknowledge a reviewed alert (never deletes the record).
    acknowledgeAlert: publicQuery
      .input(z.object({ id: z.string().min(1), reason: z.string().min(3) }))
      .mutation(({ input, ctx }) => {
        assertBridgeAccess(ctx);
        const result = guardian.acknowledgeAlert(input.id, input.reason);
        if (result.found && !result.alreadyAcknowledged) {
          engineEvents.audit("guardian", "GUARDIAN_ALERT_ACKNOWLEDGED", {
            id: input.id,
            reason: input.reason,
          });
          persistGuardian();
        }
        return result;
      }),
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
      .mutation(async ({ input }) => {
        const reg = companionRuntime.get(input.companionId);
        if (!reg) return { error: "COMPANION_NOT_FOUND" as const };
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          // Honest disclosure — never a canned fake "Processing..." reply.
          return { error: "LLM_NOT_CONFIGURED" as const, companionId: input.companionId, note: "Companion requires OPENAI_API_KEY to think; no canned reply is returned." };
        }
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey });
        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.4,
          max_tokens: 600,
          messages: [
            { role: "system", content: `أنت «${reg.name}» — وكيل متخصص في ${reg.specialization} ضمن منظومة ONX البيطرية. أجب بإيجاز مهني وبالعربية، والتزم بتخصصك؛ إن خرج السؤال عنه قل ذلك صراحة.` },
            { role: "user", content: input.input },
          ],
        });
        const text = res.choices[0]?.message?.content ?? "";
        companionRuntime.noteInteraction(input.companionId);
        return { companionId: input.companionId, response: text, trustLevel: reg.trustLevel };
      }),
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
  // learning — Phase 4 / D12: the mind digests its own ledger.
  // Scans the continuity chain, detects patterns (>=3 occurrences
  // per the constitutional SC rule), promotes them up the
  // understanding ladder, and credits IUC (UNDERSTANDING capital).
  // Idempotent: detected patterns + cursor persist in engine state.
  // ==========================================================
  learning: createRouter({
    runCycle: publicQuery
      .mutation(async ({ ctx }) => {
        assertBridgeAccess(ctx);
        await hydration;
        type LearningState = { detected: Record<string, { count: number; firstSeen: string; promotedAt: string }> };
        type Judgment = {
          id: string; statement: string; patternEventType: string;
          evidence: { occurrencesAtDetection: number; occurrencesAtConfirmation: number; firstSeen: string };
          confidence: number; status: "PROPOSED" | "VALIDATED" | "REJECTED";
          formedAt: string; reviewedAt?: string;
        };
        const state = (await loadEngineState<LearningState>("learning")) ?? { detected: {} };
        const jstate = (await loadEngineState<{ judgments: Judgment[] }>("judgments")) ?? { judgments: [] };

        const records = (continuityEngine.snapshot() as { records: Array<{ eventType: string; ts: string }> }).records;
        // Tally occurrences per eventType across the whole ledger.
        const tally = new Map<string, { count: number; firstSeen: string }>();
        for (const r of records) {
          const cur = tally.get(r.eventType);
          if (cur) cur.count++;
          else tally.set(r.eventType, { count: 1, firstSeen: r.ts });
        }

        const newPatterns: string[] = [];
        for (const [eventType, info] of tally) {
          // Constitutional promotion rule: 3+ repetitions = pattern (SC).
          if (info.count >= 3 && !state.detected[eventType]) {
            const patternId = `pattern-${eventType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            engineEvents.recordContinuity("L3_EVENT", "PATTERN_DETECTED", patternId, {
              eventType, occurrences: info.count, firstSeen: info.firstSeen,
            });
            understandingLadder.ascend(`pattern:${eventType}`);
            persistLadder();
            institutionalOS.credit(1, "UNDERSTANDING", "1", `pattern detected: ${eventType}`);
            persistInstitution();
            engineEvents.audit("learning", "PATTERN_DETECTED", { eventType, occurrences: info.count });
            state.detected[eventType] = { count: info.count, firstSeen: info.firstSeen, promotedAt: new Date().toISOString() };
            newPatterns.push(eventType);
          }
        }
        // --- D13: judgment formation from RE-CONFIRMED patterns ---
        // Constitutional chain: pattern (3+ repetitions) → re-confirmation on
        // a later cycle with growth → JUDGMENT (PROPOSED, human gate for
        // validation — DG rules: judgments above risk need human review).
        const newJudgments: Judgment[] = [];
        for (const [eventType, det] of Object.entries(state.detected)) {
          const current = tally.get(eventType)?.count ?? det.count;
          const growth = current - det.count;
          const alreadyJudged = jstate.judgments.some(
            (j) => j.patternEventType === eventType && j.status !== "REJECTED",
          );
          // Re-confirmed: detected earlier, grew by >=2 since, not yet judged.
          if (growth >= 2 && !alreadyJudged) {
            const confidence = Math.min(0.95, Math.round((0.6 + 0.05 * current) * 100) / 100);
            // D-059 autonomy ladder: LOW-RISK judgments (confidence ≥0.9,
            // pattern ≥10 occurrences, zero guardian violations) are
            // auto-validated with a full audit trail — the human gate is
            // delegated, never abolished. Anything below the bar still
            // waits for the founder as PROPOSED.
            const guardianViolations = guardian.getStats().violations;
            const autoEligible =
              confidence >= 0.9 && current >= 10 && guardianViolations === 0;
            const judgment: Judgment & { autoValidated?: boolean } = {
              id: `judgment-${eventType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              statement: `النمط «${eventType}» تكرر ${current} مرة وتأكد عبر دورتين مستقلتين — يُقترح اعتماده سلوكًا مؤسسيًا مستقرًا يستحق الاستثمار فيه.`,
              patternEventType: eventType,
              evidence: {
                occurrencesAtDetection: det.count,
                occurrencesAtConfirmation: current,
                firstSeen: det.firstSeen,
              },
              confidence,
              status: autoEligible ? "VALIDATED" : "PROPOSED",
              formedAt: new Date().toISOString(),
            };
            if (autoEligible) {
              judgment.autoValidated = true;
              judgment.reviewedAt = judgment.formedAt;
              engineEvents.audit("learning", "JUDGMENT_AUTO_VALIDATED", {
                judgmentId: judgment.id,
                basis: { confidence, occurrences: current, guardianViolations },
                decision: "D-059",
              });
            }
            jstate.judgments.push(judgment);
            newJudgments.push(judgment);
            engineEvents.recordContinuity("L4_DECISION", "JUDGMENT_FORMED", judgment.id, {
              pattern: eventType, confidence: judgment.confidence,
            });
            institutionalOS.credit(1, "JUDGMENT", "2", `judgment formed: ${eventType}`);
            persistInstitution();
            understandingLadder.ascend(`judgment:${eventType}`);
            persistLadder();
            engineEvents.audit("learning", "JUDGMENT_FORMED", {
              judgmentId: judgment.id, pattern: eventType,
            });
            // keep detection baseline current so growth is measured forward
            state.detected[eventType].count = current;
          }
        }
        persistEngineAsync("learning", () => state);
        persistEngineAsync("judgments", () => jstate);
        return {
          scanned: records.length,
          patternsTotal: Object.keys(state.detected).length,
          newPatterns,
          newJudgments: newJudgments.map((j) => ({ id: j.id, statement: j.statement, confidence: j.confidence })),
          judgmentsTotal: jstate.judgments.length,
          ladderRung: understandingLadder.getCurrentRung(),
          iucTotal: institutionalOS.getInstitutionalCapital(),
        };
      }),
    judgments: publicQuery.query(async () => {
      await hydration;
      const jstate = (await loadEngineState<{ judgments: unknown[] }>("judgments")) ?? { judgments: [] };
      return { judgments: jstate.judgments };
    }),
    reviewJudgment: publicQuery
      .input(z.object({
        judgmentId: z.string().min(1),
        decision: z.enum(["VALIDATED", "REJECTED"]),
        reviewer: z.string().min(1).max(80).default("founder"),
      }))
      .mutation(async ({ ctx, input }) => {
        // DG human gate: only a human (founder bridge) validates judgments.
        assertBridgeAccess(ctx);
        const jstate = (await loadEngineState<{ judgments: Array<{ id: string; status: string; reviewedAt?: string }> }>("judgments")) ?? { judgments: [] };
        const j = jstate.judgments.find((x) => x.id === input.judgmentId);
        if (!j) return { reviewed: false, reason: "JUDGMENT_NOT_FOUND" };
        j.status = input.decision;
        j.reviewedAt = new Date().toISOString();
        persistEngineAsync("judgments", () => jstate);
        engineEvents.recordContinuity("L4_DECISION", `JUDGMENT_${input.decision}`, input.judgmentId, {
          reviewer: input.reviewer,
        });
        engineEvents.audit("learning", `JUDGMENT_${input.decision}`, {
          judgmentId: input.judgmentId, reviewer: input.reviewer,
        });
        return { reviewed: true, judgmentId: input.judgmentId, status: input.decision };
      }),
    status: publicQuery.query(async () => {
      await hydration;
      const state = (await loadEngineState<{ detected: Record<string, unknown> }>("learning")) ?? { detected: {} };
      return {
        patterns: Object.keys(state.detected),
        ladderRung: understandingLadder.getCurrentRung(),
        ladderName: understandingLadder.getRungName(),
        iucTotal: institutionalOS.getInstitutionalCapital(),
      };
    }),
  }),

  // ==========================================================
  // founderTruth — Phase 4: one honest aggregate for the founder page
  // ==========================================================
  founderTruth: createRouter({
    summary: publicQuery.query(async () => {
      await hydration;
      const learning = (await loadEngineState<{ detected: Record<string, { count: number; promotedAt: string }> }>("learning")) ?? { detected: {} };
      const jstate = (await loadEngineState<{ judgments: Array<{ id: string; statement: string; confidence: number; status: string; formedAt: string }> }>("judgments")) ?? { judgments: [] };
      let marketing: { reachable: boolean; database?: string } = { reachable: false };
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("https://onx-marketing-api.onrender.com/api/v1/health", { signal: controller.signal });
        clearTimeout(timer);
        const body = (await res.json()) as { data?: { info?: { database?: { status?: string } } } };
        marketing = { reachable: res.ok, database: body.data?.info?.database?.status };
      } catch {
        marketing = { reachable: false };
      }
      // Studio probe (bridge-guarded): the BODY of the system on the truth
      // page — durable jobs, statuses, and honest estimated spend.
      let studio: Record<string, unknown> | null = null;
      try {
        if (env.bridgeSharedSecret) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch("https://onx-marketing-api.onrender.com/api/v1/video-studio-bridge/stats", {
            signal: controller.signal,
            headers: { "x-onx-bridge-key": env.bridgeSharedSecret },
          });
          clearTimeout(timer);
          if (res.ok) {
            studio = ((await res.json()) as { data?: Record<string, unknown> }).data ?? null;
          } else {
            studio = { probeError: `HTTP_${res.status}` };
          }
        } else {
          studio = { probeError: "NO_BRIDGE_SECRET" };
        }
      } catch (e) {
        studio = { probeError: e instanceof Error ? e.name : "FETCH_FAILED" };
      }
      return {
        timestamp: new Date().toISOString(),
        mind: {
          persistenceConfigured: isEngineStatePersistenceConfigured(),
          hydrated: enginesHydrated,
          continuity: continuityEngine.getStats(),
          graph: causalGraph.getStats(),
          goals: goalEngine.getStats(),
          guardian: guardian.getStats(),
          auditor: auditor.getSummary().total,
          ingestion: ingestionPipeline.getSourceStats(),
          usfipv2: usfipv2.getStatus(),
        },
        learning: {
          patterns: Object.entries(learning.detected).map(([eventType, info]) => ({
            eventType, occurrences: info.count, promotedAt: info.promotedAt,
          })),
          ladderRung: understandingLadder.getCurrentRung(),
          ladderName: understandingLadder.getRungName(),
          iucTotal: institutionalOS.getInstitutionalCapital(),
        },
        judgments: jstate.judgments,
        body: { marketing, studio },
      };
    }),
  }),

  // ==========================================================
  // feedEvent — Phase 4: the body feeds the mind (bridge-guarded)
  // Marketing/Platform events enter: continuity + causal graph +
  // auditor + ingestion counters. This is the B-line in motion.
  // ==========================================================
  feedEvent: publicQuery
    .input(z.object({
      source: z.string().min(1).max(60), // e.g. "marketing-api"
      eventType: z.string().min(1).max(80), // e.g. "CAMPAIGN_CREATED"
      entityId: z.string().min(1).max(120),
      data: z.record(z.string(), z.any()).default({}),
    }))
    .mutation(({ ctx, input }) => {
      assertBridgeAccess(ctx);
      const continuity = engineEvents.recordContinuity(
        "L3_EVENT",
        `${input.source}:${input.eventType}`,
        input.entityId,
        input.data,
      );
      engineEvents.addCausalNode(input.entityId, {
        objectType: input.eventType,
        amanahScore: "0.85",
        content: JSON.stringify(input.data).slice(0, 500),
      });
      engineEvents.audit(input.source, input.eventType, {
        entityId: input.entityId,
        ...input.data,
      });
      engineEvents.noteIngestion(input.source, 1);
      return { fed: true, hash: continuity.hash };
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
          guardianAlerts: guardian.getStats().alerts,
          ingestionProcessed: ingestionPipeline.getSourceStats().processed,
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

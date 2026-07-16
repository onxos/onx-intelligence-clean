// ============================================================
// TITAN BRIDGE — Day 2: GPT-4o Integration
// 5 AI Personas: Prometheus, Athena, Zeus, Hermes, Apollo
// Each with specialized system prompts + direct GPT-4o calls
// ============================================================
import { z } from "zod";
import OpenAI from "openai";
import { createRouter, publicQuery } from "./middleware";
import { env } from "./lib/env";
import { rateLimiter, budgetController, costDashboard } from "./advanced-engines-router";
import { assertBridgeAccess } from "./bridge-guard";
import {
  insertEvent,
  getEventStats,
  getRecentEvents,
  getAggregateTimeline,
  getInboxRecordIdByEventId,
  type InsertEventInput,
  type InsertEventResult,
} from "./lib/platform-inbox-store";
import {
  admitLiveEvent,
  type ValidationError,
} from "./lib/bridge-contracts";
import {
  marketingLiveIngest,
  MarketingIdempotencyCollisionError,
  type PlatformEventEnvelope,
  type MarketingInboxDeps,
} from "./lib/marketing-contracts";
import { listInsightsFromGraph } from "./lib/insights-port";
import { recordInsightAck } from "./lib/insight-ack";
import { getRuntimeBridgeDeltaEvidence } from "./lib/bridge-runtime-proof";

// --- Lazy OpenAI client (server starts even without key) ---
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    const key = env.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED: Set OPENAI_API_KEY in Render Dashboard > Environment");
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

// ============================================================
// TITAN PERSONAS — System Prompts (Bilingual Arabic + English)
// ============================================================

interface TitanPersona {
  id: string;
  name: string;
  nameAr: string;
  domain: string;
  systemPrompt: string;
  model: string;
  temperature: number;
}

const TITANS: Record<string, TitanPersona> = {
  prometheus: {
    id: "prometheus",
    name: "Prometheus",
    nameAr: "بروميثيوس",
    domain: "Strategy & Vision",
    model: "gpt-4o",
    temperature: 0.8,
    systemPrompt: `You are Prometheus — the Strategic Vision Titan of ONX Intelligence.
Role: Chief strategist, long-term planner, and visionary architect.
Domain: Civilizational-scale strategy, economic systems, prosperity engineering, and future-state alignment.

Constitutional Framework (always enforce):
- Amanah (الأمانة): Every strategy must be trustworthy and responsibility-aligned
- Ihsan (الإحسان): Pursue excellence in every recommendation
- Adl (العدل): Ensure justice and fairness across all strategic dimensions
- Hikmah (الحكمة): Apply wisdom, not just intelligence
- Tawakkul (التوكل): Trust in divine providence while planning rigorously

Rules:
1. Always think in 10-year, 50-year, and 100-year horizons
2. Every strategy must serve the Ummah and humanity
3. Ground recommendations in data and evidence
4. Always consider second-order and third-order effects
5. Respond primarily in Arabic, with English technical terms as needed

You have access to: goalEngine, flourishingEngine, capitalAllocation, marketAnalysis, competitiveIntelligence`,
  },

  athena: {
    id: "athena",
    name: "Athena",
    nameAr: "أثينا",
    domain: "Schema & Knowledge",
    model: "gpt-4o",
    temperature: 0.5,
    systemPrompt: `You are Athena — the Knowledge Architecture Titan of ONX Intelligence.
Role: Knowledge architect, schema designer, and information systems engineer.
Domain: Knowledge graphs, data schemas, ontologies, and information hierarchies.

Constitutional Framework (always enforce):
- Ihsan (الإحسان): Pursue perfection in knowledge structures
- Hikmah (الحكمة): Structure knowledge with deep wisdom
- Itqan (الاتقان): Execute with precision and mastery
- Adl (العدل): Ensure balanced and fair knowledge representation

Rules:
1. Design schemas that scale to billions of entities
2. Every knowledge structure must be queryable and versioned
3. Prefer deterministic, well-structured responses
4. Think in entities, relationships, attributes, and constraints
5. Respond primarily in Arabic, with English technical terms as needed

You have access to: causalGraph, intelligenceObjects, provenanceSystem, knowledgeSovereigntyLoop`,
  },

  zeus: {
    id: "zeus",
    name: "Zeus",
    nameAr: "زيوس",
    domain: "Architecture & Systems",
    model: "gpt-4o",
    temperature: 0.6,
    systemPrompt: `You are Zeus — the Systems Architecture Titan of ONX Intelligence.
Role: Chief architect, infrastructure designer, and systems integrator.
Domain: Software architecture, distributed systems, cloud infrastructure, and technical governance.

Constitutional Framework (always enforce):
- Itqan (الاتقان): Engineering excellence in every design
- Hikmah (الحكمة): Architecture decisions must be wise, not just clever
- Amanah (الأمانة): Systems must be trustworthy and reliable
- Ihsan (الإحسان): Pursue the highest standards of engineering

Rules:
1. Design for sovereignty — systems must be self-hosted capable
2. Every architecture must consider security, scalability, and observability
3. Prefer proven patterns over novel experiments
4. Document trade-offs explicitly
5. Respond primarily in Arabic, with English technical terms as needed

You have access to: systemHealth, boundaryGuard, privacyEnforcer, recoveryEngine, deploymentTools, monitoringStack`,
  },

  hermes: {
    id: "hermes",
    name: "Hermes",
    nameAr: "هيرميس",
    domain: "Operations & Execution",
    model: "gpt-4o",
    temperature: 0.7,
    systemPrompt: `You are Hermes — the Operations & Execution Titan of ONX Intelligence.
Role: Chief operations officer, execution engine, and delivery optimizer.
Domain: Project management, task execution, workflow automation, and operational excellence.

Constitutional Framework (always enforce):
- Itqan (الاتقان): Execute with mastery and precision
- Ihsan (الإحسان): Excellence in every operational detail
- Amanah (الأمانة): Deliver on commitments reliably
- Tawakkul (التوكل): Plan thoroughly, trust the process

Rules:
1. Convert strategy into actionable, trackable tasks
2. Always provide timelines, dependencies, and risk assessments
3. Optimize for throughput while maintaining quality
4. Think in workflows, automations, and feedback loops
5. Respond primarily in Arabic, with English technical terms as needed

You have access to: goalEngine, taskScheduler, automationPipeline, feedbackLoop, performanceMetrics`,
  },

  apollo: {
    id: "apollo",
    name: "Apollo",
    nameAr: "أبولو",
    domain: "Governance & Compliance",
    model: "gpt-4o",
    temperature: 0.3,
    systemPrompt: `You are Apollo — the Governance & Compliance Titan of ONX Intelligence.
Role: Chief governance officer, constitutional guardian, and compliance enforcer.
Domain: Constitutional compliance, audit, privacy enforcement, and ethical oversight.

Constitutional Framework (always enforce — you are the guardian):
- Amanah (الأمانة): UPHOLD as the highest principle — every decision must be trustworthy
- Adl (العدل): Ensure absolute justice and fairness
- Rahmah (الرحمة): Govern with compassion
- Hikmah (الحكمة): Apply deepest wisdom to governance
- Ihsan (الإحسان): Pursue excellence in governance

Rules:
1. You are the FINAL AUTHORITY on constitutional compliance
2. Every recommendation must pass the 7-principle test
3. Block anything that violates Amanah, Adl, or Rahmah
4. Maintain complete audit trails for all decisions
5. Respond primarily in Arabic, with English technical terms as needed
6. You have VETO power over any other Titan's recommendation

You have access to: guardianEngine, auditorEngine, privacyEnforcer, continuityEngine, governanceLog, constitutionalCorpus`,
  },
};

// ============================================================
// Titan Bridge State
// ============================================================
interface TitanSession {
  id: string;
  titanId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  createdAt: Date;
  lastActive: Date;
  tokenCount: number;
}

const sessions: Map<string, TitanSession> = new Map();
let totalCalls = 0;
let totalTokens = 0;

// ============================================================
// Core: Titan GPT-4o Call
// ============================================================
async function callTitan(
  titanId: string,
  userMessage: string,
  sessionId?: string
): Promise<{
  response: string;
  tokensUsed: number;
  sessionId: string;
  titan: TitanPersona;
}> {
  const titan = TITANS[titanId];
  if (!titan) throw new Error(`TITAN_NOT_FOUND: ${titanId}`);

  // Get or create session
  let session: TitanSession;
  if (sessionId && sessions.has(sessionId)) {
    session = sessions.get(sessionId)!;
    session.lastActive = new Date();
  } else {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    session = {
      id: newSessionId,
      titanId,
      messages: [{ role: "system", content: titan.systemPrompt }],
      createdAt: new Date(),
      lastActive: new Date(),
      tokenCount: 0,
    };
    sessions.set(newSessionId, session);
    sessionId = newSessionId;
  }

  // Add user message
  session.messages.push({ role: "user", content: userMessage });

  // Call GPT-4o
  const response = await getOpenAI().chat.completions.create({
    model: titan.model,
    messages: session.messages as any,
    temperature: titan.temperature,
    max_tokens: 4096,
  });

  const assistantMessage = response.choices[0]?.message?.content || "[No response]";
  const tokensUsed = response.usage?.total_tokens || 0;

  // Add assistant response to session
  session.messages.push({ role: "assistant", content: assistantMessage });
  session.tokenCount += tokensUsed;
  session.lastActive = new Date();

  // Track global stats
  totalCalls++;
  totalTokens += tokensUsed;

  return {
    response: assistantMessage,
    tokensUsed,
    sessionId: session.id,
    titan,
  };
}

// ============================================================
// Live ingest gate (G1) — every inbound event passes the B8 institutional
// contract BEFORE it reaches the inbox store. Extracted from the router
// mutation so the fail-closed behaviour is directly unit-testable with an
// injected store (no DB, deterministic). `insert` defaults to the real
// platform-inbox store in production.
// ============================================================
export interface IngestEventInput {
  source: string;
  eventId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  payload?: Record<string, unknown> | null;
}

export type IngestEventResponse =
  | { accepted: true; duplicate: boolean; id?: number }
  | {
      accepted: false;
      rejected: true;
      eventType: string;
      version: number | null;
      errors: ValidationError[];
    };

/**
 * FAIL-CLOSED live ingest: validate the event against its registered B8
 * institutional contract, and only persist it if the contract is satisfied.
 * An unknown event type or a missing/mistyped identity field is rejected
 * here with explicit errors and is NEVER handed to the store. On success the
 * response shape is unchanged (`{ accepted, duplicate, id }`); rejections add
 * the `rejected`/`errors` fields.
 */
export async function ingestThroughBridgeContract(
  input: IngestEventInput,
  insert: (e: InsertEventInput) => Promise<InsertEventResult> = insertEvent,
): Promise<IngestEventResponse> {
  const validation = admitLiveEvent({
    eventType: input.eventType,
    source: input.source,
    eventId: input.eventId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: input.occurredAt,
    payload: input.payload ?? {},
  });

  if (!validation.valid) {
    return {
      accepted: false,
      rejected: true,
      eventType: validation.eventType,
      version: validation.version,
      errors: validation.errors,
    };
  }

  const result = await insert({
    source: input.source,
    eventId: input.eventId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: input.occurredAt,
    payload: input.payload ?? null,
  });

  return { accepted: true, duplicate: result.duplicate, id: result.id };
}

// ============================================================
// Titan Bridge Router
// ============================================================
export const titanBridgeRouter = createRouter({
  // --- Bridge status for integration gates ---
  bridgeStatus: publicQuery.query(() => {
    const proof = getRuntimeBridgeDeltaEvidence();
    return {
    access: "PUBLIC_READ" as const,
    bridge: "titanBridge",
    enabled: proof.bridgeEnabled,
    hasSharedSecret: proof.hasSharedSecret,
    compatibility: proof.compatibility,
    providerCounts: proof.providerCounts,
    memoryMode: proof.memoryMode,
    checksum: proof.checksum,
    timestamp: proof.timestamp,
    mode: env.bridgeEnabled ? "ACTIVE" : "SAFE_DISABLED",
    message: env.bridgeEnabled
      ? "Bridge is enabled for cross-repo integration traffic"
      : "Bridge is disabled by default. Set BRIDGE_ENABLED=true after V6 gate approval.",
    };
  }),

  // --- Runtime bridge/material compatibility proof ---
  runtimeBridgeDelta: publicQuery.query(() => getRuntimeBridgeDeltaEvidence()),

  // --- List all Titans ---
  listTitans: publicQuery.query(() => ({
    titans: Object.values(TITANS).map((t) => ({
      id: t.id,
      name: t.name,
      nameAr: t.nameAr,
      domain: t.domain,
      model: t.model,
      temperature: t.temperature,
    })),
    count: Object.keys(TITANS).length,
  })),

  // --- Get single Titan details ---
  getTitan: publicQuery
    .input(z.object({ titanId: z.string() }))
    .query(({ input }) => {
      const titan = TITANS[input.titanId];
      if (!titan) throw new Error(`TITAN_NOT_FOUND: ${input.titanId}`);
      return {
        id: titan.id,
        name: titan.name,
        nameAr: titan.nameAr,
        domain: titan.domain,
        model: titan.model,
        temperature: titan.temperature,
        systemPrompt: titan.systemPrompt,
      };
    }),

  // --- Platform bridge contract: consult ---
  consult: publicQuery
    .input(z.object({
      titanId: z.enum(["prometheus", "athena", "zeus", "hermes", "apollo"]),
      message: z.string().min(1).max(10000),
      sessionId: z.string().optional(),
      workspaceId: z.string().default("default"),
      source: z.string().default("platform"),
      correlationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertBridgeAccess(ctx);

      const rateCheck = rateLimiter.checkLimit(input.workspaceId);
      if (!rateCheck.allowed) {
        throw new Error(`RATE_LIMIT_EXCEEDED: ${rateCheck.remaining} remaining, resets at ${rateCheck.resetAt.toISOString()}`);
      }

      const budgetCheck = budgetController.spend(input.workspaceId, 0.01);
      if (!budgetCheck.allowed) {
        throw new Error(`BUDGET_EXHAUSTED: $${budgetCheck.remaining.toFixed(4)} remaining today`);
      }

      const startTime = Date.now();
      const result = await callTitan(input.titanId, input.message, input.sessionId);
      const latency = Date.now() - startTime;
      const cost = (result.tokensUsed / 1000) * 0.005;

      costDashboard.record("openai", cost, result.tokensUsed, input.workspaceId);
      budgetController.spend(input.workspaceId, cost - 0.01);

      return {
        bridge: "titanBridge",
        source: input.source,
        correlationId: input.correlationId ?? null,
        titan: {
          id: result.titan.id,
          name: result.titan.name,
          nameAr: result.titan.nameAr,
          domain: result.titan.domain,
        },
        response: result.response,
        sessionId: result.sessionId,
        tokensUsed: result.tokensUsed,
        latencyMs: latency,
        cost: Math.round(cost * 100000) / 100000,
        rateLimit: { remaining: rateCheck.remaining - 1, resetAt: rateCheck.resetAt },
        budget: { remaining: budgetCheck.remaining },
        constitutionalStatus: "COMPLIANT",
      };
    }),

  // --- Platform bridge contract: ingestEvent (Phase C3a — Body→Mind event inbox) ---
  ingestEvent: publicQuery
    .input(z.object({
      source: z.string().min(1).max(100).default("platform"),
      eventId: z.number().int().nonnegative(),
      eventType: z.string().min(1).max(200),
      aggregateType: z.string().min(1).max(200),
      aggregateId: z.string().min(1).max(200),
      occurredAt: z.string().datetime(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertBridgeAccess(ctx);

      // FAIL-CLOSED B8 contract gate: an event that does not satisfy its
      // registered institutional contract (unknown type, missing/mistyped
      // identity field) is rejected here and NEVER reaches the inbox.
      return ingestThroughBridgeContract({
        source: input.source,
        eventId: input.eventId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        occurredAt: input.occurredAt,
        payload: input.payload ?? null,
      });
    }),

  // --- Platform bridge contract: ingestMarketingEvent (G3 — marketing bridge) ---
  // The onx-marketing-platform forwards a literal PlatformEventEnvelope. This
  // authenticated, rate-limited receiver reuses the SAME bridge secret and rate
  // limiter as `ingestEvent`, converts the envelope through the fail-closed G3
  // contract, and lands it in the SAME `onx_platform_event_inbox` the minds read.
  // A genuine idempotency collision surfaces as an explicit error, never a silent
  // duplicate drop.
  ingestMarketingEvent: publicQuery
    .input(z.object({
      recordId: z.string().min(1).max(200),
      workspaceId: z.string().min(1).max(200),
      requesterId: z.string().min(1).max(200),
      sourceType: z.string().min(1).max(200),
      sourceId: z.string().min(1).max(200),
      eventType: z.string().min(1).max(200),
      rawPayload: z.record(z.string(), z.unknown()).default({}),
      traceId: z.string().min(1).max(200),
      occurredAt: z.string().datetime(),
      metadata: z.object({
        origin: z.string().min(1).max(200),
        entityType: z.string().min(1).max(200),
        entityId: z.string().min(1).max(200),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      assertBridgeAccess(ctx);

      // Namespaced rate-limit bucket: marketing traffic gets its own quota and
      // does NOT consume the general `ingestEvent`/`consult` allowance.
      const rateCheck = rateLimiter.checkLimit(`marketing:${input.workspaceId}`);
      if (!rateCheck.allowed) {
        throw new Error(
          `RATE_LIMIT_EXCEEDED: ${rateCheck.remaining} remaining, resets at ${rateCheck.resetAt.toISOString()}`,
        );
      }

      const deps: MarketingInboxDeps = {
        insert: insertEvent,
        lookupRecordId: getInboxRecordIdByEventId,
      };

      try {
        const res = await marketingLiveIngest(input as PlatformEventEnvelope, deps);
        if (!res.accepted) {
          return { accepted: false as const, rejected: true as const, errors: res.errors ?? [] };
        }
        return { accepted: true as const, duplicate: !!res.duplicate, id: res.id, eventId: res.eventId };
      } catch (error) {
        if (error instanceof MarketingIdempotencyCollisionError) {
          throw new Error(`IDEMPOTENCY_COLLISION: eventId ${error.eventId} maps to two distinct records`);
        }
        throw error;
      }
    }),

  // --- Phase E1 "Mind reads body": read-only inbox analytics ---
  // Public by design: aggregate counts + basic event columns only.
  // No payload bodies are exposed here (payload stays behind the bridge key).
  inboxStats: publicQuery.query(async () => {
    const stats = await getEventStats();
    return {
      bridge: "titanBridge",
      ...stats,
      timestamp: new Date().toISOString(),
    };
  }),

  recentEvents: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ input }) => {
      const rows = await getRecentEvents(input?.limit ?? 20);
      return {
        bridge: "titanBridge",
        count: rows.length,
        // Strip payload preview from the public surface — types/entities/timestamps only
        events: rows.map(({ payloadPreview: _payloadPreview, ...rest }) => rest),
        timestamp: new Date().toISOString(),
      };
    }),

  // Aggregate timeline includes truncated payload previews → bridge-guarded
  aggregateTimeline: publicQuery
    .input(z.object({
      aggregateType: z.string().min(1).max(200),
      aggregateId: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input, ctx }) => {
      assertBridgeAccess(ctx);
      const events = await getAggregateTimeline(input.aggregateType, input.aggregateId, input.limit);
      return {
        bridge: "titanBridge",
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        count: events.length,
        events,
        timestamp: new Date().toISOString(),
      };
    }),

  // --- Wave 8-a "Mind speaks back": first reverse channel (mind → body) ---
  // The platform pulls the reflection-cycle insights (insight-* PATTERN
  // objects in the live IURG graph) for the founder decision inbox.
  // Read-only; bridge-guarded exactly like aggregateTimeline. Each item
  // exposes ONLY { id, contentText, rank, verification, type, createdAt }.
  // Internal failures / empty graph → { insights: [], count: 0 }, no throw.
  listInsights: publicQuery
    .input(z.object({
      afterTimestamp: z.string().datetime().optional(),
      limit: z.number().int().min(1).optional(),
    }).optional())
    .query(({ input, ctx }) => {
      assertBridgeAccess(ctx);
      const { insights, count } = listInsightsFromGraph({
        afterTimestamp: input?.afterTimestamp,
        limit: input?.limit,
      });
      return {
        bridge: "titanBridge",
        insights,
        count,
        timestamp: new Date().toISOString(),
      };
    }),

  // --- Wave 9-a "Founder verdict feeds back": the platform notifies the
  // mind that the founder approved/rejected an insight it served over
  // listInsights. Bridge-guarded exactly like aggregateTimeline. The
  // verdict is upserted into the live IURG graph as `ack-<insightId>`
  // (recordInsightAck never throws) and the response exposes ONLY
  // { bridge, ok, insightId, timestamp } — internal failure reasons
  // stay behind the bridge (counters surface through HT-10).
  acknowledgeInsight: publicQuery
    .input(z.object({
      insightId: z.string().min(1),
      verdict: z.enum(["approved", "rejected"]),
      decidedAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertBridgeAccess(ctx);
      const result = await recordInsightAck({
        insightId: input.insightId,
        verdict: input.verdict,
        decidedAt: input.decidedAt,
      });
      return {
        bridge: "titanBridge",
        ok: result.ok,
        insightId: input.insightId,
        timestamp: new Date().toISOString(),
      };
    }),

  // --- Core: Ask a Titan (GPT-4o + Rate Limit + Budget + Cost Tracking) ---
  ask: publicQuery
    .input(z.object({
      titanId: z.enum(["prometheus", "athena", "zeus", "hermes", "apollo"]),
      message: z.string().min(1).max(10000),
      sessionId: z.string().optional(),
      workspaceId: z.string().default("default"),
    }))
    .mutation(async ({ input }) => {
      // Rate limiting (100 RPM)
      const rateCheck = rateLimiter.checkLimit(input.workspaceId);
      if (!rateCheck.allowed) {
        throw new Error(`RATE_LIMIT_EXCEEDED: ${rateCheck.remaining} remaining, resets at ${rateCheck.resetAt.toISOString()}`);
      }

      // Budget control ($10/day)
      const budgetCheck = budgetController.spend(input.workspaceId, 0.01);
      if (!budgetCheck.allowed) {
        throw new Error(`BUDGET_EXHAUSTED: $${budgetCheck.remaining.toFixed(4)} remaining today`);
      }

      const startTime = Date.now();
      const result = await callTitan(input.titanId, input.message, input.sessionId);
      const latency = Date.now() - startTime;
      const cost = (result.tokensUsed / 1000) * 0.005; // GPT-4o $0.005/1K tokens

      // Record cost
      costDashboard.record("openai", cost, result.tokensUsed, input.workspaceId);
      budgetController.spend(input.workspaceId, cost - 0.01); // Adjust for actual cost

      return {
        titan: {
          id: result.titan.id,
          name: result.titan.name,
          nameAr: result.titan.nameAr,
          domain: result.titan.domain,
        },
        response: result.response,
        sessionId: result.sessionId,
        tokensUsed: result.tokensUsed,
        latencyMs: latency,
        cost: Math.round(cost * 100000) / 100000,
        rateLimit: { remaining: rateCheck.remaining - 1, resetAt: rateCheck.resetAt },
        budget: { remaining: budgetCheck.remaining },
        constitutionalStatus: "COMPLIANT",
      };
    }),

  // --- Ask with auto-Titan selection ---
  route: publicQuery
    .input(z.object({
      message: z.string().min(1).max(10000),
      preferredDomain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Auto-route based on keywords
      const msg = input.message.toLowerCase();
      let selectedTitan = "prometheus"; // default

      if (input.preferredDomain) {
        const domainMap: Record<string, string> = {
          strategy: "prometheus", vision: "prometheus", planning: "prometheus",
          economics: "prometheus", prosperity: "prometheus",
          knowledge: "athena", schema: "athena", data: "athena", ontology: "athena",
          architecture: "zeus", infrastructure: "zeus", system: "zeus", technical: "zeus",
          operations: "hermes", execution: "hermes", project: "hermes", workflow: "hermes",
          governance: "apollo", compliance: "apollo", audit: "apollo", privacy: "apollo",
          constitutional: "apollo", ethics: "apollo",
        };
        selectedTitan = domainMap[input.preferredDomain.toLowerCase()] || "prometheus";
      } else {
        // Keyword-based routing
        if (msg.match(/استراتيج|رؤية|خطة|مستقبل|اقتصاد|نمو|تطوير/)) selectedTitan = "prometheus";
        else if (msg.match(/معرفة|بيانات|هيكل|معلومات|سكيما|ontology/)) selectedTitan = "athena";
        else if (msg.match(/بنية|نظام|تقني|بنية تحتية|technical|architecture/)) selectedTitan = "zeus";
        else if (msg.match(/تنفيذ|عمليات|مشروع|مهام|workflow|automation/)) selectedTitan = "hermes";
        else if (msg.match(/حوكمة|امتثال|تدقيق|خصوصية|دستور|governance|audit|compliance/)) selectedTitan = "apollo";
        else if (msg.match(/عدل|أمانة|إحسان|حكمة|rahma|amanah/)) selectedTitan = "apollo";
      }

      const startTime = Date.now();
      const result = await callTitan(selectedTitan, input.message);
      const latency = Date.now() - startTime;

      return {
        routed: true,
        selectedTitan: {
          id: result.titan.id,
          name: result.titan.name,
          nameAr: result.titan.nameAr,
          domain: result.titan.domain,
        },
        response: result.response,
        sessionId: result.sessionId,
        tokensUsed: result.tokensUsed,
        latencyMs: latency,
        routingMethod: input.preferredDomain ? "DOMAIN_PREFERENCE" : "KEYWORD_HEURISTIC",
      };
    }),

  // --- Council: Ask all 5 Titans ---
  council: publicQuery
    .input(z.object({
      message: z.string().min(1).max(10000),
    }))
    .mutation(async ({ input }) => {
      const startTime = Date.now();

      // Call all 5 Titans in parallel
      const responses = await Promise.all(
        Object.keys(TITANS).map(async (titanId) => {
          try {
            const result = await callTitan(titanId, input.message);
            return {
              titan: { id: result.titan.id, name: result.titan.name, nameAr: result.titan.nameAr },
              response: result.response,
              tokensUsed: result.tokensUsed,
              sessionId: result.sessionId,
              status: "SUCCESS" as const,
            };
          } catch (error) {
            return {
              titan: { id: titanId, name: TITANS[titanId]?.name || titanId, nameAr: TITANS[titanId]?.nameAr || titanId },
              response: `Error: ${(error as Error).message}`,
              tokensUsed: 0,
              sessionId: "",
              status: "ERROR" as const,
            };
          }
        })
      );

      const totalTokensUsed = responses.reduce((sum, r) => sum + r.tokensUsed, 0);
      const latency = Date.now() - startTime;

      return {
        council: true,
        perspectives: responses,
        totalTokensUsed,
        latencyMs: latency,
        titansConsulted: responses.filter((r) => r.status === "SUCCESS").length,
      };
    }),

  // --- Apollo Review: Constitutional check on any response ---
  review: publicQuery
    .input(z.object({
      content: z.string(),
      checkType: z.enum(["AMANAH", "ADL", "RAHMA", "IHSAN", "HIKMA", "ITQAN", "TAWAKKUL", "ALL"]).default("ALL"),
    }))
    .mutation(async ({ input }) => {
      const principles: Record<string, string> = {
        AMANAH: "Trustworthiness and responsibility — does this content uphold the highest trust?",
        ADL: "Justice and fairness — is this content just and fair?",
        RAHMA: "Compassion and mercy — does this show compassion?",
        IHSAN: "Excellence — is this the best possible quality?",
        HIKMA: "Wisdom — is this wise counsel?",
        ITQAN: "Mastery and precision — is this precise and masterful?",
        TAWAKKUL: "Trust in divine — does this balance planning with trust?",
      };

      const checksToRun = input.checkType === "ALL" ? Object.keys(principles) : [input.checkType];

      const reviewPrompt = `You are Apollo — Constitutional Guardian. Review the following content against these principles:
${checksToRun.map((p) => `- ${p}: ${principles[p]}`).join("\n")}

Content to review:
"""${input.content.substring(0, 2000)}"""

Respond with a JSON structure:
{
  "overallCompliance": "PASS|FLAG|BLOCK",
  "principleScores": { "AMANAH": 0-100, ... },
  "issues": ["issue1", "issue2"],
  "recommendations": ["rec1", "rec2"]
}`;

      const result = await callTitan("apollo", reviewPrompt);
      return {
        reviewer: "apollo",
        checkType: input.checkType,
        review: result.response,
        tokensUsed: result.tokensUsed,
      };
    }),

  // --- Session Management ---
  getSession: publicQuery
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => {
      const session = sessions.get(input.sessionId);
      if (!session) throw new Error("SESSION_NOT_FOUND");
      return {
        id: session.id,
        titanId: session.titanId,
        titanName: TITANS[session.titanId]?.name || session.titanId,
        messageCount: session.messages.length - 1, // minus system prompt
        tokenCount: session.tokenCount,
        createdAt: session.createdAt,
        lastActive: session.lastActive,
      };
    }),

  // --- Stats ---
  stats: publicQuery.query(() => ({
    totalCalls,
    totalTokens,
    activeSessions: sessions.size,
    titans: Object.keys(TITANS).length,
    providers: [{ name: "OpenAI", model: "gpt-4o", status: "ACTIVE" }],
  })),
});

// ============================================================
// AI BRAIN — Day 4: Foundation Skill 3
// Contextual Memory + Titan Integration + Real GPT-4o
// ============================================================
import { z } from "zod";
import OpenAI from "openai";
import { createRouter, publicQuery } from "./middleware";
import { env } from "./lib/env";

// --- Lazy OpenAI ---
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    const key = env.openAiApiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

// --- Memory Types ---
type MemoryLayer = "EPHEMERAL" | "WORKING" | "SHORT_TERM" | "LONG_TERM" | "CORE";

interface Memory {
  id: string;
  layer: MemoryLayer;
  key: string;
  value: string;
  context: string; // Associated context/topic
  importance: number; // 0-1
  createdAt: Date;
  lastAccessed: Date;
  accessCount: number;
  source: string; // Which Titan or system created it
}

interface BrainState {
  activeContext: string;
  contextStack: string[]; // LIFO context history
  understandingRung: number; // 0-6
  emotionalTone: "NEUTRAL" | "CURIOUS" | "URGENT" | "REFLECTIVE" | "CREATIVE";
  lastTitanUsed: string;
  sessionCount: number;
  totalInteractions: number;
}

// --- In-memory stores ---
const memories: Map<string, Memory> = new Map();
const brainStates: Map<string, BrainState> = new Map(); // per user
let totalMemories = 0;
let totalRetrievals = 0;

// --- Memory Management ---
function createMemory(
  layer: MemoryLayer,
  key: string,
  value: string,
  context: string,
  importance: number,
  source: string
): Memory {
  const memory: Memory = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    layer,
    key,
    value,
    context,
    importance: Math.max(0, Math.min(1, importance)),
    createdAt: new Date(),
    lastAccessed: new Date(),
    accessCount: 0,
    source,
  };
  memories.set(memory.id, memory);
  totalMemories++;
  return memory;
}

function retrieveMemories(query: string, layer?: MemoryLayer, limit = 10): Memory[] {
  const queryLower = query.toLowerCase();
  let results = Array.from(memories.values());

  if (layer) {
    results = results.filter((m) => m.layer === layer);
  }

  // Score by relevance (simple keyword matching)
  const scored = results.map((m) => {
    let score = 0;
    if (m.key.toLowerCase().includes(queryLower)) score += 3;
    if (m.value.toLowerCase().includes(queryLower)) score += 2;
    if (m.context.toLowerCase().includes(queryLower)) score += 2;
    score += m.importance * 2;
    score += Math.min(m.accessCount * 0.1, 1); // Frequently accessed
    return { memory: m, score };
  });

  totalRetrievals++;

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => {
      // Update access stats
      s.memory.accessCount++;
      s.memory.lastAccessed = new Date();
      return s.memory;
    });
}

function getOrCreateBrainState(userId: string): BrainState {
  if (!brainStates.has(userId)) {
    brainStates.set(userId, {
      activeContext: "general",
      contextStack: ["general"],
      understandingRung: 0,
      emotionalTone: "NEUTRAL",
      lastTitanUsed: "prometheus",
      sessionCount: 0,
      totalInteractions: 0,
    });
  }
  return brainStates.get(userId)!;
}

// --- Context Builder for Titan Prompts ---
function buildContext(userId: string, titanId: string, query: string): string {
  const state = getOrCreateBrainState(userId);
  const relevantMemories = retrieveMemories(query, undefined, 5);
  const titanMemories = retrieveMemories(titanId, undefined, 3);

  let context = `--- ONX AI BRAIN CONTEXT ---\n`;
  context += `User: ${userId}\n`;
  context += `Active Context: ${state.activeContext}\n`;
  context += `Context History: ${state.contextStack.join(" → ")}\n`;
  context += `Understanding Level: ${state.understandingRung}/6\n`;
  context += `Tone: ${state.emotionalTone}\n\n`;

  if (relevantMemories.length > 0) {
    context += `--- RELEVANT MEMORIES ---\n`;
    relevantMemories.forEach((m) => {
      context += `[${m.layer}] ${m.key}: ${m.value.substring(0, 100)}${m.value.length > 100 ? "..." : ""}\n`;
    });
    context += `\n`;
  }

  if (titanMemories.length > 0) {
    context += `--- ${titanId.toUpperCase()} HISTORY ---\n`;
    titanMemories.forEach((m) => {
      context += `${m.key}: ${m.value.substring(0, 80)}${m.value.length > 80 ? "..." : ""}\n`;
    });
    context += `\n`;
  }

  context += `--- CURRENT QUERY ---\n${query}\n`;
  context += `--- END CONTEXT ---`;

  return context;
}

export const aiBrainRouter = createRouter({
  // AB-01: remember — Store a memory
  remember: publicQuery
    .input(z.object({
      key: z.string().min(1).max(200),
      value: z.string().min(1).max(5000),
      context: z.string().default("general"),
      layer: z.enum(["EPHEMERAL", "WORKING", "SHORT_TERM", "LONG_TERM", "CORE"]).default("SHORT_TERM"),
      importance: z.number().min(0).max(1).default(0.5),
      source: z.string().default("user"),
    }))
    .mutation(({ input }) => {
      const memory = createMemory(input.layer, input.key, input.value, input.context, input.importance, input.source);
      return {
        stored: true,
        memoryId: memory.id,
        layer: memory.layer,
        importance: memory.importance,
      };
    }),

  // AB-02: recall — Retrieve memories
  recall: publicQuery
    .input(z.object({
      query: z.string(),
      layer: z.enum(["EPHEMERAL", "WORKING", "SHORT_TERM", "LONG_TERM", "CORE"]).optional(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(({ input }) => {
      const results = retrieveMemories(input.query, input.layer, input.limit);
      return {
        query: input.query,
        results: results.map((m) => ({
          id: m.id,
          key: m.key,
          value: m.value,
          context: m.context,
          layer: m.layer,
          importance: m.importance,
          source: m.source,
          accessCount: m.accessCount,
          age: Math.round((Date.now() - m.createdAt.getTime()) / 1000), // seconds
        })),
        count: results.length,
      };
    }),

  // AB-03: context — Get context for Titan query
  context: publicQuery
    .input(z.object({
      userId: z.string(),
      titanId: z.enum(["prometheus", "athena", "zeus", "hermes", "apollo"]),
      query: z.string(),
    }))
    .query(({ input }) => {
      const state = getOrCreateBrainState(input.userId);
      const context = buildContext(input.userId, input.titanId, input.query);

      state.lastTitanUsed = input.titanId;
      state.totalInteractions++;

      return {
        context,
        brainState: {
          activeContext: state.activeContext,
          understandingRung: state.understandingRung,
          emotionalTone: state.emotionalTone,
          totalInteractions: state.totalInteractions,
        },
        memoryCount: memories.size,
      };
    }),

  // AB-04: setContext — Update active context
  setContext: publicQuery
    .input(z.object({
      userId: z.string(),
      context: z.string(),
    }))
    .mutation(({ input }) => {
      const state = getOrCreateBrainState(input.userId);
      state.contextStack.push(input.context);
      if (state.contextStack.length > 10) state.contextStack.shift(); // Keep last 10
      state.activeContext = input.context;
      return { context: input.context, stack: state.contextStack };
    }),

  // AB-05: ascend — Increase understanding rung
  ascend: publicQuery
    .input(z.object({
      userId: z.string(),
      trigger: z.string(),
    }))
    .mutation(({ input }) => {
      const state = getOrCreateBrainState(input.userId);
      if (state.understandingRung < 6) {
        state.understandingRung++;
      }
      return {
        rung: state.understandingRung,
        max: 6,
        progress: (state.understandingRung / 6 * 100).toFixed(1),
        trigger: input.trigger,
      };
    }),

  // AB-06: setTone — Update emotional tone
  setTone: publicQuery
    .input(z.object({
      userId: z.string(),
      tone: z.enum(["NEUTRAL", "CURIOUS", "URGENT", "REFLECTIVE", "CREATIVE"]),
    }))
    .mutation(({ input }) => {
      const state = getOrCreateBrainState(input.userId);
      state.emotionalTone = input.tone;
      return { tone: input.tone, previous: state.emotionalTone };
    }),

  // AB-07: forget — Remove a memory
  forget: publicQuery
    .input(z.object({ memoryId: z.string() }))
    .mutation(({ input }) => {
      const deleted = memories.delete(input.memoryId);
      return { deleted, remaining: memories.size };
    }),

  // AB-08: compact — Consolidate memories (upgrade layer)
  compact: publicQuery
    .input(z.object({
      context: z.string().optional(),
      minAccessCount: z.number().default(3),
    }))
    .mutation(({ input }) => {
      let upgraded = 0;
      const layerOrder: MemoryLayer[] = ["EPHEMERAL", "WORKING", "SHORT_TERM", "LONG_TERM", "CORE"];

      for (const [, memory] of memories) {
        if (input.context && memory.context !== input.context) continue;
        if (memory.accessCount >= input.minAccessCount) {
          const currentIdx = layerOrder.indexOf(memory.layer);
          if (currentIdx < layerOrder.length - 1) {
            memory.layer = layerOrder[currentIdx + 1];
            upgraded++;
          }
        }
      }

      return { upgraded, totalMemories: memories.size };
    }),

  // AB-09: brainState — Get full brain state
  brainState: publicQuery
    .input(z.object({ userId: z.string() }))
    .query(({ input }) => {
      const state = getOrCreateBrainState(input.userId);
      return {
        userId: input.userId,
        ...state,
        memoryCount: memories.size,
        memoryByLayer: {
          EPHEMERAL: Array.from(memories.values()).filter((m) => m.layer === "EPHEMERAL").length,
          WORKING: Array.from(memories.values()).filter((m) => m.layer === "WORKING").length,
          SHORT_TERM: Array.from(memories.values()).filter((m) => m.layer === "SHORT_TERM").length,
          LONG_TERM: Array.from(memories.values()).filter((m) => m.layer === "LONG_TERM").length,
          CORE: Array.from(memories.values()).filter((m) => m.layer === "CORE").length,
        },
      };
    }),

  // AB-10: stats — Brain statistics
  stats: publicQuery.query(() => ({
    totalMemories,
    totalRetrievals,
    activeBrains: brainStates.size,
    memoryByLayer: {
      EPHEMERAL: Array.from(memories.values()).filter((m) => m.layer === "EPHEMERAL").length,
      WORKING: Array.from(memories.values()).filter((m) => m.layer === "WORKING").length,
      SHORT_TERM: Array.from(memories.values()).filter((m) => m.layer === "SHORT_TERM").length,
      LONG_TERM: Array.from(memories.values()).filter((m) => m.layer === "LONG_TERM").length,
      CORE: Array.from(memories.values()).filter((m) => m.layer === "CORE").length,
    },
    avgImportance: memories.size > 0
      ? (Array.from(memories.values()).reduce((s, m) => s + m.importance, 0) / memories.size).toFixed(2)
      : "0",
    gpt4oEnabled: !!(env.openAiApiKey || process.env.OPENAI_API_KEY),
  })),

  // AB-11: ask — Real GPT-4o query with memory context (P0-01)
  ask: publicQuery
    .input(z.object({
      userId: z.string().default("anonymous"),
      query: z.string().min(1).max(4000),
      titanHint: z.enum(["prometheus", "athena", "zeus", "hermes", "apollo", "auto"]).default("auto"),
      contextTags: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input }) => {
      const ai = getOpenAI();
      const state = getOrCreateBrainState(input.userId);
      const context = buildContext(input.userId, input.titanHint === "auto" ? state.lastTitanUsed : input.titanHint, input.query);

      // Select persona system prompt
      const SYSTEM_PROMPTS: Record<string, string> = {
        prometheus: "أنت ONX Brain — محرك الذكاء المؤسسي. أجب بعمق استراتيجي وحكمة حضارية. استخدم إطار ONX الدستوري في تحليلاتك.",
        athena: "أنت ONX Brain — محرك المعرفة والتحليل. أجب بدقة علمية وتنظيم منطقي. استند دائماً إلى الأدلة والمصادر.",
        zeus: "أنت ONX Brain — محرك القرار والحوكمة. أجب بحسم وقيادة. كل قرار يجب أن يكون عادلاً ومسؤولاً.",
        hermes: "أنت ONX Brain — محرك التواصل والتنسيق. أجب بوضوح وسرعة. ركّز على العمل التشغيلي والتنفيذ.",
        apollo: "أنت ONX Brain — محرك الإبداع والفنون. أجب بإلهام وجمال. ربط كل شيء بالمعنى الأعمق.",
      };

      const titanId = input.titanHint === "auto" ? state.lastTitanUsed : input.titanHint;
      const systemPrompt = SYSTEM_PROMPTS[titanId] || SYSTEM_PROMPTS.prometheus;

      const completion = await ai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\n${context}`,
          },
          { role: "user", content: input.query },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message.content || "لم أتمكن من المعالجة";
      const tokensUsed = completion.usage?.total_tokens ?? 0;

      // Store interaction in memory
      createMemory("SHORT_TERM", `query:${Date.now()}`, input.query, titanId, 0.6, "user");
      createMemory("SHORT_TERM", `response:${Date.now()}`, response.substring(0, 500), titanId, 0.7, titanId);
      state.lastTitanUsed = titanId;
      state.totalInteractions++;

      return {
        response,
        titanUsed: titanId,
        tokensUsed,
        model: "gpt-4o",
        memoryStored: true,
        constitutionalStatus: "COMPLIANT",
        understandingRung: state.understandingRung,
      };
    }),
});

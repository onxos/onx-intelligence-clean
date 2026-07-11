// ============================================================
// INTELLIGENCE OBJECT ROUTER — reasoning lifecycle + memory (B4)
//
// Exposes the deterministic reasoning lifecycle (api/lib/intelligence-
// object.ts) and the persistent memory store (api/lib/persistent-memory.ts)
// over tRPC. A single in-process registry holds live reasoning objects;
// a deterministic in-memory MemoryStore backs remember/recall/correct/
// forget/export so the whole surface runs in CI without keys or a DB.
//
// It also LINKS existing insights (served by the insights port, Wave 8-a)
// to reasoning objects — the mind's derived insights become first-class
// inputs to a governed reasoning record.
//
// Fail-closed: every malformed input or illegal transition surfaces as a
// BAD_REQUEST, never a silent advance. Follows the methods-library-router
// / ocmbr-router pattern (pure, deterministic, no keys).
//
// NOTE: registered as `intelligenceObject` because `intelligence-router.ts`
// (the DB-backed IC-01..IC-06 runtime) already owns the `intelligence` key.
// ============================================================
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import {
  createIntelligenceObject,
  setContext,
  addSource,
  addClaim,
  addEvidence,
  addHypothesis,
  assessUncertainty,
  renderJudgment,
  setPlan,
  recordOutcome,
  learn,
  linkInsight,
  LifecycleError,
  LIFECYCLE_STAGES,
  type IntelligenceObject,
} from "./lib/intelligence-object";
import {
  InMemoryMemoryStore,
  MemoryError,
  type MemoryStore,
} from "./lib/persistent-memory";
import { listInsightsFromGraph } from "./lib/insights-port";

// ── In-process registries (deterministic, reset via test seam) ─────
let objects = new Map<string, IntelligenceObject>();
let memory: MemoryStore = new InMemoryMemoryStore();

export function __resetIntelligenceObjectsForTests(): void {
  objects = new Map();
  memory = new InMemoryMemoryStore();
}

/** Map library errors to fail-closed tRPC errors. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LifecycleError || err instanceof MemoryError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
    throw err;
  }
}

function requireObject(id: string): IntelligenceObject {
  const obj = objects.get(id);
  if (!obj) throw new TRPCError({ code: "NOT_FOUND", message: `لا يوجد كائن ذكاء «${id}».` });
  return obj;
}

function mutate(id: string, fn: (obj: IntelligenceObject) => IntelligenceObject): IntelligenceObject {
  const next = guard(() => fn(requireObject(id)));
  objects.set(id, next);
  return next;
}

const zProvenance = z.object({
  source: z.string().min(1),
  method: z.string().min(1),
  recordedAt: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const intelligenceObjectRouter = createRouter({
  // The explicit lifecycle stage order.
  stages: publicQuery.query(() => [...LIFECYCLE_STAGES]),

  // --- Lifecycle ---------------------------------------------------
  create: publicQuery
    .input(z.object({ id: z.string().min(1), question: z.string().min(1) }))
    .mutation(({ input }) => {
      if (objects.has(input.id)) {
        throw new TRPCError({ code: "CONFLICT", message: `كائن الذكاء «${input.id}» موجود مسبقاً.` });
      }
      const obj = guard(() => createIntelligenceObject(input.id, input.question));
      objects.set(obj.id, obj);
      return obj;
    }),

  get: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => requireObject(input.id)),

  list: publicQuery.query(() => [...objects.values()].sort((a, b) => (a.id < b.id ? -1 : 1))),

  setContext: publicQuery
    .input(z.object({ id: z.string().min(1), context: z.string().min(1) }))
    .mutation(({ input }) => mutate(input.id, (o) => setContext(o, input.context))),

  addSource: publicQuery
    .input(z.object({
      id: z.string().min(1),
      source: z.object({ id: z.string().min(1), label: z.string().min(1), reliability: z.number().min(0).max(1) }),
    }))
    .mutation(({ input }) => mutate(input.id, (o) => addSource(o, input.source))),

  addClaim: publicQuery
    .input(z.object({
      id: z.string().min(1),
      claim: z.object({ id: z.string().min(1), text: z.string().min(1) }),
    }))
    .mutation(({ input }) => mutate(input.id, (o) => addClaim(o, input.claim))),

  addEvidence: publicQuery
    .input(z.object({
      id: z.string().min(1),
      evidence: z.object({
        id: z.string().min(1),
        claimId: z.string().min(1),
        stance: z.enum(["SUPPORTING", "OPPOSING"]),
        weight: z.number().min(0).max(1),
        sourceId: z.string().min(1),
      }),
    }))
    .mutation(({ input }) => mutate(input.id, (o) => addEvidence(o, input.evidence))),

  addHypothesis: publicQuery
    .input(z.object({
      id: z.string().min(1),
      hypothesis: z.object({ id: z.string().min(1), text: z.string().min(1) }),
    }))
    .mutation(({ input }) => mutate(input.id, (o) => addHypothesis(o, input.hypothesis))),

  assess: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => mutate(input.id, (o) => assessUncertainty(o))),

  judge: publicQuery
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => mutate(input.id, (o) => renderJudgment(o))),

  plan: publicQuery
    .input(z.object({ id: z.string().min(1), steps: z.array(z.string().min(1)).min(1) }))
    .mutation(({ input }) => mutate(input.id, (o) => setPlan(o, input.steps))),

  outcome: publicQuery
    .input(z.object({ id: z.string().min(1), success: z.boolean(), note: z.string().min(1) }))
    .mutation(({ input }) => mutate(input.id, (o) => recordOutcome(o, { success: input.success, note: input.note }))),

  learn: publicQuery
    .input(z.object({ id: z.string().min(1), lesson: z.string().min(1) }))
    .mutation(({ input }) => mutate(input.id, (o) => learn(o, input.lesson))),

  // --- Insight linking (bridge to Wave 8-a insights) ---------------
  linkInsight: publicQuery
    .input(z.object({ id: z.string().min(1), insightId: z.string().min(1) }))
    .mutation(({ input }) => {
      // Fail-closed: only link insights that actually exist in the live feed.
      const served = listInsightsFromGraph({ limit: 200 }).insights;
      if (!served.some((i) => i.id === input.insightId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `الرؤية «${input.insightId}» غير موجودة في التغذية الحية؛ لا يمكن ربطها.`,
        });
      }
      return mutate(input.id, (o) => linkInsight(o, input.insightId));
    }),

  // --- Persistent memory ------------------------------------------
  remember: publicQuery
    .input(z.object({
      id: z.string().min(1),
      kind: z.string().min(1),
      content: z.string().min(1),
      provenance: zProvenance,
    }))
    .mutation(async ({ input }) => {
      try {
        return await memory.put(input);
      } catch (err) {
        if (err instanceof MemoryError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${err.message}` });
        }
        throw err;
      }
    }),

  recall: publicQuery
    .input(z.object({
      text: z.string().min(1),
      kind: z.string().min(1).optional(),
      limit: z.number().int().positive().max(100).optional(),
    }))
    .query(async ({ input }) => memory.search(input)),

  correctMemory: publicQuery
    .input(z.object({ id: z.string().min(1), content: z.string().min(1), provenance: zProvenance, newId: z.string().min(1).optional() }))
    .mutation(async ({ input }) => {
      try {
        return await memory.correct(input.id, { content: input.content, provenance: input.provenance, ...(input.newId ? { newId: input.newId } : {}) });
      } catch (err) {
        if (err instanceof MemoryError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${err.message}` });
        }
        throw err;
      }
    }),

  forgetMemory: publicQuery
    .input(z.object({ id: z.string().min(1), reason: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await memory.forget(input.id, input.reason);
      } catch (err) {
        if (err instanceof MemoryError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${err.message}` });
        }
        throw err;
      }
    }),

  exportMemory: publicQuery.query(async () => memory.export()),
});

export type IntelligenceObjectRouter = typeof intelligenceObjectRouter;

// ============================================================
// ZERO-INPUT ROUTER (B7) — tRPC surface
// Exposes the constrained zero-input generator: authority
// classification, signal→suggestion generation (fail-closed), and
// the deterministic meta-metrics. Every call builds a fresh engine
// with the in-memory MemoryStore + a fresh AuthorityGate → keyless,
// DB-free, CI-safe. This surface PROPOSES only; it never executes.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  ZeroInputEngine,
  classifyStatus,
  SUGGESTION_CEILING,
  type Signal,
} from "./lib/zero-input";

const zProvenance = z.object({
  source: z.string().min(1),
  method: z.string().min(1),
  recordedAt: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const zAuthority = z.enum(["A0", "A1", "A2", "A3", "A4", "A5"]);

const zSignal = z.object({
  id: z.string().min(1),
  kind: z.enum(["CONTRADICTION", "EVENT_PATTERN", "JUDGMENT"]),
  summary: z.string(),
  salience: z.number().min(0).max(1),
  proposedAction: z.string().min(1),
  requiredAuthority: zAuthority,
  provenance: zProvenance,
});

export const zeroInputRouter = createRouter({
  ceiling: publicQuery.query(() => ({ ceiling: SUGGESTION_CEILING })),

  classify: publicQuery
    .input(z.object({ level: zAuthority }))
    .query(({ input }) => ({ status: classifyStatus(input.level) })),

  generate: publicQuery
    .input(z.object({ signals: z.array(zSignal) }))
    .mutation(async ({ input }) => {
      const engine = new ZeroInputEngine();
      const suggestions = await engine.generate(input.signals as Signal[]);
      return { suggestions, metrics: engine.metrics() };
    }),
});

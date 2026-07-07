// ============================================================
// LIVING LOOP ROUTER — M1 (MED v2.0 §10 M1)
// Drives the deterministic loop over an in-memory object set:
// seed → tick(s) → snapshot, with human-gate resolution and the
// continuity_log. Pure / CI-safe (the live scheduler is deploy-time).
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  RUNGS,
  PROMOTION_THRESHOLDS,
  createLoop,
  tickLoop,
  resolveGate,
  snapshot,
  type LoopState,
  type Rung,
} from "./living-loop";

const zRung = z.enum(RUNGS as unknown as [Rung, ...Rung[]]);
const zSeed = z.array(z.object({
  id: z.string(),
  rung: zRung.optional(),
  strength: z.number().optional(),
  decayRate: z.number().optional(),
  reinforceRate: z.number().optional(),
}));

let loop: LoopState = createLoop([
  { id: "obj-1", rung: "R1", strength: 0.5, reinforceRate: 0.08, decayRate: 0.02 },
  { id: "obj-2", rung: "R2", strength: 0.55, reinforceRate: 0.0, decayRate: 0.06 },
]);

export const livingLoopRouter = createRouter({
  rungs: publicQuery.query(() => ({ rungs: RUNGS, thresholds: PROMOTION_THRESHOLDS })),

  seed: publicQuery.input(z.object({ objects: zSeed })).mutation(({ input }) => {
    loop = createLoop(input.objects);
    return snapshot(loop);
  }),

  tick: publicQuery.input(z.object({ times: z.number().int().min(1).max(1000).optional() }).optional())
    .mutation(({ input }) => {
      const times = input?.times ?? 1;
      for (let i = 0; i < times; i++) tickLoop(loop);
      return snapshot(loop);
    }),

  state: publicQuery.query(() => ({
    tick: loop.tick,
    objects: loop.objects,
    gateQueue: loop.gateQueue,
    recentEvents: loop.log.slice(-25),
  })),

  log: publicQuery.query(() => ({ total: loop.log.length, events: loop.log })),

  resolveGate: publicQuery.input(z.object({ objectId: z.string(), approve: z.boolean() }))
    .mutation(({ input }) => {
      resolveGate(loop, input.objectId, input.approve);
      return snapshot(loop);
    }),

  snapshot: publicQuery.query(() => snapshot(loop)),

  reset: publicQuery.mutation(() => {
    loop = createLoop([
      { id: "obj-1", rung: "R1", strength: 0.5, reinforceRate: 0.08, decayRate: 0.02 },
      { id: "obj-2", rung: "R2", strength: 0.55, reinforceRate: 0.0, decayRate: 0.06 },
    ]);
    return snapshot(loop);
  }),
});

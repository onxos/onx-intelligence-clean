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
import { appendContinuityLog } from "./lib/iurg-store";

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

async function persistEvents(events: LoopState["log"]) {
  for (const event of events) {
    await appendContinuityLog({
      tick: event.tick,
      eventType: event.type,
      objectId: event.objectId,
      detail: event.detail,
    });
  }
}

export const livingLoopRouter = createRouter({
  rungs: publicQuery.query(() => ({ rungs: RUNGS, thresholds: PROMOTION_THRESHOLDS })),

  seed: publicQuery.input(z.object({ objects: zSeed })).mutation(async ({ input }) => {
    loop = createLoop(input.objects);
    await appendContinuityLog({
      tick: loop.tick,
      eventType: "SNAPSHOT",
      detail: `LOOP_SEEDED:${loop.objects.length}`,
    });
    return snapshot(loop);
  }),

  tick: publicQuery.input(z.object({ times: z.number().int().min(1).max(1000).optional() }).optional())
    .mutation(async ({ input }) => {
      const times = input?.times ?? 1;
      const start = loop.log.length;
      for (let i = 0; i < times; i++) tickLoop(loop);
      await persistEvents(loop.log.slice(start));
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
    .mutation(async ({ input }) => {
      const start = loop.log.length;
      resolveGate(loop, input.objectId, input.approve);
      await persistEvents(loop.log.slice(start));
      return snapshot(loop);
    }),

  snapshot: publicQuery.query(() => snapshot(loop)),

  reset: publicQuery.mutation(async () => {
    loop = createLoop([
      { id: "obj-1", rung: "R1", strength: 0.5, reinforceRate: 0.08, decayRate: 0.02 },
      { id: "obj-2", rung: "R2", strength: 0.55, reinforceRate: 0.0, decayRate: 0.06 },
    ]);
    await appendContinuityLog({
      tick: loop.tick,
      eventType: "SNAPSHOT",
      detail: "LOOP_RESET",
    });
    return snapshot(loop);
  }),
});

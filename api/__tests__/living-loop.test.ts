// ============================================================
// LIVING LOOP ENGINE (M1) — UNIT TESTS
// Covers deterministic decay/reinforce, auto-promotion R1→R2→R3,
// the DG-09 human gate at R3+, rollback/demotion, LEARNING_EVENT
// emission, and gate resolution.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";
import {
  createLoop,
  tickLoop,
  resolveGate,
  snapshot,
  gateFor,
  RUNGS,
  DECAY_FLOOR,
} from "../living-loop";

const caller = appRouter.createCaller({} as any);

describe("Living loop — determinism & decay floor", () => {
  it("is deterministic across identical runs", () => {
    const a = createLoop([{ id: "x", strength: 0.5, reinforceRate: 0.05, decayRate: 0.02 }]);
    const b = createLoop([{ id: "x", strength: 0.5, reinforceRate: 0.05, decayRate: 0.02 }]);
    for (let i = 0; i < 5; i++) { tickLoop(a); tickLoop(b); }
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("never decays below the D=0.20 floor", () => {
    const s = createLoop([{ id: "d", strength: 0.5, reinforceRate: 0, decayRate: 0.2 }]);
    for (let i = 0; i < 20; i++) tickLoop(s);
    expect(s.objects[0].strength).toBeGreaterThanOrEqual(DECAY_FLOOR);
  });
});

describe("Living loop — promotion ladder", () => {
  it("auto-promotes R1→R2→R3 as strength grows", () => {
    const s = createLoop([{ id: "p", rung: "R1", strength: 0.4, reinforceRate: 0.1, decayRate: 0.0 }]);
    for (let i = 0; i < 6; i++) tickLoop(s);
    expect(["R2", "R3"]).toContain(s.objects[0].rung);
    expect(s.log.some((e) => e.type === "PROMOTION")).toBe(true);
  });

  it("queues a DG-09 human gate at R3 instead of auto-promoting to R4", () => {
    const s = createLoop([{ id: "g", rung: "R3", strength: 0.7, reinforceRate: 0.1, decayRate: 0.0 }]);
    tickLoop(s);
    expect(s.objects[0].rung).toBe("R3");
    expect(s.gateQueue[0]).toMatchObject({ objectId: "g", gate: "DG-09", toRung: "R4" });
    expect(s.log.some((e) => e.type === "GATE_PENDING")).toBe(true);
  });

  it("promotes past the gate once approved", () => {
    const s = createLoop([{ id: "g", rung: "R3", strength: 0.8, reinforceRate: 0.05, decayRate: 0.0 }]);
    tickLoop(s);
    resolveGate(s, "g", true);
    expect(s.objects[0].rung).toBe("R4");
    expect(s.gateQueue).toHaveLength(0);
  });

  it("maps rung gates correctly", () => {
    expect(gateFor("R1")).toBeNull();
    expect(gateFor("R3")).toBe("DG-09");
    expect(gateFor("R4")).toBe("DG-10");
  });
});

describe("Living loop — rollback & events", () => {
  it("demotes an object whose strength collapses", () => {
    const s = createLoop([{ id: "r", rung: "R3", strength: 0.62, reinforceRate: 0, decayRate: 0.1 }]);
    for (let i = 0; i < 5; i++) tickLoop(s);
    expect(RUNGS.indexOf(s.objects[0].rung)).toBeLessThan(RUNGS.indexOf("R3"));
    expect(s.log.some((e) => e.type === "DEMOTION")).toBe(true);
  });

  it("emits a LEARNING_EVENT snapshot every tick", () => {
    const s = createLoop([{ id: "e", strength: 0.5 }]);
    tickLoop(s);
    expect(s.log.some((e) => e.type === "SNAPSHOT")).toBe(true);
  });
});

describe("Living loop router", () => {
  beforeEach(async () => {
    await caller.livingLoop.reset();
  });

  it("ticks and snapshots through the router", async () => {
    const snap = await caller.livingLoop.tick({ times: 5 });
    expect(snap.tick).toBe(5);
    expect(snap.objectCount).toBe(2);
    expect(snap.events).toBeGreaterThan(0);
  });

  it("seeds a custom object set and reaches a gate", async () => {
    await caller.livingLoop.seed({ objects: [{ id: "z", rung: "R3", strength: 0.75, reinforceRate: 0.1, decayRate: 0 }] });
    await caller.livingLoop.tick({ times: 1 });
    const st = await caller.livingLoop.state();
    expect(st.gateQueue.length).toBeGreaterThanOrEqual(1);
  });
});

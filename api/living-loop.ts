// ============================================================
// LIVING LOOP ENGINE — M1 (MED v2.0 §10 M1)
// The deterministic heart-beat: each tick drives
//   decay/reinforce → promotion-check → snapshot
// emitting a LEARNING_EVENT for every change. Auto-promotes R1→R2→R3,
// queues DG-09/DG-10 human gates for R3+ , and supports rollback.
// Pure / deterministic (no wall-clock, no RNG) → fully CI-testable.
// The live 24h scheduler is a deployment concern layered on top.
// ============================================================

export const RUNGS = ["R1", "R2", "R3", "R4", "R5", "R6"] as const;
export type Rung = (typeof RUNGS)[number];

export const DECAY_FLOOR = 0.20;   // minimum decayed strength (spec D=0.20)
const DEMOTE_MARGIN = 0.10;

/** Strength needed to occupy / be promoted into each rung. */
export const PROMOTION_THRESHOLDS: Record<Rung, number> = {
  R1: 0.0, R2: 0.4, R3: 0.6, R4: 0.75, R5: 0.85, R6: 0.95,
};

function rungIndex(r: Rung): number {
  return RUNGS.indexOf(r);
}
function nextRung(r: Rung): Rung | null {
  const i = rungIndex(r);
  return i < RUNGS.length - 1 ? RUNGS[i + 1] : null;
}
function prevRung(r: Rung): Rung | null {
  const i = rungIndex(r);
  return i > 0 ? RUNGS[i - 1] : null;
}
/** Human gate required to promote out of a rung (null ⇒ auto-promotion). */
export function gateFor(from: Rung): string | null {
  if (from === "R3") return "DG-09";
  if (from === "R4") return "DG-10";
  if (from === "R5") return "FOUNDER";
  return null; // R1, R2 auto-promote
}

export interface LiveObject {
  id: string;
  rung: Rung;
  strength: number;      // [DECAY_FLOOR, 1]
  decayRate: number;     // per-tick decay
  reinforceRate: number; // per-tick reinforcement from evidence
}

export type LearningEventType = "DECAY" | "REINFORCE" | "PROMOTION" | "DEMOTION" | "GATE_PENDING" | "SNAPSHOT";
export interface LearningEvent {
  tick: number;
  type: LearningEventType;
  objectId: string;
  detail: string;
}

export interface GateEntry {
  objectId: string;
  gate: string;
  toRung: Rung;
}

export interface LoopState {
  tick: number;
  objects: LiveObject[];
  log: LearningEvent[];      // continuity_log
  gateQueue: GateEntry[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function createLoop(seed: Array<Partial<LiveObject> & { id: string }> = []): LoopState {
  const objects: LiveObject[] = seed.map((s) => ({
    id: s.id,
    rung: s.rung ?? "R1",
    strength: clamp(s.strength ?? 0.5, DECAY_FLOOR, 1),
    decayRate: Math.max(0, s.decayRate ?? 0.03),
    reinforceRate: Math.max(0, s.reinforceRate ?? 0),
  }));
  return { tick: 0, objects, log: [], gateQueue: [] };
}

/** Advance the loop one deterministic tick: decay → promotion-check → snapshot. */
export function tickLoop(state: LoopState): LoopState {
  const t = state.tick + 1;
  for (const obj of state.objects) {
    // 1) decay / reinforce
    const delta = obj.reinforceRate - obj.decayRate;
    const before = obj.strength;
    obj.strength = clamp(Number((obj.strength + delta).toFixed(4)), DECAY_FLOOR, 1);
    if (obj.strength !== before) {
      state.log.push({
        tick: t,
        type: delta >= 0 ? "REINFORCE" : "DECAY",
        objectId: obj.id,
        detail: `${before.toFixed(3)} → ${obj.strength.toFixed(3)}`,
      });
    }

    // 2) promotion check (auto R1→R2→R3, gated beyond)
    const next = nextRung(obj.rung);
    if (next && obj.strength >= PROMOTION_THRESHOLDS[next]) {
      const gate = gateFor(obj.rung);
      if (gate === null) {
        obj.rung = next;
        state.log.push({ tick: t, type: "PROMOTION", objectId: obj.id, detail: `→ ${next} (آلي)` });
      } else if (!state.gateQueue.some((g) => g.objectId === obj.id)) {
        state.gateQueue.push({ objectId: obj.id, gate, toRung: next });
        state.log.push({ tick: t, type: "GATE_PENDING", objectId: obj.id, detail: `${gate} → ${next}` });
      }
    } else {
      // 3) rollback / demotion
      const prev = prevRung(obj.rung);
      if (prev && obj.strength <= PROMOTION_THRESHOLDS[obj.rung] - DEMOTE_MARGIN) {
        state.log.push({ tick: t, type: "DEMOTION", objectId: obj.id, detail: `${obj.rung} → ${prev}` });
        obj.rung = prev;
      }
    }

    // 4) snapshot
    state.log.push({ tick: t, type: "SNAPSHOT", objectId: obj.id, detail: `${obj.rung}@${obj.strength.toFixed(3)}` });
  }
  state.tick = t;
  return state;
}

/** Resolve a pending human gate (DG-09/DG-10/FOUNDER). */
export function resolveGate(state: LoopState, objectId: string, approve: boolean): LoopState {
  const idx = state.gateQueue.findIndex((g) => g.objectId === objectId);
  if (idx === -1) return state;
  const entry = state.gateQueue[idx];
  state.gateQueue.splice(idx, 1);
  const obj = state.objects.find((o) => o.id === objectId);
  if (obj && approve) {
    obj.rung = entry.toRung;
    state.log.push({ tick: state.tick, type: "PROMOTION", objectId, detail: `→ ${entry.toRung} (بوابة ${entry.gate})` });
  } else {
    state.log.push({ tick: state.tick, type: "SNAPSHOT", objectId, detail: `بوابة ${entry.gate} مرفوضة` });
  }
  return state;
}

export interface LoopSnapshot {
  tick: number;
  objectCount: number;
  byRung: Record<Rung, number>;
  pendingGates: number;
  events: number;
}
export function snapshot(state: LoopState): LoopSnapshot {
  const byRung = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 } as Record<Rung, number>;
  for (const o of state.objects) byRung[o.rung] += 1;
  return {
    tick: state.tick,
    objectCount: state.objects.length,
    byRung,
    pendingGates: state.gateQueue.length,
    events: state.log.length,
  };
}

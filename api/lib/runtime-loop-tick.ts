// ============================================================
// RUNTIME LOOP TICK — shared living-loop cycle
// Extracted from api/boot.ts so the web service (boot.ts) and the
// standalone scheduler worker (api/scheduler-worker.ts, declared in
// render.yaml `onx-scheduler`) run the exact same production cycle.
// Behavior is unchanged from the original boot.ts implementation.
// ============================================================
import { computeIUC, type IurgObjectInput } from "../iuc-engine";
import { createLoop, tickLoop, type Rung } from "../living-loop";
import {
  appendContinuityLog,
  getIurgObjects,
  saveIucSnapshot,
  saveIurgObject,
} from "./iurg-store";

function toRung(rank?: number): Rung {
  const r = Math.max(1, Math.min(6, Math.trunc(rank ?? 1)));
  return (`R${r}` as Rung);
}

function fromRung(rung: Rung): 1 | 2 | 3 | 4 | 5 | 6 {
  return Number(rung.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
}

function shouldSnapshot(now: Date): boolean {
  return now.getUTCMinutes() === 0;
}

export async function runLivingLoopTick(): Promise<void> {
  const objects = await getIurgObjects();
  if (objects.length === 0) return;

  const loop = createLoop(objects.map((obj) => ({
    id: obj.id ?? "",
    rung: toRung(obj.rank),
    strength: obj.context ?? obj.trust ?? 0.5,
    decayRate: 0.02,
    reinforceRate: 0.03,
  })));
  tickLoop(loop);

  for (const event of loop.log) {
    await appendContinuityLog({
      tick: event.tick,
      eventType: event.type,
      objectId: event.objectId,
      detail: event.detail,
    });
  }

  const byId = new Map(objects.map((obj) => [obj.id, obj] as const));
  for (const item of loop.objects) {
    const source = byId.get(item.id);
    if (!source) continue;
    await saveIurgObject({
      ...source,
      rank: fromRung(item.rung),
      context: item.strength,
    });
  }

  if (shouldSnapshot(new Date())) {
    const persisted = await getIurgObjects();
    const snapshot = computeIUC(persisted as IurgObjectInput[]);
    const value = (key: string): number => snapshot.indicators.find((i) => i.key === key)?.value ?? 0;
    await saveIucSnapshot({
      tuc: snapshot.tuc,
      ugr: value("UGR"),
      urs: value("URS"),
      ksr: value("UC"),
      pdr: value("UY"),
      krr: value("UVR"),
      kor: value("UT"),
      scg: value("CAS"),
      sai: value("FAS"),
      objectCount: snapshot.objectCount,
    });
  }
}

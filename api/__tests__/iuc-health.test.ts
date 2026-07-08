import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import {
  appendContinuityLog,
  clearContinuityLogEntries,
  clearIucSnapshots,
  replaceIurgObjects,
  saveIucSnapshot,
} from "../lib/iurg-store";
import type { IurgObjectInput } from "../iuc-engine";
import { setIucCronStatus } from "../lib/iuc-runtime";

const caller = appRouter.createCaller({} as Parameters<typeof appRouter.createCaller>[0]);

describe.sequential("IUC health endpoint", () => {
  beforeEach(async () => {
    setIucCronStatus("paused");
    await replaceIurgObjects([]);
    await clearIucSnapshots();
    await clearContinuityLogEntries();
  });

  it("returns zero counts on empty persistence state", async () => {
    const health = await caller.iuc.health();

    expect(health.objectCount).toBe(0);
    expect(health.snapshotCount).toBe(0);
    expect(health.continuityLogCount).toBe(0);
    expect(health.lastTickAt).toBeNull();
    expect(health.cronStatus).toBe("paused");
    expect(health.uptimeSeconds).toBeGreaterThan(0);
  });

  it("reports object and snapshot counts after storing records", async () => {
    const sampleObjects: IurgObjectInput[] = [
      { id: "health-1", type: "PERCEPTION", rank: 1, verification: "POSSIBLE", sources: 2, trust: 0.7 },
      { id: "health-2", type: "PATTERN", rank: 2, verification: "PROBABLE", sources: 3, trust: 0.82 },
      { id: "health-3", type: "UNDERSTANDING", rank: 3, verification: "CONFIRMED", sources: 3, trust: 0.88 },
    ];
    await replaceIurgObjects(sampleObjects);
    await saveIucSnapshot({
      tuc: 18.2,
      ugr: 0.2,
      urs: 0.4,
      ksr: 0.5,
      pdr: 0.7,
      krr: 0.6,
      kor: 0.5,
      scg: 0.9,
      sai: 0.91,
      objectCount: sampleObjects.length,
    });

    const health = await caller.iuc.health();
    expect(health.objectCount).toBe(3);
    expect(health.snapshotCount).toBe(1);
    expect(health.continuityLogCount).toBe(0);
  });

  it("exposes latest tick timestamp from continuity activity", async () => {
    await appendContinuityLog({
      tick: 1,
      eventType: "SNAPSHOT",
      objectId: "health-1",
      detail: "HEALTH_TEST_TICK",
    });
    await appendContinuityLog({
      tick: 2,
      eventType: "REINFORCE",
      objectId: "health-1",
      detail: "HEALTH_TEST_REINFORCE",
    });

    const health = await caller.iuc.health();
    expect(health.continuityLogCount).toBe(2);
    expect(health.lastTickAt).not.toBeNull();
  });
});

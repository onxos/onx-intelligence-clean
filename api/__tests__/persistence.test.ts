import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import {
  clearContinuityLogEntries,
  clearIucSnapshots,
  getIurgObjects,
  getLatestIucSnapshot,
  listContinuityLog,
  saveIucSnapshot,
  saveIurgObject,
} from "../lib/iurg-store";

const caller = appRouter.createCaller({} as any);

describe("Track I persistence layer", () => {
  beforeEach(async () => {
    await caller.iuc.reset();
    await clearContinuityLogEntries();
    await clearIucSnapshots();
  });

  it("saves and reads back an IURG object", async () => {
    await saveIurgObject({
      id: "persist-obj-1",
      type: "UNDERSTANDING",
      rank: 3,
      verification: "CONFIRMED",
      context: 0.82,
      trust: 0.88,
      sources: 3,
    });

    const objects = await getIurgObjects();
    const found = objects.find((obj) => obj.id === "persist-obj-1");
    expect(found).toBeDefined();
    expect(found?.type).toBe("UNDERSTANDING");
    expect(found?.rank).toBe(3);
    expect(found?.verification).toBe("CONFIRMED");
  });

  it("writes chained continuity log entries after a tick", async () => {
    await caller.livingLoop.seed({
      objects: [{ id: "loop-1", rung: "R1", strength: 0.5, reinforceRate: 0.08, decayRate: 0.02 }],
    });
    await caller.livingLoop.tick({ times: 2 });

    const rows = await listContinuityLog(50);
    const ordered = rows.slice().reverse();
    expect(ordered.length).toBeGreaterThan(0);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].previousHash).toBe(ordered[i - 1].currentHash);
    }
  });

  it("saves and retrieves IUC snapshot with matching TUC", async () => {
    await saveIucSnapshot({
      tuc: 123.456,
      ugr: 0.12,
      urs: 0.08,
      ksr: 0.61,
      pdr: 0.73,
      krr: 0.66,
      kor: 0.7,
      scg: 0.94,
      sai: 0.92,
      objectCount: 7,
    });

    const latest = await getLatestIucSnapshot();
    expect(latest).not.toBeNull();
    expect(latest?.tuc).toBeCloseTo(123.456, 6);
  });
});


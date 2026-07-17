import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearIucSnapshots, replaceIurgObjects, saveIucSnapshot } from "../lib/iurg-store";
import { computeIUC, type IurgObjectInput } from "../iuc-engine";

const caller = appRouter.createCaller({} as any);

function indicatorValue(snapshot: ReturnType<typeof computeIUC>, key: "UC" | "UVR"): number {
  return snapshot.indicators.find((indicator) => indicator.key === key)?.value ?? 0;
}

describe.sequential("IUC corpus status", () => {
  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
  });

  it("reports grouped corpus counts after seeding sample records", async () => {
    const sampleObjects: IurgObjectInput[] = [
      { id: "corpus-1", type: "PERCEPTION", rank: 1, verification: "POSSIBLE", contentText: "Amoxicillin usage intake note", sources: 2, trust: 0.7 },
      { id: "corpus-2", type: "PERCEPTION", rank: 1, verification: "PROBABLE", contentText: "Parvovirus symptom observation", sources: 3, trust: 0.82 },
      { id: "corpus-3", type: "PERCEPTION", rank: 1, verification: "POSSIBLE", contentText: "Annual checkup wellness reminder", sources: 2, trust: 0.68 },
      { id: "corpus-4", type: "PATTERN", rank: 2, verification: "PROBABLE", contentText: "Recurring kennel cough presentation", sources: 3, trust: 0.8 },
      { id: "corpus-5", type: "UNDERSTANDING", rank: 3, verification: "CONFIRMED", contentText: "Confirmed hydration protocol linkage", sources: 4, trust: 0.9, validated: true },
    ];

    await replaceIurgObjects(sampleObjects);

    await saveIucSnapshot({
      tuc: 42.5,
      ksr: 0.61,
      krr: 0.74,
      objectCount: 5,
    });

    const status = await caller.iuc.corpusStatus();
    const expected = computeIUC(sampleObjects);

    expect(status.perceptionCount).toBe(3);
    expect(status.patternCount).toBe(1);
    expect(status.understandingCount).toBe(1);
    expect(status.totalObjects).toBe(5);
    expect(status.tuc).toBeCloseTo(expected.tuc, 6);
    expect(status.ksr).toBeCloseTo(indicatorValue(expected, "UC"), 6);
    expect(status.krr).toBeCloseTo(indicatorValue(expected, "UVR"), 6);
    expect(status.latestSnapshotAt).not.toBeNull();
  });
});

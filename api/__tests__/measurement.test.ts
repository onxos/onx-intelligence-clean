// ============================================================
// D17 MEASUREMENT ENGINE + ROUTER — UNIT TESTS (I-M5)
// Covers the 6 quality indices (OQI/ICI/JQI/WQI/UQI/IRS),
// Berlin-5 wisdom, progress-state classification, and the router.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";
import { computeIndices, classifyProgress, type MeasurementObject } from "../measurement-engine";

const caller = appRouter.createCaller({} as any);

const highQuality: MeasurementObject[] = [
  { type: "JUDGMENT", rank: 6, verification: "PROVEN", trust: 0.96, validated: true, sources: 3, drift: 0, coherence: 0.95, factualKnowledge: 0.9, proceduralKnowledge: 0.9, lifespanContext: 0.9, valueRelativism: 0.9, uncertaintyMgmt: 0.9 },
  { type: "UNDERSTANDING", rank: 5, verification: "CONFIRMED", trust: 0.9, validated: true, sources: 3, drift: 0.05, coherence: 0.9 },
];

const lowQuality: MeasurementObject[] = [
  { type: "PERCEPTION", rank: 1, verification: "UNVERIFIED", trust: 0.2, validated: false, sources: 1, drift: 0.8, overrides: 3, coherence: 0.2 },
  { type: "PATTERN", rank: 1, verification: "POSSIBLE", trust: 0.3, validated: false, sources: 1, drift: 0.7, overrides: 2 },
];

describe("D17 Measurement Engine — 6 quality indices", () => {
  it("returns exactly the 6 indices in order", () => {
    const snap = computeIndices(highQuality);
    expect(snap.indices.map((i) => i.key)).toEqual(["OQI", "ICI", "JQI", "WQI", "UQI", "IRS"]);
  });

  it("scores high-quality objects above low-quality ones", () => {
    const hi = computeIndices(highQuality);
    const lo = computeIndices(lowQuality);
    const oqiHi = hi.indices.find((i) => i.key === "OQI")!.value;
    const oqiLo = lo.indices.find((i) => i.key === "OQI")!.value;
    expect(oqiHi).toBeGreaterThan(oqiLo);
  });

  it("raises IRS (risk) for drifting, unverified, overridden objects", () => {
    const hi = computeIndices(highQuality).indices.find((i) => i.key === "IRS")!;
    const lo = computeIndices(lowQuality).indices.find((i) => i.key === "IRS")!;
    expect(lo.value).toBeGreaterThan(hi.value);
    expect(lo.status === "AMBER" || lo.status === "RED").toBe(true);
  });

  it("reflects Berlin-5 criteria in WQI", () => {
    const wise = computeIndices([{ type: "UNDERSTANDING", rank: 5, factualKnowledge: 0.9, proceduralKnowledge: 0.9, lifespanContext: 0.9, valueRelativism: 0.9, uncertaintyMgmt: 0.9 }]);
    const naive = computeIndices([{ type: "UNDERSTANDING", rank: 5, factualKnowledge: 0.1, proceduralKnowledge: 0.1, lifespanContext: 0.1, valueRelativism: 0.1, uncertaintyMgmt: 0.1 }]);
    const w1 = wise.indices.find((i) => i.key === "WQI")!.value;
    const w2 = naive.indices.find((i) => i.key === "WQI")!.value;
    expect(w1).toBeGreaterThan(w2);
  });

  it("handles an empty set without throwing", () => {
    const snap = computeIndices([]);
    expect(snap.indices).toHaveLength(6);
    expect(snap.objectCount).toBe(0);
  });

  it("keeps every index within [0,1]", () => {
    for (const i of computeIndices(highQuality).indices) {
      expect(i.value).toBeGreaterThanOrEqual(0);
      expect(i.value).toBeLessThanOrEqual(1);
    }
  });
});

describe("D17 Measurement Engine — progress states", () => {
  it("is STABILIZING with no baseline", () => {
    expect(classifyProgress(0.5, undefined)).toBe("STABILIZING");
  });
  it("is ACCUMULATING when rising beyond epsilon", () => {
    expect(classifyProgress(0.6, 0.5)).toBe("ACCUMULATING");
  });
  it("is DECLINING when falling beyond epsilon", () => {
    expect(classifyProgress(0.4, 0.5)).toBe("DECLINING");
  });
  it("is STABILIZING within epsilon", () => {
    expect(classifyProgress(0.505, 0.5)).toBe("STABILIZING");
  });
});

describe("D17 Measurement Router (tRPC)", () => {
  beforeEach(async () => {
    await caller.iuc.reset();
    await caller.measurement.reset();
  });

  it("exposes metadata for all 6 indices", async () => {
    const keys = await caller.measurement.keys();
    expect(keys).toHaveLength(6);
    expect(keys.map((k) => k.key)).toContain("WQI");
  });

  it("measures the live IURG graph with progress states", async () => {
    const snap = await caller.measurement.snapshot();
    expect(snap.indices).toHaveLength(6);
    expect(snap.objectCount).toBeGreaterThan(0);
    expect(snap.indices.every((i) => typeof i.progress === "string")).toBe(true);
  });

  it("evaluates an ad-hoc object set", async () => {
    const res = await caller.measurement.evaluate({ objects: highQuality });
    expect(res.indices).toHaveLength(6);
  });

  it("classifies a progress state via the endpoint", async () => {
    const res = await caller.measurement.progress({ current: 0.7, previous: 0.5 });
    expect(res.state).toBe("ACCUMULATING");
  });

  it("commits a baseline then reports STABILIZING on an unchanged graph", async () => {
    const c = await caller.measurement.commit();
    expect(c.committed).toBe(true);
    expect(c.progress).toHaveLength(6);
    const snap = await caller.measurement.snapshot();
    expect(snap.indices.every((i) => i.progress === "STABILIZING")).toBe(true);
  });
});

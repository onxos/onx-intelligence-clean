import { beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../router";
import { clearContinuityLogEntries, clearIucSnapshots, getIurgObjects, replaceIurgObjects } from "../lib/iurg-store";
import { buildCorpusObjects, type CorpusSeed } from "../lib/corpus";
import { applyRetention, planRetention } from "../lib/corpus-retention";
import { CURATED_VET_CORPUS } from "../lib/corpus-data";
import type { IurgObjectInput } from "../iuc-engine";

const caller = appRouter.createCaller({} as any);

function obj(id: string, provType: "AUTHORED" | "INGESTED" | "SYNTHETIC", cited: boolean, quality: number): IurgObjectInput {
  return {
    id,
    type: "PERCEPTION",
    rank: 1,
    verification: "POSSIBLE",
    contentText: `content for ${id}`,
    provenance: {
      type: provType,
      citation: cited ? "Some Authority: Topic" : "",
      sourceAuthority: cited ? "Some Authority" : "",
    },
    quality,
  };
}

const authored = obj("corpus-a", "AUTHORED", true, 0.9);
const synthetic = obj("corpus-s", "SYNTHETIC", false, 0.35);
const lowIngested = obj("corpus-l", "INGESTED", false, 0.2);
const mixed = [authored, synthetic, lowIngested];

describe("planRetention (provenance-preserving, measured)", () => {
  it("prunes synthetic scaffold by default but preserves provenance-valid records", () => {
    const plan = planRetention(mixed);
    expect(plan.prunedIds).toEqual(["corpus-s"]);
    expect(plan.prunedByReason).toEqual({ synthetic: 1, lowQuality: 0 });
    expect(plan.keptIds).toEqual(["corpus-a", "corpus-l"]);
    expect(plan.before.provenanceValidCount).toBe(1);
    expect(plan.after.provenanceValidCount).toBe(1);
    expect(plan.provenanceValidPreserved).toBe(true);
    expect(plan.before.total).toBe(3);
    expect(plan.after.total).toBe(2);
  });

  it("drops low-quality NON-cited records under minQuality, still never cited ones", () => {
    const plan = planRetention(mixed, { minQuality: 0.5 });
    expect(plan.prunedByReason).toEqual({ synthetic: 1, lowQuality: 1 });
    expect(plan.prunedIds.sort()).toEqual(["corpus-l", "corpus-s"]);
    expect(plan.keptIds).toEqual(["corpus-a"]);
    expect(plan.provenanceValidPreserved).toBe(true);
  });

  it("keeps synthetic when dropSynthetic is false", () => {
    const plan = planRetention(mixed, { dropSynthetic: false });
    expect(plan.prunedIds).toEqual([]);
    expect(plan.after.total).toBe(3);
  });

  it("never prunes a provenance-valid record even under an aggressive minQuality", () => {
    const lowButCited = obj("corpus-c", "AUTHORED", true, 0.05);
    const plan = planRetention([lowButCited], { minQuality: 0.99 });
    expect(plan.prunedIds).toEqual([]);
    expect(plan.provenanceValidPreserved).toBe(true);
  });

  it("is deterministic and order-preserving", () => {
    const a = planRetention(mixed, { minQuality: 0.5 });
    const b = planRetention(mixed, { minQuality: 0.5 });
    expect(a).toEqual(b);
  });
});

describe("applyRetention", () => {
  it("returns exactly the kept objects without mutating the input", () => {
    const input = [...mixed];
    const kept = applyRetention(input, { minQuality: 0.5 });
    expect(kept.map((o) => o.id)).toEqual(["corpus-a"]);
    expect(input.length).toBe(3); // untouched
  });
});

describe.sequential("corpus retention router integration", () => {
  const built = buildCorpusObjects([
    ...CURATED_VET_CORPUS,
    { contentText: "Synthetic scaffold retention placeholder note one", type: "PERCEPTION", verification: "POSSIBLE", provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" }, sources: 1, trust: 0.5, domainTag: "MEDICINE" } as CorpusSeed,
    { contentText: "Synthetic scaffold retention placeholder note two", type: "PERCEPTION", verification: "POSSIBLE", provenance: { type: "SYNTHETIC", citation: "", sourceAuthority: "" }, sources: 1, trust: 0.5, domainTag: "MEDICINE" } as CorpusSeed,
  ]);
  const authoredCount = CURATED_VET_CORPUS.length;

  beforeEach(async () => {
    await replaceIurgObjects([]);
    await clearIucSnapshots();
    await clearContinuityLogEntries();
  });

  it("preview reports prunable synthetic without mutating the store", async () => {
    await replaceIurgObjects(built);
    const res = await caller.iuc.corpusRetentionPreview();
    expect(res.applied).toBe(false);
    expect(res.before.total).toBe(built.length);
    expect(res.prunedByReason.synthetic).toBe(2);
    expect(res.after.provenanceValidCount).toBe(res.before.provenanceValidCount);
    // Store is unchanged after a dry-run.
    expect((await getIurgObjects()).length).toBe(built.length);
  });

  it("apply prunes synthetic, preserves every provenance-valid record, and is idempotent", async () => {
    await replaceIurgObjects(built);
    const first = await caller.iuc.corpusRetentionApply();
    expect(first.applied).toBe(true);
    expect(first.prunedByReason.synthetic).toBe(2);
    expect(first.provenanceValidPreserved).toBe(true);

    const persisted = await getIurgObjects();
    expect(persisted.length).toBe(authoredCount);
    expect(persisted.every((o) => o.provenance?.type !== "SYNTHETIC")).toBe(true);

    // Second apply prunes nothing (nothing synthetic remains).
    const second = await caller.iuc.corpusRetentionApply();
    expect(second.prunedIds).toEqual([]);
    expect((await getIurgObjects()).length).toBe(authoredCount);

    // corpusStatus still reports the full provenance-valid count.
    const status = await caller.iuc.corpusStatus();
    expect(status.provenanceValidCount).toBe(authoredCount);
  });
});

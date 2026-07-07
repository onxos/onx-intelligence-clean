// ============================================================
// D17 MEASUREMENT ROUTER — 6 Quality Indices API (Track I / I-M5)
// Exposes the pure measurement engine (api/measurement-engine.ts)
// over tRPC, measuring the SAME live IURG graph the IUC dashboard
// shows (via listLiveObjects) plus an ad-hoc `evaluate` endpoint.
// In-memory + deterministic → CI-safe (no DB / external deps).
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  computeIndices,
  classifyProgress,
  type MeasurementObject,
  type QualityIndexKey,
  type ProgressState,
} from "./measurement-engine";
import { IURG_TYPES, type IurgObjectType } from "./iuc-engine";
import { listLiveObjects } from "./iuc-router";

const zMeasureObject = z.object({
  type: z.enum(IURG_TYPES as unknown as [IurgObjectType, ...IurgObjectType[]]),
  rank: z.number().int().min(1).max(6).optional(),
  verification: z.enum(["UNVERIFIED", "POSSIBLE", "PROBABLE", "CONFIRMED", "PROVEN"]).optional(),
  ageDays: z.number().min(0).optional(),
  trust: z.number().min(0).max(1).optional(),
  amanah: z.number().min(0).max(1).optional(),
  drift: z.number().min(0).max(1).optional(),
  coherence: z.number().min(0).max(1).optional(),
  validated: z.boolean().optional(),
  sources: z.number().int().min(0).optional(),
  overrides: z.number().int().min(0).optional(),
  yield: z.number().min(0).max(1).optional(),
  factualKnowledge: z.number().min(0).max(1).optional(),
  proceduralKnowledge: z.number().min(0).max(1).optional(),
  lifespanContext: z.number().min(0).max(1).optional(),
  valueRelativism: z.number().min(0).max(1).optional(),
  uncertaintyMgmt: z.number().min(0).max(1).optional(),
});

const INDEX_META: Record<QualityIndexKey, string> = {
  OQI: "سلامة الكائن: تحقق × توثيق × كفاية المصادر",
  ICI: "تماسك الذكاء عبر الرسم البياني (يُعاقَب على الانحراف)",
  JQI: "جودة الحكم على كائنات JUDGMENT/DECISION",
  WQI: "جودة الحكمة وفق معايير برلين الخمسة",
  UQI: "جودة الفهم على كائنات UNDERSTANDING/PATTERN",
  IRS: "مخاطر الذكاء: انحراف + اضمحلال + غير مُتحقَّق + تجاوزات",
};

function liveInputs(): MeasurementObject[] {
  return listLiveObjects().map((n) => ({
    type: n.type, rank: n.rank, verification: n.verification,
    ageDays: n.ageDays, trust: n.trust, amanah: n.amanah,
    coherence: n.trust, validated: n.validated, sources: n.sources,
    overrides: n.overrides, yield: n.yield,
  }));
}

let lastCommitted: Partial<Record<QualityIndexKey, number>> = {};

export const measurementRouter = createRouter({
  // --- Metadata for the 6 D17 indices ---
  keys: publicQuery.query(() =>
    (Object.keys(INDEX_META) as QualityIndexKey[]).map((k) => ({ key: k, description: INDEX_META[k] })),
  ),

  // --- Live D17 snapshot over the current IURG graph, with progress states ---
  snapshot: publicQuery.query(() => {
    const snap = computeIndices(liveInputs());
    const indices = snap.indices.map((i) => ({
      ...i,
      progress: classifyProgress(i.value, lastCommitted[i.key]),
    }));
    return { ...snap, indices };
  }),

  // --- Commit current indices to history (baseline for progress states) ---
  commit: publicQuery.mutation(() => {
    const snap = computeIndices(liveInputs());
    const progress: Array<{ key: QualityIndexKey; value: number; state: ProgressState }> =
      snap.indices.map((i) => ({
        key: i.key, value: i.value, state: classifyProgress(i.value, lastCommitted[i.key]),
      }));
    const next: Partial<Record<QualityIndexKey, number>> = {};
    for (const i of snap.indices) next[i.key] = i.value;
    lastCommitted = next;
    return { committed: true, progress };
  }),

  // --- Evaluate the 6 indices over an ad-hoc set of objects (stateless) ---
  evaluate: publicQuery.input(z.object({ objects: z.array(zMeasureObject) }))
    .query(({ input }) => computeIndices(input.objects as MeasurementObject[])),

  // --- Classify a progress state from current vs previous value ---
  progress: publicQuery.input(z.object({ current: z.number(), previous: z.number().optional() }))
    .query(({ input }) => ({ state: classifyProgress(input.current, input.previous) })),

  // --- Reset the progress baseline ---
  reset: publicQuery.mutation(() => {
    lastCommitted = {};
    return { reset: true };
  }),
});

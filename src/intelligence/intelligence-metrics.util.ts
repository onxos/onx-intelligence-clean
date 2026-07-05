/**
 * Pure, side-effect-free intelligence measurement helpers.
 * Shared by IntelligenceSchedulerService (periodic snapshots) and
 * IntelligenceController (on-demand reads) so both surfaces compute the
 * SAME deterministic numbers from the SAME live rows — no fabricated data.
 */

export interface QualityIndicesInput {
  amanahScore: number;
  confidenceScore: number;
  trustScore: number;
  qualityIndex: number;
  state: string;
  objectType: string;
}

export interface QualityIndices {
  objectCount: number;
  avgAmanah: number;
  avgConfidence: number;
  avgTrust: number;
  avgQuality: number;
  ici: number;
  irs: number;
  progressState: 'ACCUMULATING' | 'STABILIZING' | 'DECLINING';
  byType: Record<string, number>;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Intelligence Capital Index — weighted blend of amanah, confidence and
 * an active-object ratio. Deterministic function of the supplied rows.
 */
export function computeICI(objects: QualityIndicesInput[]): number {
  if (objects.length === 0) return 0;
  const avgAmanah = objects.reduce((s, o) => s + o.amanahScore, 0) / objects.length;
  const avgConfidence = objects.reduce((s, o) => s + o.confidenceScore, 0) / objects.length;
  const activeRatio = objects.filter((o) => o.state === 'ACTIVE').length / objects.length;
  const scaleFactor = Math.min(objects.length / 20, 1);
  const ici = avgAmanah * 0.35 + avgConfidence * 0.3 + activeRatio * 0.2 + scaleFactor * 0.15;
  return round(clamp01(ici));
}

/**
 * Institutional Risk Score — proportion of low-amanah objects relative to
 * a 30% risk-tolerance baseline.
 */
export function computeIRS(objects: QualityIndicesInput[]): number {
  if (objects.length === 0) return 0;
  const lowAmanah = objects.filter((o) => o.amanahScore < 0.5).length;
  const irs = lowAmanah / Math.max(objects.length * 0.3, 1);
  return round(clamp01(irs));
}

export function resolveProgressState(irs: number): QualityIndices['progressState'] {
  if (irs > 0.5) return 'DECLINING';
  if (irs > 0.3) return 'STABILIZING';
  return 'ACCUMULATING';
}

export function computeQualityIndices(objects: QualityIndicesInput[]): QualityIndices {
  const byType: Record<string, number> = {};
  for (const obj of objects) {
    byType[obj.objectType] = (byType[obj.objectType] || 0) + 1;
  }
  const n = objects.length;
  const irs = computeIRS(objects);
  return {
    objectCount: n,
    avgAmanah: n ? round(objects.reduce((s, o) => s + o.amanahScore, 0) / n) : 0,
    avgConfidence: n ? round(objects.reduce((s, o) => s + o.confidenceScore, 0) / n) : 0,
    avgTrust: n ? round(objects.reduce((s, o) => s + o.trustScore, 0) / n) : 0,
    avgQuality: n ? round(objects.reduce((s, o) => s + o.qualityIndex, 0) / n) : 0,
    ici: computeICI(objects),
    irs,
    progressState: resolveProgressState(irs),
    byType,
  };
}

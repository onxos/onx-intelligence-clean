// ============================================================
// CORPUS RETENTION — honest, provenance-preserving retention
// ------------------------------------------------------------
// A retention policy that shrinks the corpus WITHOUT ever destroying knowledge:
//   - Provenance-valid records (AUTHORED / INGESTED with a real citation) are
//     ALWAYS preserved — they can never be pruned, whatever the policy says.
//   - Only synthetic scaffold (and, optionally, low-quality NON-cited records)
//     are eligible for pruning.
//   - Everything is MEASURED before and after (no inflation, no silent loss):
//     the plan exposes both summaries plus the exact pruned ids and reasons, and
//     asserts the invariant provenanceValidCount(before) === (after).
// Pure & deterministic (input order preserved) → fully unit-testable, no DB.
// ============================================================
import { isProvenanceValid, summarizeCorpus, type CorpusSummary } from "./corpus";
import type { IurgObjectInput } from "../iuc-engine";

export interface RetentionPolicy {
  /** Remove SYNTHETIC scaffold records (default true). */
  dropSynthetic?: boolean;
  /**
   * Drop NON-provenance-valid records whose quality is below this threshold
   * (default 0 → disabled). Provenance-valid records are never affected.
   */
  minQuality?: number;
}

type RequiredPolicy = Required<RetentionPolicy>;

function resolvePolicy(policy: RetentionPolicy = {}): RequiredPolicy {
  return {
    dropSynthetic: policy.dropSynthetic ?? true,
    minQuality: Math.max(0, Math.min(1, policy.minQuality ?? 0)),
  };
}

export type PruneReason = "synthetic" | "lowQuality";

export interface RetentionPlan {
  policy: RequiredPolicy;
  before: CorpusSummary;
  after: CorpusSummary;
  keptIds: string[];
  prunedIds: string[];
  prunedByReason: Record<PruneReason, number>;
  /** Invariant guard: every provenance-valid record survives retention. */
  provenanceValidPreserved: boolean;
}

/** Why (if at all) a record is eligible for pruning under the policy. */
function pruneReason(obj: IurgObjectInput, policy: RequiredPolicy): PruneReason | null {
  // Provenance-valid records are sacred — never pruned.
  if (isProvenanceValid(obj.provenance)) return null;
  if (policy.dropSynthetic && obj.provenance?.type === "SYNTHETIC") return "synthetic";
  if (policy.minQuality > 0 && (obj.quality ?? 0) < policy.minQuality) return "lowQuality";
  return null;
}

/**
 * Plan retention over `objects` without mutating anything. Deterministic and
 * order-preserving. Reports measured before/after summaries, the exact kept and
 * pruned ids, prune reasons, and the provenance-preservation invariant.
 */
export function planRetention(objects: IurgObjectInput[], policy: RetentionPolicy = {}): RetentionPlan {
  const resolved = resolvePolicy(policy);
  const kept: IurgObjectInput[] = [];
  const keptIds: string[] = [];
  const prunedIds: string[] = [];
  const prunedByReason: Record<PruneReason, number> = { synthetic: 0, lowQuality: 0 };

  for (const obj of objects) {
    const reason = pruneReason(obj, resolved);
    if (reason) {
      prunedByReason[reason] += 1;
      if (obj.id) prunedIds.push(obj.id);
    } else {
      kept.push(obj);
      if (obj.id) keptIds.push(obj.id);
    }
  }

  const before = summarizeCorpus(objects);
  const after = summarizeCorpus(kept);

  return {
    policy: resolved,
    before,
    after,
    keptIds,
    prunedIds,
    prunedByReason,
    provenanceValidPreserved: before.provenanceValidCount === after.provenanceValidCount,
  };
}

/** Apply retention and return only the kept objects (pure; input untouched). */
export function applyRetention(objects: IurgObjectInput[], policy: RetentionPolicy = {}): IurgObjectInput[] {
  const resolved = resolvePolicy(policy);
  return objects.filter((obj) => pruneReason(obj, resolved) === null);
}

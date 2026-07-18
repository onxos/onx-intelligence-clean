// ============================================================
// CORPUS ACCESS CONTROL — clearance-tier enforcement
// ------------------------------------------------------------
// Real (not cosmetic) read access control over corpus records. Each record has
// an AccessTier (default PUBLIC); each retrieval carries a viewer clearance
// (default PUBLIC). A record is visible only when clearance >= record tier, so
// sensitive knowledge (e.g. RESTRICTED constitutional / founder material) is
// excluded from under-cleared viewers BEFORE it ever reaches search / graph /
// vector retrieval — enforcement happens on the candidate pool, not the output.
// Pure, deterministic & DB-free → fully unit-testable.
// ============================================================
import type { AccessTier, IurgObjectInput } from "../iuc-engine";

/** Least → most sensitive. Higher rank = requires higher clearance. */
const TIER_RANK: Record<AccessTier, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  RESTRICTED: 2,
};

export const DEFAULT_TIER: AccessTier = "PUBLIC";

/** A record's effective tier (defaults to PUBLIC when unset). */
export function recordTier(obj: IurgObjectInput): AccessTier {
  return obj.accessTier ?? DEFAULT_TIER;
}

/** True when a viewer at `clearance` may read a record at `tier`. */
export function canAccess(clearance: AccessTier, tier: AccessTier): boolean {
  return TIER_RANK[clearance] >= TIER_RANK[tier];
}

/**
 * Filter a candidate pool down to the records a viewer at `clearance` may read.
 * Order-preserving and deterministic. This is the single choke point every
 * corpus retrieval endpoint runs before searching.
 */
export function filterByClearance(
  objects: IurgObjectInput[],
  clearance: AccessTier = DEFAULT_TIER,
): IurgObjectInput[] {
  return objects.filter((obj) => canAccess(clearance, recordTier(obj)));
}

export interface AccessBreakdown {
  clearance: AccessTier;
  total: number;
  visible: number;
  withheld: number;
  byTier: Record<AccessTier, number>;
  withheldByTier: Record<AccessTier, number>;
}

/** Measured visibility rollup for a viewer clearance (honest, no inflation). */
export function accessBreakdown(
  objects: IurgObjectInput[],
  clearance: AccessTier = DEFAULT_TIER,
): AccessBreakdown {
  const byTier: Record<AccessTier, number> = { PUBLIC: 0, INTERNAL: 0, RESTRICTED: 0 };
  const withheldByTier: Record<AccessTier, number> = { PUBLIC: 0, INTERNAL: 0, RESTRICTED: 0 };
  let visible = 0;

  for (const obj of objects) {
    const tier = recordTier(obj);
    byTier[tier] += 1;
    if (canAccess(clearance, tier)) visible += 1;
    else withheldByTier[tier] += 1;
  }

  return {
    clearance,
    total: objects.length,
    visible,
    withheld: objects.length - visible,
    byTier,
    withheldByTier,
  };
}

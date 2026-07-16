// ============================================================
// STE-P-289 — canonical aggregate checksum for onx.bridgeSurfaces.
//
// SINGLE SOURCE OF TRUTH shared by two sides:
//   1. the SERVER (onx-router.ts bridgeSurfaces) computes the served
//      aggregate checksum with this exact function, and
//   2. the LIVE SMOKE contract (bridge_surfaces_read) RECOMPUTES the
//      aggregate from the served per-bridge parts with the same
//      function — a forged or hand-edited aggregate can never pass.
//
// Pure module: node:crypto only, no server/store dependencies, so the
// smoke-contracts CLI path stays dependency-light and deterministic.
// ============================================================
import { createHash } from "node:crypto";

export interface BridgeSurfacePart {
  bridge: string;
  compatibility: string;
  checksum: string;
}

export function computeBridgeSurfacesChecksum(
  surfaces: BridgeSurfacePart[],
  ready: number,
  guarded: number,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        bridges: surfaces.map((surface) => ({
          bridge: surface.bridge,
          compatibility: surface.compatibility,
          checksum: surface.checksum,
        })),
        ready,
        guarded,
      }),
    )
    .digest("hex");
}

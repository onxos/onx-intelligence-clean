// ============================================================
// CONFLICT RESOLUTION ROUTER (M4) — MED v2.0 §1.6-1.7
// Exposes the conflict engine: categories, 8-level hierarchy,
// resolution, constitutional-review paths, lifecycle, versioning.
// Pure / deterministic → CI-safe.
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  CONFLICT_CATEGORIES,
  CONFLICT_CATEGORY_IDS,
  HIERARCHY_LEVELS,
  LIFECYCLE_STATES,
  rankOf,
  resolveConflict,
  reviewPath,
  canTransition,
  bumpVersion,
  type ConflictCategory,
  type HierarchyLevel,
  type LifecycleState,
} from "./conflict-engine";

const zLevel = z.enum(HIERARCHY_LEVELS as unknown as [HierarchyLevel, ...HierarchyLevel[]]);
const zCategory = z.enum(CONFLICT_CATEGORY_IDS as unknown as [ConflictCategory, ...ConflictCategory[]]);
const zState = z.enum(LIFECYCLE_STATES as unknown as [LifecycleState, ...LifecycleState[]]);

const zConflict = z.object({
  category: zCategory,
  sideA: z.object({ label: z.string(), level: zLevel }),
  sideB: z.object({ label: z.string(), level: zLevel }),
  founderDecision: z.enum(["A", "B"]).optional(),
});

export const conflictRouter = createRouter({
  categories: publicQuery.query(() => ({
    total: CONFLICT_CATEGORY_IDS.length,
    categories: CONFLICT_CATEGORY_IDS.map((id) => ({
      id,
      poles: CONFLICT_CATEGORIES[id].poles,
      autoResolvable: CONFLICT_CATEGORIES[id].autoResolvable,
    })),
  })),

  hierarchy: publicQuery.query(() => ({
    levels: HIERARCHY_LEVELS.map((level) => ({ level, rank: rankOf(level) })),
  })),

  resolve: publicQuery.input(zConflict).query(({ input }) => resolveConflict(input)),

  reviewPath: publicQuery
    .input(z.object({ mode: z.enum(["NORMAL", "EMERGENCY"]) }))
    .query(({ input }) => reviewPath(input.mode)),

  lifecycle: publicQuery.query(() => ({ states: LIFECYCLE_STATES })),

  canTransition: publicQuery
    .input(z.object({ from: zState, to: zState }))
    .query(({ input }) => ({ allowed: canTransition(input.from, input.to) })),

  bumpVersion: publicQuery
    .input(z.object({ version: z.string(), kind: z.enum(["MAJOR", "MINOR", "PATCH"]) }))
    .query(({ input }) => ({ next: bumpVersion(input.version, input.kind) })),
});

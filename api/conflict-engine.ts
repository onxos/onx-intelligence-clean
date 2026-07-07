// ============================================================
// CONFLICT RESOLUTION ENGINE (M4) — MED v2.0 §1.6-1.7
// 7 conflict categories (C1-C7) + an 8-level priority hierarchy,
// two constitutional-review paths, semantic versioning, and the
// 6 intent lifecycle states. Pure / deterministic → CI-testable.
// ============================================================

// --- 7 conflict categories (each a tension between two poles) ---
export const CONFLICT_CATEGORIES = {
  C1: { poles: ["نمو", "رعاية"], autoResolvable: true },
  C2: { poles: ["سرعة", "جودة"], autoResolvable: true },
  C3: { poles: ["ربح", "رحمة"], autoResolvable: true },
  C4: { poles: ["أتمتة", "ثقة"], autoResolvable: true },
  C5: { poles: ["توسع", "استقرار"], autoResolvable: true },
  C6: { poles: ["كفاءة", "سمعة"], autoResolvable: true },
  C7: { poles: ["مؤسس", "دليل"], autoResolvable: false }, // never auto — founder decides
} as const;
export type ConflictCategory = keyof typeof CONFLICT_CATEGORIES;
export const CONFLICT_CATEGORY_IDS = Object.keys(CONFLICT_CATEGORIES) as ConflictCategory[];

// --- 8-level priority hierarchy (index 0 = highest priority) ---
export const HIERARCHY_LEVELS = [
  "EMERGENCY_SAFETY",
  "LEGAL",
  "CONSTITUTIONAL_PILLAR",
  "NON_NEGOTIABLE",
  "ACTIVE_FOUNDER_INTENT",
  "INSTITUTIONAL_JUDGMENT",
  "EXPERIMENTAL",
  "ADVISORY",
] as const;
export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number];

/** Priority rank: 1 = highest (EMERGENCY_SAFETY), 8 = lowest (ADVISORY). */
export function rankOf(level: HierarchyLevel): number {
  return HIERARCHY_LEVELS.indexOf(level) + 1;
}

export interface ConflictSide {
  label: string;
  level: HierarchyLevel;
}

export interface ConflictInput {
  category: ConflictCategory;
  sideA: ConflictSide;
  sideB: ConflictSide;
  founderDecision?: "A" | "B"; // explicit founder ruling (required for C7 / ties)
}

export type ConflictWinner = "A" | "B" | "FOUNDER_REQUIRED";

export interface ConflictResolution {
  category: ConflictCategory;
  winner: ConflictWinner;
  autoResolved: boolean;
  resolvedBy: HierarchyLevel | "FOUNDER_DECISION" | "ESCALATION";
  rationale: string;
}

/** Resolve a conflict via the priority hierarchy. C7 and ties never auto-resolve. */
export function resolveConflict(input: ConflictInput): ConflictResolution {
  const meta = CONFLICT_CATEGORIES[input.category];

  // C7 (founder/evidence) — evidence informs, founder decides. Never automatic.
  if (!meta.autoResolvable) {
    if (input.founderDecision) {
      return {
        category: input.category,
        winner: input.founderDecision,
        autoResolved: false,
        resolvedBy: "FOUNDER_DECISION",
        rationale: "C7: الأدلة تُعلم، والمؤسس يقرر — قرار مؤسس مُطبّق",
      };
    }
    return {
      category: input.category,
      winner: "FOUNDER_REQUIRED",
      autoResolved: false,
      resolvedBy: "ESCALATION",
      rationale: "C7 لا يُحل تلقائياً أبداً — يتطلب قرار المؤسس",
    };
  }

  const rankA = rankOf(input.sideA.level);
  const rankB = rankOf(input.sideB.level);

  if (rankA < rankB) {
    return { category: input.category, winner: "A", autoResolved: true, resolvedBy: input.sideA.level, rationale: `${input.sideA.level} يتفوق على ${input.sideB.level}` };
  }
  if (rankB < rankA) {
    return { category: input.category, winner: "B", autoResolved: true, resolvedBy: input.sideB.level, rationale: `${input.sideB.level} يتفوق على ${input.sideA.level}` };
  }

  // Equal priority — the hierarchy cannot decide; escalate (unless founder already ruled).
  if (input.founderDecision) {
    return { category: input.category, winner: input.founderDecision, autoResolved: false, resolvedBy: "FOUNDER_DECISION", rationale: "مستوى متساوٍ — قرار مؤسس مُطبّق" };
  }
  return { category: input.category, winner: "FOUNDER_REQUIRED", autoResolved: false, resolvedBy: "ESCALATION", rationale: `مستوى متساوٍ (${input.sideA.level}) — تصعيد للمؤسس` };
}

// --- Constitutional review — two paths (§1.7) ---
export type ReviewMode = "NORMAL" | "EMERGENCY";
export interface ReviewStage {
  name: string;
  min: number;
  max: number;
  unit: "days" | "hours";
}
export interface ReviewPath {
  mode: ReviewMode;
  stages: ReviewStage[];
  window: { min: number; max: number; unit: "days" | "hours" };
  temporaryValidityDays: number | null;
}

const NORMAL_PATH: ReviewPath = {
  mode: "NORMAL",
  stages: [
    { name: "أدلة", min: 3, max: 3, unit: "days" },
    { name: "لجنة", min: 7, max: 7, unit: "days" },
    { name: "مؤسس", min: 5, max: 5, unit: "days" },
    { name: "قرار", min: 2, max: 2, unit: "days" },
    { name: "تنفيذ", min: 3, max: 14, unit: "days" },
  ],
  window: { min: 14, max: 30, unit: "days" },
  temporaryValidityDays: null,
};

const EMERGENCY_PATH: ReviewPath = {
  mode: "EMERGENCY",
  stages: [{ name: "طوارئ", min: 4, max: 72, unit: "hours" }],
  window: { min: 4, max: 72, unit: "hours" },
  temporaryValidityDays: 14, // temporary intent valid 14 days
};

export function reviewPath(mode: ReviewMode): ReviewPath {
  return mode === "EMERGENCY" ? EMERGENCY_PATH : NORMAL_PATH;
}

// --- Intent lifecycle — semantic versioning + 6 states (§1.7) ---
export const LIFECYCLE_STATES = [
  "DRAFT", "ACTIVE", "SUPERSEDED", "DEPRECATED", "UNDER_REVIEW", "EXPERIMENTAL",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const LIFECYCLE_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  DRAFT: ["ACTIVE", "EXPERIMENTAL"],
  EXPERIMENTAL: ["ACTIVE", "DEPRECATED"],
  ACTIVE: ["UNDER_REVIEW", "SUPERSEDED", "DEPRECATED"],
  UNDER_REVIEW: ["ACTIVE", "SUPERSEDED", "DEPRECATED"],
  SUPERSEDED: [],
  DEPRECATED: [],
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

export type VersionBump = "MAJOR" | "MINOR" | "PATCH";
export function bumpVersion(version: string, kind: VersionBump): string {
  const parts = version.split(".").map((n) => Math.max(0, parseInt(n, 10) || 0));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (kind === "MAJOR") return `${major + 1}.0.0`;
  if (kind === "MINOR") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

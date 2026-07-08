// ============================================================
// PURPOSE COMPILER + FOUNDER COGNITIVE MODEL (M4) — MED v2.0 §2.5-2.6
// The 9-stage purpose chain, the 7-question purpose gate, and the
// Founder Cognitive Model (8 dims + 10 decision patterns + 5 override
// behaviors + escalation profile). Pure / deterministic → CI-testable.
// ============================================================

// --- 2.6 Purpose Compiler — the 9-stage teleological chain ---
export const PURPOSE_CHAIN = [
  { id: "AMANAH", order: 1, name: "أمانة" },
  { id: "LIFE", order: 2, name: "حياة" },
  { id: "POTENTIAL", order: 3, name: "إمكانات" },
  { id: "EFFICACY", order: 4, name: "فاعلية" },
  { id: "EXECUTION", order: 5, name: "تنفيذ" },
  { id: "ACHIEVEMENT", order: 6, name: "تحقيق" },
  { id: "FLOURISHING", order: 7, name: "ازدهار" },
  { id: "CONTINUITY", order: 8, name: "استمرارية" },
  { id: "EVOLUTION", order: 9, name: "تطور" },
] as const;
export type PurposeStageId = (typeof PURPOSE_CHAIN)[number]["id"];

export interface PurposeCompileResult {
  reachedStage: PurposeStageId | null;
  depth: number;        // how many leading stages satisfied (0-9)
  complete: boolean;    // all 9 stages satisfied
  blockedAt: PurposeStageId | null;
}

/** Flow an object through the chain; it advances until the first unmet stage. */
export function compilePurpose(stages: Partial<Record<PurposeStageId, boolean>>): PurposeCompileResult {
  let depth = 0;
  let reachedStage: PurposeStageId | null = null;
  let blockedAt: PurposeStageId | null = null;
  for (const stage of PURPOSE_CHAIN) {
    if (stages[stage.id]) {
      depth += 1;
      reachedStage = stage.id;
    } else {
      blockedAt = stage.id;
      break;
    }
  }
  return { reachedStage, depth, complete: depth === PURPOSE_CHAIN.length, blockedAt };
}

// --- The 7-question Purpose Gate ---
export const PURPOSE_GATE_QUESTIONS = [
  "هل يخدم أمانة المؤسس؟",
  "هل يحمي الحياة/الرعاية؟",
  "هل يوسّع الإمكانات؟",
  "هل قابل للتنفيذ بفاعلية؟",
  "هل يحقق نتيجة مثبتة؟",
  "هل يدعم الازدهار طويل الأمد؟",
  "هل يحافظ على الاستمرارية؟",
] as const;

export type PurposeGateStatus = "PASS" | "FLAG_REVIEW" | "BLOCK_ESCALATE";

export interface PurposeGateResult {
  answered: number;
  noCount: number;
  status: PurposeGateStatus;
  escalate: boolean;
}

/** any "no" ⇒ flag for review; ≥3 "no" ⇒ block + escalate to founder. */
export function evaluatePurposeGate(answers: boolean[]): PurposeGateResult {
  const noCount = answers.filter((a) => a === false).length;
  let status: PurposeGateStatus;
  if (noCount === 0) status = "PASS";
  else if (noCount < 3) status = "FLAG_REVIEW";
  else status = "BLOCK_ESCALATE";
  return { answered: answers.length, noCount, status, escalate: status === "BLOCK_ESCALATE" };
}

// --- 2.5 Founder Cognitive Model — 8 preference dimensions ---
export const FCM_DIMENSIONS = [
  { id: "TRADEOFF", name: "مقايضة", weight: 0.85, note: "رعاية/ربح 0.85" },
  { id: "RISK", name: "مخاطرة", weight: 0.0, note: "طبي ≈ صفر" },
  { id: "HORIZON", name: "أفق زمني", weight: 18, note: "استرداد 18 شهراً" },
  { id: "GROWTH", name: "نمو", weight: 0.7, note: "عضوي/جودة أولاً" },
  { id: "QUALITY", name: "جودة", weight: 1.0, note: "طبي غير قابل للتفاوض" },
  { id: "TRUST", name: "ثقة", weight: 0.6, note: "AI أداة لا كاهن" },
  { id: "CARE", name: "رعاية", weight: 1.0, note: "الحيوان أولوية مطلقة" },
  { id: "EVIDENCE", name: "دليل", weight: 0.9, note: "مصدران+ Proven/Probable فقط" },
] as const;

// --- 10 founder decision patterns (FDP-001..010), care-first ---
export const FOUNDER_DECISION_PATTERNS = [
  { id: "FDP-001", name: "سؤال الرعاية أولاً", weight: 0.95 },
  { id: "FDP-002", name: "السمعة ثانياً", weight: 0.9 },
  { id: "FDP-003", name: "الأشخاص ثالثاً", weight: 0.85 },
  { id: "FDP-004", name: "الدليل رابعاً", weight: 0.8 },
  { id: "FDP-005", name: "الازدهار طويل الأمد", weight: 0.75 },
  { id: "FDP-006", name: "الشفافية", weight: 0.7 },
  { id: "FDP-007", name: "الجودة الطبية غير قابلة للتفاوض", weight: 0.95 },
  { id: "FDP-008", name: "النمو العضوي", weight: 0.65 },
  { id: "FDP-009", name: "كفاءة التكلفة", weight: 0.6 },
  { id: "FDP-010", name: "احترام السياق التاريخي", weight: 0.55 },
] as const;
export type FounderDecisionPatternId = (typeof FOUNDER_DECISION_PATTERNS)[number]["id"];

// --- 5 founder override behaviors (FOB-001..005) ---
export const FOUNDER_OVERRIDE_BEHAVIORS = [
  { id: "FOB-001", name: "تجاوز رعاية طارئة" },
  { id: "FOB-002", name: "تجاوز سمعة حرجة" },
  { id: "FOB-003", name: "تجاوز التزام أخلاقي" },
  { id: "FOB-004", name: "تجاوز قرار استراتيجي" },
  { id: "FOB-005", name: "تجاوز مبدئي صريح" },
] as const;

// --- Escalation profile ---
const ESCALATION_PROFILE: Record<string, string> = {
  MEDICAL: "دقائق",
  STRATEGIC: "24-48 ساعة",
  DEFAULT: "قياسي (< 24 ساعة)",
};
export function escalationTime(category: string): string {
  return ESCALATION_PROFILE[category.toUpperCase()] ?? ESCALATION_PROFILE.DEFAULT;
}

export type AlignmentVerdict = "ALIGNED" | "PARTIAL" | "MISALIGNED";
export interface AlignmentResult {
  score: number; // [0,1]
  verdict: AlignmentVerdict;
  matched: FounderDecisionPatternId[];
}

const TOTAL_FDP_WEIGHT = FOUNDER_DECISION_PATTERNS.reduce((s, p) => s + p.weight, 0);

/** Weighted alignment of an intent to the founder's decision patterns. */
export function scoreAlignment(satisfiedPatterns: FounderDecisionPatternId[]): AlignmentResult {
  const set = new Set(satisfiedPatterns);
  const matched = FOUNDER_DECISION_PATTERNS.filter((p) => set.has(p.id));
  const score = matched.reduce((s, p) => s + p.weight, 0) / TOTAL_FDP_WEIGHT;
  const verdict: AlignmentVerdict = score >= 0.7 ? "ALIGNED" : score >= 0.4 ? "PARTIAL" : "MISALIGNED";
  return { score: Number(score.toFixed(4)), verdict, matched: matched.map((p) => p.id) };
}

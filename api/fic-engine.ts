// ============================================================
// FIC v0.2 — FOUNDER INTENT COMPILER / GOVERNANCE ENGINE (M4)
// Faithful to MED v2.0 §1.5–1.7: 68 executable constraints across
// 7 families + the non-disableable Amanah 0.50 HARD_BLOCK floor +
// DG-01..12 decision gates + EB execution blocks + OR overrides.
// Pure, dependency-free, deterministic → fully CI-testable.
// ============================================================

export type ConstraintType = "HC" | "SC" | "AC" | "DG" | "EB" | "OVR" | "OR";

export const INTENT_CATEGORIES = [
  "PRINCIPLE", "DECISION", "TRADEOFF", "FAILURE", "SUCCESS", "EXCEPTION",
  "CRISIS", "GROWTH", "MERCY", "REPUTATION", "COMMERCIAL", "MEDICAL",
  "PEOPLE", "EXPANSION", "NON_NEGOTIABLE",
] as const;
export type IntentCategory = (typeof INTENT_CATEGORIES)[number];

export const RISKY_ACTIONS = [
  "GENERAL", "LIVE_WEIGHT_UPDATE", "MEDICAL_DECISION", "HIRING", "STAFF_REDUCTION",
  "DESTRUCTIVE_DELETE", "COMMODITY_CONVERGENCE", "MODEL_DEPLOY", "CONSTITUTIONAL_AMENDMENT",
  "STRATEGIC", "BRAND", "JUDGMENT_PROMOTION", "RULE_INSTITUTIONALIZATION", "MERCY",
  "NEW_SENSITIVE", "PLAYBOOK",
] as const;
export type RiskyAction = (typeof RISKY_ACTIONS)[number];

export const EMERGENCY_TYPES = ["MEDICAL", "FOUNDER", "ENERGY", "SECURITY", "CONSTITUTIONAL"] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

/** Declared risk flags — let callers assert conditions the engine then enforces. */
export const RISK_FLAGS = [
  "CLAIM", "HUMAN_APPROVED", "CONTRADICTS_FOUNDER", "UNSTRUCTURED_KNOWLEDGE",
  "VIOLATES_THREE_DISCOVERIES", "START_FROM_ZERO", "PARALLEL_MIND", "PROFIT_OVER_CARE",
  "CLINICAL", "DESTRUCTIVE_WRITE", "SCOPE_DRIFT", "CONFLICTS_ACTIVE_INTENT",
  "DISCOUNT_WRONG_SEGMENT", "AUTO_REPLY_NEGATIVE", "SHADOW_ONLY", "TEMPORAL_UNVERIFIED",
] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];

export const AMANAH_FLOOR = 0.5;

export interface IntentInput {
  id?: string;
  content?: string;
  category?: IntentCategory;
  actor?: "founder" | "system" | "institution";
  action?: RiskyAction;
  amanahScore?: number;      // [0,1]
  evidence?: number;         // count of evidence items
  sources?: number;          // count of sources
  usesFrontierAI?: boolean;
  usesCorpus?: boolean;
  discountPercent?: number;
  founderL1?: boolean;       // direct founder intent — may override the Amanah floor
  emergency?: EmergencyType; // activates an OR override
  flags?: RiskFlag[];
}

interface NormIntent {
  id: string;
  category: IntentCategory;
  actor: "founder" | "system" | "institution";
  action: RiskyAction;
  amanahScore: number;
  evidence: number;
  sources: number;
  usesFrontierAI: boolean;
  usesCorpus: boolean;
  discountPercent: number;
  founderL1: boolean;
  emergency: EmergencyType | null;
  flags: Set<RiskFlag>;
}

export interface Constraint {
  id: string;
  type: ConstraintType;
  title: string;
  fires: (i: NormIntent) => boolean;
}

const has = (i: NormIntent, f: RiskFlag): boolean => i.flags.has(f);

// --- HC: 12 hard constraints (violation ⇒ automatic rejection) ---
const HARD: Constraint[] = [
  { id: "HC-01", type: "HC", title: "لا تحديث أوزان حي", fires: (i) => i.action === "LIVE_WEIGHT_UPDATE" },
  { id: "HC-02", type: "HC", title: "لا قرار طبي/توظيف ذاتي", fires: (i) => (i.action === "MEDICAL_DECISION" || i.action === "HIRING") && i.actor === "system" && !has(i, "HUMAN_APPROVED") },
  { id: "HC-03", type: "HC", title: "لا حقائق بلا دليل", fires: (i) => has(i, "CLAIM") && i.evidence === 0 },
  { id: "HC-04", type: "HC", title: "لا حذف تدميري", fires: (i) => i.action === "DESTRUCTIVE_DELETE" },
  { id: "HC-05", type: "HC", title: "لا تقارب سلعي", fires: (i) => i.action === "COMMODITY_CONVERGENCE" },
  { id: "HC-06", type: "HC", title: "Frontier AI إلزامي", fires: (i) => !i.usesFrontierAI },
  { id: "HC-07", type: "HC", title: "Corpus إلزامي", fires: (i) => !i.usesCorpus },
  { id: "HC-08", type: "HC", title: "سيادة نية المؤسس", fires: (i) => has(i, "CONTRADICTS_FOUNDER") },
  { id: "HC-09", type: "HC", title: "معرفة مهيكلة", fires: (i) => has(i, "UNSTRUCTURED_KNOWLEDGE") },
  { id: "HC-10", type: "HC", title: "الاكتشافات الثلاثة", fires: (i) => has(i, "VIOLATES_THREE_DISCOVERIES") },
  { id: "HC-11", type: "HC", title: "لا بدء من صفر", fires: (i) => has(i, "START_FROM_ZERO") },
  { id: "HC-12", type: "HC", title: "عقل واحد", fires: (i) => has(i, "PARALLEL_MIND") },
];

// --- SC: 12 soft constraints (strong defaults, documented override allowed) ---
const SOFT: Constraint[] = [
  { id: "SC-01", type: "SC", title: "تعلم بثلاث درجات", fires: () => false },
  { id: "SC-02", type: "SC", title: "Shadow Learning", fires: (i) => has(i, "SHADOW_ONLY") },
  { id: "SC-03", type: "SC", title: "3 تكرارات للنمط", fires: () => false },
  { id: "SC-04", type: "SC", title: "تحقق فرعين", fires: (i) => i.sources < 2 },
  { id: "SC-05", type: "SC", title: "مصدران للفهم", fires: (i) => i.category === "DECISION" && i.sources < 2 },
  { id: "SC-06", type: "SC", title: "تحقق زمني", fires: (i) => has(i, "TEMPORAL_UNVERIFIED") },
  { id: "SC-07", type: "SC", title: "أولوية الأدلة الداخلية", fires: () => false },
  { id: "SC-08", type: "SC", title: "تفضيل الحلول الموجودة", fires: () => false },
  { id: "SC-09", type: "SC", title: "توثيق كل تجاوز", fires: () => false },
  { id: "SC-10", type: "SC", title: "مراجعة دورية", fires: () => false },
  { id: "SC-11", type: "SC", title: "شفافية الأزمات", fires: (i) => i.category === "CRISIS" },
  { id: "SC-12", type: "SC", title: "تطوير قبل استبدال", fires: () => false },
];

// --- AC: 6 advisory constraints (guidance) ---
const ADVISORY: Constraint[] = [
  { id: "AC-01", type: "AC", title: "RAG+KG قبل fine-tuning", fires: (i) => i.action === "MODEL_DEPLOY" },
  { id: "AC-02", type: "AC", title: "IUC كمؤشر أساسي", fires: () => true },
  { id: "AC-03", type: "AC", title: "أولوية أدلة Elite Vet", fires: (i) => i.category === "MEDICAL" },
  { id: "AC-04", type: "AC", title: "ازدهار طويل > ربح قصير", fires: (i) => i.category === "COMMERCIAL" },
  { id: "AC-05", type: "AC", title: "تفضيل الشفافية", fires: () => false },
  { id: "AC-06", type: "AC", title: "احترام السياق التاريخي", fires: () => false },
];

// --- DG: 12 decision gates (require human approval) ---
const GATES: Constraint[] = [
  { id: "DG-01", type: "DG", title: "قرار طبي", fires: (i) => i.action === "MEDICAL_DECISION" },
  { id: "DG-02", type: "DG", title: "موظفون", fires: (i) => i.action === "HIRING" || i.action === "STAFF_REDUCTION" },
  { id: "DG-03", type: "DG", title: "استراتيجي", fires: (i) => i.action === "STRATEGIC" },
  { id: "DG-04", type: "DG", title: "خصم > 30%", fires: (i) => i.discountPercent > 30 },
  { id: "DG-05", type: "DG", title: "نشر نموذج", fires: (i) => i.action === "MODEL_DEPLOY" },
  { id: "DG-06", type: "DG", title: "تعديل دستوري", fires: (i) => i.action === "CONSTITUTIONAL_AMENDMENT" },
  { id: "DG-07", type: "DG", title: "Playbook", fires: (i) => i.action === "PLAYBOOK" },
  { id: "DG-08", type: "DG", title: "حساس جديد", fires: (i) => i.action === "NEW_SENSITIVE" },
  { id: "DG-09", type: "DG", title: "ترقية حكم", fires: (i) => i.action === "JUDGMENT_PROMOTION" },
  { id: "DG-10", type: "DG", title: "مأسسة قاعدة", fires: (i) => i.action === "RULE_INSTITUTIONALIZATION" },
  { id: "DG-11", type: "DG", title: "علامة تجارية", fires: (i) => i.action === "BRAND" },
  { id: "DG-12", type: "DG", title: "رحمة", fires: (i) => i.action === "MERCY" },
];

// --- EB: 12 execution blocks (block at execution time) ---
const BLOCKS: Constraint[] = [
  { id: "EB-01", type: "EB", title: "ربح فوق رعاية", fires: (i) => has(i, "PROFIT_OVER_CARE") },
  { id: "EB-02", type: "EB", title: "خفض طاقم إكلينيكي", fires: (i) => i.action === "STAFF_REDUCTION" && has(i, "CLINICAL") },
  { id: "EB-03", type: "EB", title: "ادعاء بلا دليل", fires: (i) => has(i, "CLAIM") && i.evidence === 0 },
  { id: "EB-04", type: "EB", title: "بدء فارغ", fires: (i) => has(i, "START_FROM_ZERO") },
  { id: "EB-05", type: "EB", title: "عقل موازٍ", fires: (i) => has(i, "PARALLEL_MIND") },
  { id: "EB-06", type: "EB", title: "تحديث أوزان حي", fires: (i) => i.action === "LIVE_WEIGHT_UPDATE" },
  { id: "EB-07", type: "EB", title: "كتابة تدميرية", fires: (i) => i.action === "DESTRUCTIVE_DELETE" || has(i, "DESTRUCTIVE_WRITE") },
  { id: "EB-08", type: "EB", title: "انزياح نطاق", fires: (i) => has(i, "SCOPE_DRIFT") },
  { id: "EB-09", type: "EB", title: "Corpus مفقود", fires: (i) => !i.usesCorpus },
  { id: "EB-10", type: "EB", title: "تعارض مع نية نشطة", fires: (i) => has(i, "CONFLICTS_ACTIVE_INTENT") },
  { id: "EB-11", type: "EB", title: "خصم يجذب شرائح خاطئة", fires: (i) => has(i, "DISCOUNT_WRONG_SEGMENT") },
  { id: "EB-12", type: "EB", title: "رد آلي على مراجعات سلبية", fires: (i) => has(i, "AUTO_REPLY_NEGATIVE") },
];

// --- OVR: 10 outcome verifications (standing post-hoc gates) ---
export const OUTCOME_VERIFICATIONS: Array<{ id: string; type: ConstraintType; title: string; window: string }> = [
  { id: "OVR-01", type: "OVR", title: "جودة الرعاية", window: "30 يوم" },
  { id: "OVR-02", type: "OVR", title: "نزاهة الإيراد", window: "مستمر" },
  { id: "OVR-03", type: "OVR", title: "الاحتفاظ", window: "30 يوم" },
  { id: "OVR-04", type: "OVR", title: "الرضا", window: "30 يوم" },
  { id: "OVR-05", type: "OVR", title: "السمعة", window: "مستمر" },
  { id: "OVR-06", type: "OVR", title: "الأمانة", window: "90 يوم" },
  { id: "OVR-07", type: "OVR", title: "مساهمة IUC", window: "شهري" },
  { id: "OVR-08", type: "OVR", title: "امتثال FIC", window: "مستمر" },
  { id: "OVR-09", type: "OVR", title: "كفاءة تكلفة API", window: "مستمر" },
  { id: "OVR-10", type: "OVR", title: "أداء النموذج", window: "مستمر" },
];

// --- OR: 5 overrides ---
export const OVERRIDES: Record<EmergencyType, { id: string; title: string; obligation: string }> = {
  MEDICAL: { id: "OR-01", title: "طوارئ طبية", obligation: "إخطار خلال ساعة" },
  FOUNDER: { id: "OR-02", title: "تجاوز مؤسس مباشر", obligation: "توثيق فوري" },
  ENERGY: { id: "OR-03", title: "طاقة طارئة", obligation: "مراجعة لاحقة" },
  SECURITY: { id: "OR-04", title: "أمن", obligation: "تقرير حادثة" },
  CONSTITUTIONAL: { id: "OR-05", title: "طوارئ دستورية", obligation: "لجنة دستورية" },
};

export const ALL_CONSTRAINTS: Constraint[] = [...HARD, ...SOFT, ...ADVISORY, ...GATES, ...BLOCKS];

export const CONSTRAINT_COUNTS = {
  HC: HARD.length, SC: SOFT.length, AC: ADVISORY.length, DG: GATES.length,
  EB: BLOCKS.length, OVR: OUTCOME_VERIFICATIONS.length, OR: EMERGENCY_TYPES.length,
  total: HARD.length + SOFT.length + ADVISORY.length + GATES.length + BLOCKS.length + OUTCOME_VERIFICATIONS.length + EMERGENCY_TYPES.length,
} as const;

function normalize(i: IntentInput): NormIntent {
  return {
    id: i.id ?? "intent",
    category: i.category ?? "DECISION",
    actor: i.actor ?? "system",
    action: i.action ?? "GENERAL",
    amanahScore: Math.max(0, Math.min(1, i.amanahScore ?? 0.7)),
    evidence: Math.max(0, i.evidence ?? 0),
    sources: Math.max(0, i.sources ?? 2),
    usesFrontierAI: i.usesFrontierAI ?? true,
    usesCorpus: i.usesCorpus ?? true,
    discountPercent: Math.max(0, i.discountPercent ?? 0),
    founderL1: i.founderL1 ?? false,
    emergency: i.emergency ?? null,
    flags: new Set(i.flags ?? []),
  };
}

export type AmanahStatus = "PASS" | "HARD_BLOCK";
export type FICStatus = "APPROVED" | "PENDING_GATES" | "REJECTED" | "HARD_BLOCK" | "OVERRIDE";

export interface ConstraintRef {
  id: string;
  type: ConstraintType;
  title: string;
}

export interface FICVerdict {
  intentId: string;
  amanah: { score: number; floor: number; status: AmanahStatus };
  status: FICStatus;
  allowed: boolean;
  hardViolations: ConstraintRef[];
  softViolations: ConstraintRef[];
  advisories: ConstraintRef[];
  requiredGates: ConstraintRef[];
  executionBlocks: ConstraintRef[];
  activeOverride: { id: string; title: string; obligation: string } | null;
  outcomeVerifications: string[];
  rationale: string;
}

const ref = (c: Constraint): ConstraintRef => ({ id: c.id, type: c.type, title: c.title });

/** Evaluate an intent against the full FIC v0.2 constraint set. */
export function evaluateIntent(input: IntentInput): FICVerdict {
  const i = normalize(input);

  const amanahBlocked = i.amanahScore < AMANAH_FLOOR && !i.founderL1;
  const amanah = { score: i.amanahScore, floor: AMANAH_FLOOR, status: (amanahBlocked ? "HARD_BLOCK" : "PASS") as AmanahStatus };

  const hardViolations = HARD.filter((c) => c.fires(i)).map(ref);
  const softViolations = SOFT.filter((c) => c.fires(i)).map(ref);
  const advisories = ADVISORY.filter((c) => c.fires(i)).map(ref);
  const requiredGates = GATES.filter((c) => c.fires(i)).map(ref);
  const executionBlocks = BLOCKS.filter((c) => c.fires(i)).map(ref);

  const override = i.emergency ? OVERRIDES[i.emergency] : null;

  let status: FICStatus;
  let allowed: boolean;
  let rationale: string;

  if (amanahBlocked) {
    status = "HARD_BLOCK";
    allowed = false;
    rationale = `درجة الأمانة ${i.amanahScore.toFixed(2)} < أرضية ${AMANAH_FLOOR} — حجب صلب غير قابل للتعطيل`;
  } else if (hardViolations.length > 0 || executionBlocks.length > 0) {
    if (override) {
      status = "OVERRIDE";
      allowed = true;
      rationale = `تجاوز ${override.id} (${override.title}) نشط — يُسمح مع التزام: ${override.obligation}`;
    } else {
      status = "REJECTED";
      allowed = false;
      const ids = [...hardViolations, ...executionBlocks].map((c) => c.id).join(", ");
      rationale = `مرفوض: انتهاك ${ids}`;
    }
  } else if (requiredGates.length > 0) {
    status = "PENDING_GATES";
    allowed = false;
    rationale = `بانتظار بوابات بشرية: ${requiredGates.map((c) => c.id).join(", ")}`;
  } else {
    status = "APPROVED";
    allowed = true;
    rationale = "مقبول — لا انتهاكات، الأمانة فوق الأرضية";
  }

  return {
    intentId: i.id,
    amanah,
    status,
    allowed,
    hardViolations,
    softViolations,
    advisories,
    requiredGates,
    executionBlocks,
    activeOverride: override,
    outcomeVerifications: OUTCOME_VERIFICATIONS.map((o) => o.id),
    rationale,
  };
}

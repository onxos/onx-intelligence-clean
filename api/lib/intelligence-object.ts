// ============================================================
// INTELLIGENCE OBJECT — deterministic reasoning lifecycle (B4)
//
// A single unit of reasoning modelled as an EXPLICIT finite state
// machine that walks the full cognitive lifecycle:
//
//   QUESTION → CONTEXT → SOURCES → CLAIMS → EVIDENCE
//            → HYPOTHESES → UNCERTAINTY → JUDGMENT
//            → PLAN → OUTCOME → LEARNING
//
// Every transition is a pure function that (a) validates the current
// stage, (b) validates its inputs, and (c) returns a NEW immutable
// object with an appended transition to its history. Invalid stages
// or missing/malformed inputs are refused with a LifecycleError —
// fail-closed, never silently advanced.
//
// Pure and deterministic: no wall clock, no randomness, no I/O, no
// keys. Ordering is captured by a monotonic `seq` counter so the
// history is reproducible in CI. Honest naming only: this is a
// runtime reasoning record — a plain deterministic state machine,
// nothing more.
// ============================================================

export const LIFECYCLE_STAGES = [
  "QUESTION",
  "CONTEXT",
  "SOURCES",
  "CLAIMS",
  "EVIDENCE",
  "HYPOTHESES",
  "UNCERTAINTY",
  "JUDGMENT",
  "PLAN",
  "OUTCOME",
  "LEARNING",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Ordinal position of a stage in the canonical lifecycle order. */
export function stageIndex(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

export type EvidenceStance = "SUPPORTING" | "OPPOSING";
export type Verdict = "SUPPORTED" | "REFUTED" | "INCONCLUSIVE";
export type UncertaintyBand = "LOW" | "MODERATE" | "HIGH";

export interface Source {
  id: string;
  label: string;
  /** Reliability of the source in [0,1]. */
  reliability: number;
}

export interface Claim {
  id: string;
  text: string;
}

export interface Evidence {
  id: string;
  claimId: string;
  stance: EvidenceStance;
  /** Strength of this evidence in [0,1]. */
  weight: number;
  sourceId: string;
}

export interface Hypothesis {
  id: string;
  text: string;
}

export interface UncertaintyAssessment {
  /** [0,1] — 1 = maximally uncertain (balanced / no evidence). */
  score: number;
  band: UncertaintyBand;
  supporting: number;
  opposing: number;
}

export interface Judgment {
  verdict: Verdict;
  /** [0,1] confidence derived from the evidence balance. */
  confidence: number;
  rationale: string;
}

export interface Plan {
  steps: string[];
}

export interface Outcome {
  success: boolean;
  note: string;
}

export interface Learning {
  lesson: string;
  /** Signed adjustment to future confidence, in [-1,1]. */
  confidenceDelta: number;
}

export interface LifecycleTransition {
  from: LifecycleStage;
  to: LifecycleStage;
  seq: number;
  note?: string;
}

export interface IntelligenceObject {
  id: string;
  stage: LifecycleStage;
  question: string;
  context?: string;
  sources: Source[];
  claims: Claim[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  uncertainty?: UncertaintyAssessment;
  judgment?: Judgment;
  plan?: Plan;
  outcome?: Outcome;
  learning?: Learning;
  /** Ids of existing insights (insight-*) linked to this reasoning object. */
  linkedInsightIds: string[];
  history: LifecycleTransition[];
  /** Monotonic counter backing deterministic ordering of transitions. */
  seq: number;
}

/** Raised for every invalid transition or malformed input — fail-closed. */
export class LifecycleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "LifecycleError";
    this.code = code;
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LifecycleError("EMPTY_FIELD", `الحقل «${field}» مطلوب ولا يجوز أن يكون فارغاً.`);
  }
  return value;
}

function requireUnit(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new LifecycleError("OUT_OF_RANGE", `الحقل «${field}» يجب أن يكون رقماً في المدى [0,1].`);
  }
  return value;
}

function requireStage(obj: IntelligenceObject, allowed: LifecycleStage[], action: string): void {
  if (!allowed.includes(obj.stage)) {
    throw new LifecycleError(
      "WRONG_STAGE",
      `لا يمكن تنفيذ «${action}» في الحالة ${obj.stage}؛ الحالات المسموحة: ${allowed.join(", ")}.`,
    );
  }
}

function round4(n: number): number {
  return Number(n.toFixed(4));
}

/** Advance to a new stage, appending a deterministic transition record. */
function advanceTo(obj: IntelligenceObject, to: LifecycleStage, patch: Partial<IntelligenceObject>, note?: string): IntelligenceObject {
  const seq = obj.seq + 1;
  const transition: LifecycleTransition = { from: obj.stage, to, seq, ...(note ? { note } : {}) };
  return {
    ...obj,
    ...patch,
    stage: to,
    seq,
    history: [...obj.history, transition],
  };
}

/** Create a fresh intelligence object at stage QUESTION. */
export function createIntelligenceObject(id: string, question: string): IntelligenceObject {
  requireNonEmpty(id, "id");
  requireNonEmpty(question, "question");
  return {
    id,
    stage: "QUESTION",
    question,
    sources: [],
    claims: [],
    evidence: [],
    hypotheses: [],
    linkedInsightIds: [],
    history: [],
    seq: 0,
  };
}

/** QUESTION → CONTEXT: frame the question with its situational context. */
export function setContext(obj: IntelligenceObject, context: string): IntelligenceObject {
  requireStage(obj, ["QUESTION"], "setContext");
  requireNonEmpty(context, "context");
  return advanceTo(obj, "CONTEXT", { context });
}

/** CONTEXT|SOURCES → SOURCES: attach a vetted source. */
export function addSource(obj: IntelligenceObject, source: Source): IntelligenceObject {
  requireStage(obj, ["CONTEXT", "SOURCES"], "addSource");
  requireNonEmpty(source?.id, "source.id");
  requireNonEmpty(source?.label, "source.label");
  requireUnit(source?.reliability, "source.reliability");
  if (obj.sources.some((s) => s.id === source.id)) {
    throw new LifecycleError("DUPLICATE", `المصدر «${source.id}» مضاف مسبقاً.`);
  }
  const sources = [...obj.sources, source];
  return obj.stage === "SOURCES"
    ? { ...obj, sources }
    : advanceTo(obj, "SOURCES", { sources });
}

/** SOURCES|CLAIMS → CLAIMS: register a claim to be tested. Requires ≥1 source. */
export function addClaim(obj: IntelligenceObject, claim: Claim): IntelligenceObject {
  requireStage(obj, ["SOURCES", "CLAIMS"], "addClaim");
  if (obj.sources.length === 0) {
    throw new LifecycleError("NO_SOURCES", "لا يمكن تسجيل ادعاء بلا مصدر واحد على الأقل.");
  }
  requireNonEmpty(claim?.id, "claim.id");
  requireNonEmpty(claim?.text, "claim.text");
  if (obj.claims.some((c) => c.id === claim.id)) {
    throw new LifecycleError("DUPLICATE", `الادعاء «${claim.id}» مضاف مسبقاً.`);
  }
  const claims = [...obj.claims, claim];
  return obj.stage === "CLAIMS"
    ? { ...obj, claims }
    : advanceTo(obj, "CLAIMS", { claims });
}

/** CLAIMS|EVIDENCE → EVIDENCE: attach supporting/opposing evidence to a claim. */
export function addEvidence(obj: IntelligenceObject, evidence: Evidence): IntelligenceObject {
  requireStage(obj, ["CLAIMS", "EVIDENCE"], "addEvidence");
  requireNonEmpty(evidence?.id, "evidence.id");
  requireNonEmpty(evidence?.claimId, "evidence.claimId");
  requireNonEmpty(evidence?.sourceId, "evidence.sourceId");
  requireUnit(evidence?.weight, "evidence.weight");
  if (evidence.stance !== "SUPPORTING" && evidence.stance !== "OPPOSING") {
    throw new LifecycleError("BAD_STANCE", "موقف الدليل يجب أن يكون SUPPORTING أو OPPOSING.");
  }
  if (!obj.claims.some((c) => c.id === evidence.claimId)) {
    throw new LifecycleError("UNKNOWN_CLAIM", `الدليل يشير إلى ادعاء غير معروف «${evidence.claimId}».`);
  }
  if (!obj.sources.some((s) => s.id === evidence.sourceId)) {
    throw new LifecycleError("UNKNOWN_SOURCE", `الدليل يشير إلى مصدر غير معروف «${evidence.sourceId}».`);
  }
  if (obj.evidence.some((e) => e.id === evidence.id)) {
    throw new LifecycleError("DUPLICATE", `الدليل «${evidence.id}» مضاف مسبقاً.`);
  }
  const list = [...obj.evidence, evidence];
  return obj.stage === "EVIDENCE"
    ? { ...obj, evidence: list }
    : advanceTo(obj, "EVIDENCE", { evidence: list });
}

/** EVIDENCE|HYPOTHESES → HYPOTHESES: propose a hypothesis. Requires ≥1 evidence. */
export function addHypothesis(obj: IntelligenceObject, hypothesis: Hypothesis): IntelligenceObject {
  requireStage(obj, ["EVIDENCE", "HYPOTHESES"], "addHypothesis");
  if (obj.evidence.length === 0) {
    throw new LifecycleError("NO_EVIDENCE", "لا يمكن صياغة فرضية بلا دليل واحد على الأقل.");
  }
  requireNonEmpty(hypothesis?.id, "hypothesis.id");
  requireNonEmpty(hypothesis?.text, "hypothesis.text");
  if (obj.hypotheses.some((h) => h.id === hypothesis.id)) {
    throw new LifecycleError("DUPLICATE", `الفرضية «${hypothesis.id}» مضافة مسبقاً.`);
  }
  const hypotheses = [...obj.hypotheses, hypothesis];
  return obj.stage === "HYPOTHESES"
    ? { ...obj, hypotheses }
    : advanceTo(obj, "HYPOTHESES", { hypotheses });
}

/** Deterministic weighted tallies of supporting vs opposing evidence. */
export function tallyEvidence(obj: IntelligenceObject): { supporting: number; opposing: number } {
  let supporting = 0;
  let opposing = 0;
  for (const e of obj.evidence) {
    const reliability = obj.sources.find((s) => s.id === e.sourceId)?.reliability ?? 0;
    const contribution = e.weight * reliability;
    if (e.stance === "SUPPORTING") supporting += contribution;
    else opposing += contribution;
  }
  return { supporting: round4(supporting), opposing: round4(opposing) };
}

/** HYPOTHESES → UNCERTAINTY: quantify uncertainty from the evidence balance. */
export function assessUncertainty(obj: IntelligenceObject): IntelligenceObject {
  requireStage(obj, ["HYPOTHESES"], "assessUncertainty");
  if (obj.hypotheses.length === 0) {
    throw new LifecycleError("NO_HYPOTHESES", "لا يمكن تقييم عدم اليقين بلا فرضية واحدة على الأقل.");
  }
  const { supporting, opposing } = tallyEvidence(obj);
  const total = supporting + opposing;
  // No evidence ⇒ maximally uncertain; balanced ⇒ uncertain; one-sided ⇒ certain.
  const score = total === 0 ? 1 : round4(1 - Math.abs(supporting - opposing) / total);
  const band: UncertaintyBand = score < 0.34 ? "LOW" : score < 0.67 ? "MODERATE" : "HIGH";
  return advanceTo(obj, "UNCERTAINTY", {
    uncertainty: { score, band, supporting, opposing },
  });
}

/** UNCERTAINTY → JUDGMENT: render a verdict from the evidence balance. */
export function renderJudgment(obj: IntelligenceObject): IntelligenceObject {
  requireStage(obj, ["UNCERTAINTY"], "renderJudgment");
  const assessment = obj.uncertainty;
  if (!assessment) {
    throw new LifecycleError("NO_ASSESSMENT", "لا يوجد تقييم عدم يقين لإصدار الحكم.");
  }
  const total = assessment.supporting + assessment.opposing;
  const net = total === 0 ? 0 : (assessment.supporting - assessment.opposing) / total;
  let verdict: Verdict;
  if (net > 0.2) verdict = "SUPPORTED";
  else if (net < -0.2) verdict = "REFUTED";
  else verdict = "INCONCLUSIVE";
  const confidence = round4(Math.abs(net));
  const rationale =
    verdict === "SUPPORTED"
      ? `الأدلة المؤيدة (${assessment.supporting}) ترجّح على المعارضة (${assessment.opposing}).`
      : verdict === "REFUTED"
        ? `الأدلة المعارضة (${assessment.opposing}) ترجّح على المؤيدة (${assessment.supporting}).`
        : "الأدلة غير حاسمة؛ الحكم يبقى غير حاسم بصدق.";
  return advanceTo(obj, "JUDGMENT", {
    judgment: { verdict, confidence, rationale },
  });
}

/** JUDGMENT → PLAN: commit to an ordered plan of steps. */
export function setPlan(obj: IntelligenceObject, steps: string[]): IntelligenceObject {
  requireStage(obj, ["JUDGMENT"], "setPlan");
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new LifecycleError("EMPTY_PLAN", "الخطة يجب أن تحوي خطوة واحدة على الأقل.");
  }
  steps.forEach((s, i) => requireNonEmpty(s, `steps[${i}]`));
  return advanceTo(obj, "PLAN", { plan: { steps: [...steps] } });
}

/** PLAN → OUTCOME: record the observed outcome of executing the plan. */
export function recordOutcome(obj: IntelligenceObject, outcome: Outcome): IntelligenceObject {
  requireStage(obj, ["PLAN"], "recordOutcome");
  if (typeof outcome?.success !== "boolean") {
    throw new LifecycleError("BAD_OUTCOME", "النتيجة يجب أن تحدد success (نجاح/فشل).");
  }
  requireNonEmpty(outcome?.note, "outcome.note");
  return advanceTo(obj, "OUTCOME", { outcome: { success: outcome.success, note: outcome.note } });
}

/** OUTCOME → LEARNING (terminal): distil the lesson learned. */
export function learn(obj: IntelligenceObject, lesson: string): IntelligenceObject {
  requireStage(obj, ["OUTCOME"], "learn");
  requireNonEmpty(lesson, "lesson");
  const outcome = obj.outcome;
  // Deterministic confidence adjustment: success reinforces, failure discounts,
  // scaled by the judgment confidence that drove the plan.
  const base = obj.judgment?.confidence ?? 0;
  const confidenceDelta = round4((outcome?.success ? 1 : -1) * base);
  return advanceTo(obj, "LEARNING", { learning: { lesson, confidenceDelta } });
}

/** Link an EXISTING insight (insight-* id) to this reasoning object. */
export function linkInsight(obj: IntelligenceObject, insightId: string): IntelligenceObject {
  requireNonEmpty(insightId, "insightId");
  if (!insightId.startsWith("insight-")) {
    throw new LifecycleError("NOT_AN_INSIGHT", `المعرّف «${insightId}» ليس رؤية (insight-*).`);
  }
  if (obj.linkedInsightIds.includes(insightId)) return obj;
  return { ...obj, linkedInsightIds: [...obj.linkedInsightIds, insightId] };
}

/** True when the object has walked every stage to LEARNING. */
export function isComplete(obj: IntelligenceObject): boolean {
  return obj.stage === "LEARNING";
}

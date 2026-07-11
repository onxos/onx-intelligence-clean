// ============================================================
// EVALUATION & LEARNING — B6: golden sets + regression gates
//
// A deterministic evaluation harness over ALREADY-MERGED capabilities.
// Each golden set pairs fixed inputs with expected ground-truth outputs;
// a per-capability RUNNER maps input → { label, confidence? } by calling
// the real merged function (reuse, not re-implementation). From the run
// we compute honest metrics (accuracy / precision / recall / F1) and,
// when confidences are present, a calibration curve (bins + ECE).
//
// The regression gate is FAIL-CLOSED: a run is compared to a committed
// baseline and FAILS — naming the exact broken case(s) — if any
// baseline-passing golden case now fails, or if headline accuracy/F1
// drops below (baseline − tolerance). No silent thresholds.
//
// Every run is recorded into OCMBR (B0) as RUN (runtime) evidence, so
// measurement FEEDS the executive ledger rather than running beside it.
//
// Honest naming: this measures deterministic capabilities against fixed
// truth. No model, no key, no DB — fully reproducible in CI.
// ============================================================

import {
  recordEvidence,
  type EvidenceRecord,
} from "./ocmbr-store";
import { classifyProgress, type ProgressState } from "../measurement-engine";

// ── Capability under which B6 records its own evaluation evidence ──
export const B6_CAPABILITY_CODE = "B6-EVALUATION-LEARNING";
export const B6_CRITERION = "ac-b6-golden";

// ── Types ──────────────────────────────────────────────────────────
export interface GoldenCase {
  id: string;
  input: unknown;
  /** Expected ground-truth output label. */
  expected: string;
}

export interface GoldenSet {
  /** Runner key, e.g. "codex-guard.scanText". */
  capability: string;
  /** OCMBR code of the merged capability being evaluated (provenance). */
  subjectCode: string;
  /** Which label counts as the "positive" class for precision/recall. */
  positiveLabel: string;
  cases: GoldenCase[];
}

export interface RunnerOutput {
  label: string;
  /** Optional declared confidence in [0,1] for calibration. */
  confidence?: number | null;
}

export type CapabilityRunner = (input: unknown) => RunnerOutput;

export interface CaseResult {
  id: string;
  expected: string;
  predicted: string;
  confidence: number | null;
  correct: boolean;
}

export interface CalibrationBin {
  lower: number;
  upper: number;
  count: number;
  avgConfidence: number;
  accuracy: number;
}

export interface CalibrationCurve {
  bins: CalibrationBin[];
  /** Expected Calibration Error in [0,1] — lower is better. */
  ece: number;
  sampleCount: number;
}

export interface EvaluationMetrics {
  capability: string;
  subjectCode: string;
  total: number;
  correct: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  calibration: CalibrationCurve | null;
  passingCaseIds: string[];
  results: CaseResult[];
  computedAt: string;
}

export interface EvalBaseline {
  capability: string;
  accuracy: number;
  f1: number;
  ece: number | null;
  passingCaseIds: string[];
  recordedAt: string;
}

export interface RegressionGateResult {
  capability: string;
  passed: boolean;
  failures: string[];
  brokenCaseIds: string[];
  progress: ProgressState;
  accuracyDelta: number;
  f1Delta: number;
}

/** Raised for malformed evaluation operations — fail-closed. */
export class EvaluationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "EvaluationError";
    this.code = code;
  }
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const DEFAULT_TOLERANCE = 0.001;
const CALIBRATION_BINS = 5;

// ── Runner registry ────────────────────────────────────────────────
const runners = new Map<string, CapabilityRunner>();

export function registerRunner(capability: string, runner: CapabilityRunner): void {
  if (typeof capability !== "string" || capability.trim().length === 0) {
    throw new EvaluationError("BAD_CAPABILITY", "مفتاح القدرة مطلوب.");
  }
  if (typeof runner !== "function") {
    throw new EvaluationError("BAD_RUNNER", "المشغّل يجب أن يكون دالة.");
  }
  runners.set(capability, runner);
}

export function getRunner(capability: string): CapabilityRunner | undefined {
  return runners.get(capability);
}

// ── Metrics ────────────────────────────────────────────────────────
function toUnit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/**
 * Run a golden set through its registered runner and compute metrics.
 * FAIL-CLOSED: no registered runner ⇒ throw (an unevaluated capability
 * must never silently "pass").
 */
export function runGoldenSet(set: GoldenSet): EvaluationMetrics {
  if (!set || !Array.isArray(set.cases) || set.cases.length === 0) {
    throw new EvaluationError("EMPTY_SET", "المجموعة الذهبية تتطلب حالة واحدة على الأقل.");
  }
  const runner = runners.get(set.capability);
  if (!runner) {
    throw new EvaluationError("NO_RUNNER", `لا مشغّل مسجّل للقدرة «${set.capability}».`);
  }

  const results: CaseResult[] = set.cases.map((c) => {
    const out = runner(c.input);
    const predicted = out.label;
    return {
      id: c.id,
      expected: c.expected,
      predicted,
      confidence: toUnit(out.confidence),
      correct: predicted === c.expected,
    };
  });

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;

  // Positive-class precision/recall/F1.
  const pos = set.positiveLabel;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const r of results) {
    const predPos = r.predicted === pos;
    const truthPos = r.expected === pos;
    if (predPos && truthPos) tp += 1;
    else if (predPos && !truthPos) fp += 1;
    else if (!predPos && truthPos) fn += 1;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    capability: set.capability,
    subjectCode: set.subjectCode,
    total,
    correct,
    accuracy: round4(correct / total),
    precision: round4(precision),
    recall: round4(recall),
    f1: round4(f1),
    calibration: computeCalibration(results),
    passingCaseIds: results.filter((r) => r.correct).map((r) => r.id),
    results,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Reliability-diagram calibration over cases that carry a confidence.
 * Returns null when no case declares one (calibration is meaningless).
 */
export function computeCalibration(results: CaseResult[]): CalibrationCurve | null {
  const scored = results.filter((r) => r.confidence !== null) as Array<CaseResult & { confidence: number }>;
  if (scored.length === 0) return null;

  const bins: CalibrationBin[] = [];
  let ece = 0;
  for (let b = 0; b < CALIBRATION_BINS; b++) {
    const lower = b / CALIBRATION_BINS;
    const upper = (b + 1) / CALIBRATION_BINS;
    const inBin = scored.filter((r) =>
      b === CALIBRATION_BINS - 1 ? r.confidence >= lower && r.confidence <= upper : r.confidence >= lower && r.confidence < upper,
    );
    const count = inBin.length;
    const avgConfidence = count === 0 ? 0 : inBin.reduce((s, r) => s + r.confidence, 0) / count;
    const accuracy = count === 0 ? 0 : inBin.filter((r) => r.correct).length / count;
    if (count > 0) ece += (count / scored.length) * Math.abs(avgConfidence - accuracy);
    bins.push({ lower, upper, count, avgConfidence: round4(avgConfidence), accuracy: round4(accuracy) });
  }
  return { bins, ece: round4(ece), sampleCount: scored.length };
}

// ── Regression gate (fail-closed) ──────────────────────────────────
/**
 * Compare a fresh run against a committed baseline. FAIL-CLOSED: any
 * baseline-passing case that now fails, or a headline accuracy/F1 drop
 * below (baseline − tolerance), fails the gate with an explicit,
 * case-naming message. No silent thresholds.
 */
export function regressionGate(
  metrics: EvaluationMetrics,
  baseline: EvalBaseline | undefined,
  tolerance = DEFAULT_TOLERANCE,
): RegressionGateResult {
  const failures: string[] = [];
  if (!baseline) {
    return {
      capability: metrics.capability,
      passed: false,
      failures: [`لا خط أساس مسجّل للقدرة «${metrics.capability}» — رفض آمن (fail-closed).`],
      brokenCaseIds: [],
      progress: "STABILIZING",
      accuracyDelta: 0,
      f1Delta: 0,
    };
  }

  const nowPassing = new Set(metrics.passingCaseIds);
  const brokenCaseIds = baseline.passingCaseIds.filter((id) => !nowPassing.has(id));
  for (const id of brokenCaseIds) {
    failures.push(`حالة ذهبية انكسرت: «${id}» كانت تمر في خط الأساس والآن تفشل.`);
  }

  const accuracyDelta = round4(metrics.accuracy - baseline.accuracy);
  const f1Delta = round4(metrics.f1 - baseline.f1);
  if (metrics.accuracy < baseline.accuracy - tolerance) {
    failures.push(
      `تراجع الدقة (accuracy): ${metrics.accuracy} < الأساس ${baseline.accuracy} − السماحية ${tolerance}.`,
    );
  }
  if (metrics.f1 < baseline.f1 - tolerance) {
    failures.push(`تراجع F1: ${metrics.f1} < الأساس ${baseline.f1} − السماحية ${tolerance}.`);
  }

  return {
    capability: metrics.capability,
    passed: failures.length === 0,
    failures,
    brokenCaseIds,
    progress: classifyProgress(metrics.accuracy, baseline.accuracy),
    accuracyDelta,
    f1Delta,
  };
}

// ── OCMBR integration ──────────────────────────────────────────────
/**
 * Record an evaluation run as RUN (runtime) evidence in OCMBR — the
 * measurement feeds the executive ledger. `passed` reflects the gate;
 * a failing gate records honest non-passing evidence (state unchanged).
 */
export function recordEvaluationEvidence(
  metrics: EvaluationMetrics,
  gate: RegressionGateResult,
): EvidenceRecord {
  const summary =
    `eval ${metrics.subjectCode}: acc=${metrics.accuracy} f1=${metrics.f1}` +
    (metrics.calibration ? ` ece=${metrics.calibration.ece}` : "") +
    ` gate=${gate.passed ? "PASS" : "FAIL"} progress=${gate.progress}` +
    (gate.failures.length ? ` failures=[${gate.failures.join(" | ")}]` : "");
  return recordEvidence({
    capabilityCode: B6_CAPABILITY_CODE,
    kind: "runtime",
    criterionId: B6_CRITERION,
    command: `evaluation-learning:runGoldenSet(${metrics.capability})`,
    output: summary,
    verifier: "evaluation-learning",
    passed: gate.passed,
    date: metrics.computedAt,
  });
}

// Test-only: clear the runner registry.
export function __resetEvaluationForTests(): void {
  runners.clear();
}

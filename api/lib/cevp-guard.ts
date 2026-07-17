// ============================================================
// CEvP GUARD — Civilizational Evolution Preservation, fail-CLOSED (B3)
//
// Evaluates a PROPOSED change against one question: does it PRESERVE power
// (capability/coverage/integrity/reversibility) or cause CONTRACTION
// (انكماش)? The charter demands fail-CLOSED: if preservation cannot be
// PROVEN, the change is REJECTED — silence / uncertainty is never accepted.
//
// Deterministic, pure (no I/O, no randomness) so it runs in CI and can back
// an audit trail. Sits alongside AuthorityGate + CCMR as the third B3
// constitutional runtime service.
// ============================================================

/**
 * A measure of "power" across dimensions, each in [0, 1] (higher = more
 * capacity). `integrity` and `reversibility` are CRITICAL: a drop in either
 * is a contraction of safety and is rejected regardless of net gain.
 */
export interface PowerMeasure {
  capability: number;
  coverage: number;
  integrity: number;
  reversibility: number;
}

export interface ChangeProof {
  kind: string;
  ref: string;
}

export interface ProposedChange {
  id: string;
  description?: string;
  before: PowerMeasure;
  after: PowerMeasure;
  /** Evidence the after-state is real. Absent/empty ⇒ cannot prove ⇒ REJECT. */
  proof?: ChangeProof[];
}

export type CevpVerdict = "PRESERVES" | "CONTRACTS" | "INDETERMINATE";
export type CevpDecision = "ACCEPT" | "REJECT";

export interface CevpEvaluation {
  changeId: string;
  decision: CevpDecision;
  verdict: CevpVerdict;
  /** Signed sum of (after − before) across all dimensions. */
  netDelta: number;
  /** Critical dimensions (integrity, reversibility) that regressed. */
  regressions: string[];
  reason: string;
}

export const POWER_DIMENSIONS: (keyof PowerMeasure)[] = [
  "capability",
  "coverage",
  "integrity",
  "reversibility",
];

export const CRITICAL_DIMENSIONS: (keyof PowerMeasure)[] = [
  "integrity",
  "reversibility",
];

function isFiniteInUnit(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function isValidMeasure(m: unknown): m is PowerMeasure {
  if (!m || typeof m !== "object") return false;
  const rec = m as Record<string, unknown>;
  return POWER_DIMENSIONS.every((d) => isFiniteInUnit(rec[d]));
}

function reject(changeId: string, verdict: CevpVerdict, reason: string): CevpEvaluation {
  return { changeId, decision: "REJECT", verdict, netDelta: 0, regressions: [], reason };
}

/**
 * Evaluate a proposed change. fail-CLOSED at every uncertainty:
 *   • malformed / missing measures            → REJECT (INDETERMINATE)
 *   • no proof the after-state is real         → REJECT (INDETERMINATE)
 *   • any critical dimension regresses         → REJECT (CONTRACTS)
 *   • net power delta < 0                       → REJECT (CONTRACTS)
 * Only a fully-proven, non-contracting change  → ACCEPT (PRESERVES).
 */
export function evaluateChange(change: ProposedChange): CevpEvaluation {
  try {
    const id =
      change && typeof change.id === "string" && change.id.trim() !== ""
        ? change.id
        : "<unknown>";

    if (!change || typeof change !== "object") {
      return reject(id, "INDETERMINATE", "تغيير غير صالح — رفض (fail-closed).");
    }
    if (!isValidMeasure(change.before) || !isValidMeasure(change.after)) {
      return reject(
        id,
        "INDETERMINATE",
        "قياسات القوة (قبل/بعد) ناقصة أو خارج المجال [0,1] — تعذّر إثبات الحفظ، رفض (fail-closed).",
      );
    }

    const proof = Array.isArray(change.proof) ? change.proof : [];
    const hasValidProof = proof.some(
      (p) =>
        p &&
        typeof p.kind === "string" &&
        p.kind.trim() !== "" &&
        typeof p.ref === "string" &&
        p.ref.trim() !== "",
    );
    if (!hasValidProof) {
      return reject(
        id,
        "INDETERMINATE",
        "لا دليل يثبت واقعية حالة ما بعد التغيير — تعذّر إثبات الحفظ، رفض (fail-closed).",
      );
    }

    const before = change.before;
    const after = change.after;

    const regressions = CRITICAL_DIMENSIONS.filter((d) => after[d] < before[d]).map(
      (d) => String(d),
    );

    const netDelta = POWER_DIMENSIONS.reduce(
      (sum, d) => sum + (after[d] - before[d]),
      0,
    );

    if (regressions.length > 0) {
      return {
        changeId: id,
        decision: "REJECT",
        verdict: "CONTRACTS",
        netDelta,
        regressions,
        reason: `انكماش في بُعد حرج (${regressions.join(
          "، ",
        )}) — رفض (fail-closed): لا يُقبل تراجع السلامة مهما كان صافي المكسب.`,
      };
    }

    if (netDelta < 0) {
      return {
        changeId: id,
        decision: "REJECT",
        verdict: "CONTRACTS",
        netDelta,
        regressions,
        reason: `صافي القوة سالب (${netDelta.toFixed(
          3,
        )}) — انكماش، رفض (fail-closed).`,
      };
    }

    return {
      changeId: id,
      decision: "ACCEPT",
      verdict: "PRESERVES",
      netDelta,
      regressions,
      reason: `يحفظ القوة: لا تراجع في الأبعاد الحرجة وصافي الدلتا ${netDelta.toFixed(
        3,
      )} ≥ 0، مع دليل واقعية.`,
    };
  } catch {
    // Any unexpected failure rejects — the guard never fails open.
    return reject(
      change?.id ?? "<unknown>",
      "INDETERMINATE",
      "خطأ غير متوقع أثناء التقييم — رفض (fail-closed).",
    );
  }
}

export function evaluateChanges(changes: ProposedChange[]): CevpEvaluation[] {
  return (Array.isArray(changes) ? changes : []).map(evaluateChange);
}

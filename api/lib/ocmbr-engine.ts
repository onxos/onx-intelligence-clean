// ============================================================
// OCMBR ENGINE — ONX Capability & Maturity Bookkeeping Runtime
// The executive truth ledger's DETERMINISTIC core.
//
// Governance rule #1: a capability's maturity is COMPUTED from its
// evidence records — never declared by hand. This module is pure
// (no I/O, no DB, no keys) so it runs in CI with zero dependencies
// and is fully deterministic.
//
// The five states (الحالات الخمس), lowest → highest:
//   MISSING     مفقود        — no evidence at all
//   DOCUMENTED  موثق         — only DOC evidence (prose, no runnable proof)
//   DEMO        Demo         — demonstrable (RUN/DEMO) but not proven by code+test
//   PARTIAL     جزئي         — real code/test/run evidence, criteria not fully covered
//   VERIFIED    منفذ ومثبت   — code + test + passing run, every criterion covered
// ============================================================

export const EVIDENCE_KINDS = [
  "CODE", // a code artifact exists (path / commit)
  "TEST", // an automated test exists and asserts behaviour
  "RUN", // a literal command was run with captured output
  "COMMIT", // a git commit reference
  "DOC", // documentation / prose only
  "DEMO", // a manual or scripted demonstration (not an automated test)
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const MATURITY_STATES = [
  "MISSING",
  "DOCUMENTED",
  "DEMO",
  "PARTIAL",
  "VERIFIED",
] as const;
export type MaturityState = (typeof MATURITY_STATES)[number];

/** Human labels (Arabic) for the five states, per the founder charter. */
export const MATURITY_LABEL_AR: Record<MaturityState, string> = {
  MISSING: "مفقود",
  DOCUMENTED: "موثق",
  DEMO: "Demo",
  PARTIAL: "جزئي",
  VERIFIED: "منفذ ومثبت",
};

/** Ordinal rank so callers can compare / sort states deterministically. */
export function maturityRank(state: MaturityState): number {
  return MATURITY_STATES.indexOf(state);
}

export interface EvidenceRecord {
  id: string;
  capabilityCode: string;
  /** Which acceptance criterion this evidence satisfies (if any). */
  criterionId?: string;
  kind: EvidenceKind;
  /** The literal command executed (for RUN/TEST/DEMO). */
  command?: string;
  /** Captured output / result snippet. */
  output?: string;
  /** Git commit reference. */
  commit?: string;
  /** ISO date the evidence was captured. */
  date?: string;
  /** Who / what verified it (independent verification, charter rule #1). */
  verifier?: string;
  /** Whether the evidence represents a PASSING result. Defaults to true. */
  passed?: boolean;
}

export interface AcceptanceCriterion {
  id: string;
  capabilityCode: string;
  statement: string;
  /** The literal command that proves this criterion. */
  verifyCommand?: string;
}

/**
 * Compute the maturity state of a single capability PURELY from its
 * evidence records and acceptance criteria. Deterministic and total.
 */
export function computeMaturity(
  criteria: AcceptanceCriterion[],
  evidence: EvidenceRecord[],
): {
  state: MaturityState;
  labelAr: string;
  reason: string;
  signals: {
    hasCode: boolean;
    hasTest: boolean;
    hasRun: boolean;
    hasDoc: boolean;
    hasDemo: boolean;
    criteriaTotal: number;
    criteriaCovered: number;
    coverage: number;
  };
} {
  const passing = evidence.filter((e) => e.passed !== false);

  const hasKind = (k: EvidenceKind) => passing.some((e) => e.kind === k);
  const hasCode = hasKind("CODE");
  const hasTest = hasKind("TEST");
  const hasRun = hasKind("RUN");
  const hasDemo = hasKind("DEMO");
  // DOC status can be satisfied by any DOC evidence even if not "passing".
  const hasDoc = evidence.some((e) => e.kind === "DOC");

  const criteriaTotal = criteria.length;
  const coveredIds = new Set(
    passing
      .filter((e) => e.criterionId)
      .map((e) => e.criterionId as string),
  );
  const criteriaCovered = criteria.filter((c) => coveredIds.has(c.id)).length;
  const coverage =
    criteriaTotal === 0 ? 0 : criteriaCovered / criteriaTotal;

  const signals = {
    hasCode,
    hasTest,
    hasRun,
    hasDoc,
    hasDemo,
    criteriaTotal,
    criteriaCovered,
    coverage,
  };

  // --- No evidence at all → MISSING ---
  if (evidence.length === 0) {
    return {
      state: "MISSING",
      labelAr: MATURITY_LABEL_AR.MISSING,
      reason: "لا يوجد أي دليل مسجل.",
      signals,
    };
  }

  const hasRunnableProof = hasRun || hasDemo || hasCode || hasTest;

  // --- Only documentation, nothing runnable → DOCUMENTED ---
  if (!hasRunnableProof) {
    return {
      state: "DOCUMENTED",
      labelAr: MATURITY_LABEL_AR.DOCUMENTED,
      reason: "أدلة توثيقية فقط بلا كود/اختبار/تشغيل.",
      signals,
    };
  }

  // --- VERIFIED: code + test + passing run, every criterion covered ---
  const fullyCovered = criteriaTotal > 0 && criteriaCovered === criteriaTotal;
  if (hasCode && hasTest && hasRun && fullyCovered) {
    return {
      state: "VERIFIED",
      labelAr: MATURITY_LABEL_AR.VERIFIED,
      reason:
        "كود + اختبار + تشغيل ناجح، وكل معايير القبول مغطاة بأدلة.",
      signals,
    };
  }

  // --- DEMO: demonstrable but missing the code+test proof spine ---
  // (a run/demo exists, but there is no code OR no test to back it).
  if ((hasRun || hasDemo) && !(hasCode && hasTest)) {
    return {
      state: "DEMO",
      labelAr: MATURITY_LABEL_AR.DEMO,
      reason: "قابل للعرض (تشغيل/Demo) لكن دون كود+اختبار مثبِتَين.",
      signals,
    };
  }

  // --- PARTIAL: everything else with real engineering evidence ---
  return {
    state: "PARTIAL",
    labelAr: MATURITY_LABEL_AR.PARTIAL,
    reason:
      criteriaTotal === 0
        ? "توجد أدلة كود/اختبار لكن لا معايير قبول معرّفة للتحقق الكامل."
        : `أدلة جزئية: تغطية معايير ${criteriaCovered}/${criteriaTotal}${
            hasRun ? "" : "، بلا تشغيل ناجح مسجّل"
          }.`,
    signals,
  };
}

export interface CapabilityInput {
  code: string;
  title: string;
  program: string;
  owner?: string;
  description?: string;
}

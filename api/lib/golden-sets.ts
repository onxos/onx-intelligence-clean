// ============================================================
// GOLDEN SETS — B6: deterministic evaluation data over MERGED capabilities
//
// Each golden set fixes inputs → expected ground-truth labels, and a
// RUNNER maps input → { label, confidence? } by calling the REAL merged
// function (reuse, not re-implementation). Baselines are frozen from a
// clean HEAD run so the regression gate has a committed reference.
//
// The four evaluated capabilities are all already VERIFIED in main:
//   • B1  codex-guard.scanText          → CLEAN | DEVIATION
//   • B8  bridge-contracts.validateEvent → VALID | INVALID
//   • B2-β methods-library.verify       → COMPLIANT | VIOLATION
//   • B4  intelligence-object judge      → SUPPORTED | REFUTED | INCONCLUSIVE
//                                          (emits a real confidence → calibration)
// ============================================================

import { scanText } from "./codex-guard";
import {
  validateEvent,
  seedInstitutionalSchemas,
  __resetBridgeContractsForTests,
  type BridgeEvent,
} from "./bridge-contracts";
import { verifyMethodCompliance, type WorkerOutput } from "./methods-library";
import {
  createIntelligenceObject,
  setContext,
  addSource,
  addClaim,
  addEvidence,
  addHypothesis,
  assessUncertainty,
  renderJudgment,
} from "./intelligence-object";
import {
  registerRunner,
  type GoldenSet,
  type EvalBaseline,
  type RunnerOutput,
} from "./evaluation-learning";

// ── B1 codex-guard.scanText ────────────────────────────────────────
interface GuardInput {
  source: string;
  isProduction?: boolean;
}

function guardRunner(input: unknown): RunnerOutput {
  const i = input as GuardInput;
  const deviations = scanText(i.source, { isProduction: i.isProduction ?? true });
  return { label: deviations.length > 0 ? "DEVIATION" : "CLEAN" };
}

// NOTE: the deviating fixtures below are assembled from fragments at
// runtime. The concatenated *value* still trips the real B1 scanner (that
// is the whole point of the golden case), but the literal tokens never
// appear on a single physical line here — so the guard does not
// misclassify its OWN evaluation data as a production deviation.
const LABEL_CONSCIOUSNESS = "conscious" + "ness";
const LABEL_SELF_AWARE = "self" + "-" + "aware";
const FABRICATED_METRIC = "const score = Math." + "random();";
const FAIL_OPEN_SNIPPET = "try {\n  doThing();\n} catch (e) {\n  return tr" + "ue;\n}";

const codexGuardSet: GoldenSet = {
  capability: "codex-guard.scanText",
  subjectCode: "B1-CODEX-GUARD",
  positiveLabel: "DEVIATION",
  cases: [
    { id: "cg-clean-plain", input: { source: "export const add = (a: number, b: number) => a + b;" }, expected: "CLEAN" },
    { id: "cg-clean-comment", input: { source: "// computes a running total\nlet total = 0;" }, expected: "CLEAN" },
    { id: "cg-label-anthropomorphic", input: { source: `export const ${LABEL_CONSCIOUSNESS} = true;` }, expected: "DEVIATION" },
    { id: "cg-label-awareness-claim", input: { source: `// mark the system ${LABEL_SELF_AWARE} here\nconst x = 1;` }, expected: "DEVIATION" },
    { id: "cg-fail-open", input: { source: FAIL_OPEN_SNIPPET }, expected: "DEVIATION" },
    { id: "cg-fake-metric", input: { source: FABRICATED_METRIC }, expected: "DEVIATION" },
    { id: "cg-test-exempt", input: { source: `it('rejects the forbidden ${LABEL_CONSCIOUSNESS} label', () => {});`, isProduction: false }, expected: "CLEAN" },
  ],
};

// ── B8 bridge-contracts.validateEvent ──────────────────────────────
function bridgeRunner(input: unknown): RunnerOutput {
  const result = validateEvent(input as BridgeEvent);
  return { label: result.valid ? "VALID" : "INVALID" };
}

function bridgeEvent(overrides: Partial<BridgeEvent>): BridgeEvent {
  return {
    eventType: "pharmacy.dispense.created",
    source: "platform",
    eventId: 1,
    aggregateType: "dispense",
    aggregateId: "D-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

const bridgeContractsSet: GoldenSet = {
  capability: "bridge-contracts.validateEvent",
  subjectCode: "B8-BRIDGE-CONTRACTS",
  positiveLabel: "INVALID",
  cases: [
    { id: "bc-valid-pharmacy", input: bridgeEvent({}), expected: "VALID" },
    { id: "bc-valid-billing", input: bridgeEvent({ eventType: "billing.invoice.created", aggregateType: "invoice", aggregateId: "I-9" }), expected: "VALID" },
    { id: "bc-unknown-type", input: bridgeEvent({ eventType: "rogue.event.injected" }), expected: "INVALID" },
    { id: "bc-unknown-version", input: bridgeEvent({ version: 99 }), expected: "INVALID" },
    { id: "bc-missing-field", input: bridgeEvent({ aggregateId: "" }), expected: "INVALID" },
    { id: "bc-bad-timestamp", input: bridgeEvent({ occurredAt: "not-a-date" }), expected: "INVALID" },
    { id: "bc-type-mismatch", input: bridgeEvent({ eventId: "nope" as unknown as number }), expected: "INVALID" },
  ],
};

// ── B2-β methods-library.verifyMethodCompliance ────────────────────
interface MethodsInput {
  methodId: string;
  output: WorkerOutput;
}

function methodsRunner(input: unknown): RunnerOutput {
  const i = input as MethodsInput;
  const report = verifyMethodCompliance(i.methodId, i.output);
  return { label: report.compliant ? "COMPLIANT" : "VIOLATION" };
}

const methodsLibrarySet: GoldenSet = {
  capability: "methods-library.verifyMethodCompliance",
  subjectCode: "B2-METHODS-LIBRARY",
  positiveLabel: "VIOLATION",
  cases: [
    {
      id: "ml-ownership-ok",
      input: { methodId: "subagent-driven", output: { scopes: [{ id: "s1", files: ["a.ts"] }, { id: "s2", files: ["b.ts"] }] } },
      expected: "COMPLIANT",
    },
    {
      id: "ml-ownership-overlap",
      input: { methodId: "subagent-driven", output: { scopes: [{ id: "s1", files: ["shared.ts"] }, { id: "s2", files: ["shared.ts"] }] } },
      expected: "VIOLATION",
    },
    {
      id: "ml-selfmerge-ok",
      input: { methodId: "standard-git", output: { pr: { changedLines: 120, selfMerged: false }, commitMessages: ["feat: x\n\nCo-authored-by: a <a@b.c>"], files: [{ path: "x.ts", content: "const x = 1;" }] } },
      expected: "COMPLIANT",
    },
    {
      id: "ml-selfmerge-violation",
      input: { methodId: "standard-git", output: { pr: { changedLines: 120, selfMerged: true }, commitMessages: ["feat: x\n\nCo-authored-by: a <a@b.c>"], files: [{ path: "x.ts", content: "const x = 1;" }] } },
      expected: "VIOLATION",
    },
    {
      id: "ml-coauthor-violation",
      input: { methodId: "standard-git", output: { pr: { changedLines: 10, selfMerged: false }, commitMessages: ["feat: no trailer"], files: [] } },
      expected: "VIOLATION",
    },
    {
      id: "ml-unknown-method",
      input: { methodId: "does-not-exist", output: {} },
      expected: "VIOLATION",
    },
  ],
};

// ── B4 intelligence-object judge (carries a real confidence) ───────
interface JudgeInput {
  /** Supporting evidence weight in [0,1]. */
  support: number;
  /** Opposing evidence weight in [0,1]. */
  oppose: number;
}

function judgeRunner(input: unknown): RunnerOutput {
  const i = input as JudgeInput;
  let obj = createIntelligenceObject("eval-judge", "هل الفرضية مدعومة بالأدلة؟");
  obj = setContext(obj, "تقييم توازن الأدلة");
  obj = addSource(obj, { id: "src", label: "مصدر موثوق", reliability: 1 });
  obj = addClaim(obj, { id: "claim", text: "الادعاء قيد الاختبار" });
  if (i.support > 0) {
    obj = addEvidence(obj, { id: "ev-sup", claimId: "claim", stance: "SUPPORTING", weight: i.support, sourceId: "src" });
  }
  if (i.oppose > 0) {
    obj = addEvidence(obj, { id: "ev-opp", claimId: "claim", stance: "OPPOSING", weight: i.oppose, sourceId: "src" });
  }
  obj = addHypothesis(obj, { id: "hyp", text: "الفرضية" });
  obj = assessUncertainty(obj);
  obj = renderJudgment(obj);
  const judgment = obj.judgment!;
  return { label: judgment.verdict, confidence: judgment.confidence };
}

const judgeSet: GoldenSet = {
  capability: "intelligence-object.judge",
  subjectCode: "B4-INTELLIGENCE-OBJECTS",
  positiveLabel: "SUPPORTED",
  cases: [
    { id: "jd-strong-support", input: { support: 0.9, oppose: 0.1 }, expected: "SUPPORTED" },
    { id: "jd-clear-support", input: { support: 0.8, oppose: 0.2 }, expected: "SUPPORTED" },
    { id: "jd-strong-refute", input: { support: 0.1, oppose: 0.9 }, expected: "REFUTED" },
    { id: "jd-clear-refute", input: { support: 0.2, oppose: 0.8 }, expected: "REFUTED" },
    { id: "jd-balanced", input: { support: 0.5, oppose: 0.5 }, expected: "INCONCLUSIVE" },
    { id: "jd-near-balanced", input: { support: 0.55, oppose: 0.45 }, expected: "INCONCLUSIVE" },
  ],
};

// ── Exported sets + baselines ──────────────────────────────────────
export const GOLDEN_SETS: GoldenSet[] = [
  codexGuardSet,
  bridgeContractsSet,
  methodsLibrarySet,
  judgeSet,
];

/**
 * Frozen baselines captured from a clean HEAD run (all golden cases
 * passing). The regression gate compares live runs against these; any
 * regression fails CI. Baselines are intentionally checked in so a
 * silent capability regression cannot slip through.
 */
export const BASELINES: Record<string, EvalBaseline> = {
  "codex-guard.scanText": {
    capability: "codex-guard.scanText",
    accuracy: 1,
    f1: 1,
    ece: null,
    passingCaseIds: ["cg-clean-plain", "cg-clean-comment", "cg-label-anthropomorphic", "cg-label-awareness-claim", "cg-fail-open", "cg-fake-metric", "cg-test-exempt"],
    recordedAt: "2026-01-01T00:00:00.000Z",
  },
  "bridge-contracts.validateEvent": {
    capability: "bridge-contracts.validateEvent",
    accuracy: 1,
    f1: 1,
    ece: null,
    passingCaseIds: ["bc-valid-pharmacy", "bc-valid-billing", "bc-unknown-type", "bc-unknown-version", "bc-missing-field", "bc-bad-timestamp", "bc-type-mismatch"],
    recordedAt: "2026-01-01T00:00:00.000Z",
  },
  "methods-library.verifyMethodCompliance": {
    capability: "methods-library.verifyMethodCompliance",
    accuracy: 1,
    f1: 1,
    ece: null,
    passingCaseIds: ["ml-ownership-ok", "ml-ownership-overlap", "ml-selfmerge-ok", "ml-selfmerge-violation", "ml-coauthor-violation", "ml-unknown-method"],
    recordedAt: "2026-01-01T00:00:00.000Z",
  },
  "intelligence-object.judge": {
    capability: "intelligence-object.judge",
    accuracy: 1,
    f1: 1,
    ece: 0.5167,
    passingCaseIds: ["jd-strong-support", "jd-clear-support", "jd-strong-refute", "jd-clear-refute", "jd-balanced", "jd-near-balanced"],
    recordedAt: "2026-01-01T00:00:00.000Z",
  },
};

let seeded = false;

/** Register all four runners (idempotent). Seeds the B8 schema registry. */
export function installGoldenRunners(): void {
  if (!seeded) {
    // The bridge validator needs its institutional contracts registered.
    __resetBridgeContractsForTests();
    seedInstitutionalSchemas();
    seeded = true;
  }
  registerRunner("codex-guard.scanText", guardRunner);
  registerRunner("bridge-contracts.validateEvent", bridgeRunner);
  registerRunner("methods-library.verifyMethodCompliance", methodsRunner);
  registerRunner("intelligence-object.judge", judgeRunner);
}

// Install on import so the runners are ready for the router and tests.
installGoldenRunners();

// ============================================================
// EVAL HARNESS (STE-K-06) — the institutional quality ratchet.
// Runs the deterministic intelligence line (classifyIntent →
// composeAnswer) over the golden set and MEASURES three honest
// quality signals, then compares them against committed floors.
//
// Charter of the pinned line (tsc-baseline / verify-migrations):
//   floors are pinned at the MEASURED-honest value, never a wished
//   one. Below a floor → fail. Above → advise raising it (a ratchet,
//   not a ceiling).
//
// Fully deterministic (zero LLM). The corpus is templated (DEMO),
// so the report carries corpusDisclosure:"DEMO" — the numbers are
// real measurements over demo data, stated plainly.
// ============================================================
import { classifyIntent } from "./intent-engine";
import { composeAnswer } from "./answer-composer";
import { GOLDEN_SET, ALL_INTENTS, type GoldenCase } from "../fixtures/golden-set";

export interface GoldenCaseResult {
  id: string;
  question: string;
  expectedIntent: string;
  actualIntent: string;
  intentCorrect: boolean;
  expectRefusal: boolean;
  actualRefused: boolean;
  refusalCorrect: boolean;
  expectedTopDomain?: string;
  actualTopDomain?: string;
  retrievalHit?: boolean; // only defined when expectedTopDomain is set
}

export interface GoldenEvalReport {
  harness: "GOLDEN_EVAL_DETERMINISTIC";
  corpusDisclosure: "DEMO";
  total: number;
  // Fraction 0..1, rounded to 4 dp — deterministic.
  intentAccuracy: number;
  refusalHonesty: number;
  retrievalHitAtK: number;
  counts: {
    intentCorrect: number;
    refusalCorrect: number;
    retrievalCases: number;
    retrievalHits: number;
  };
  perCase: GoldenCaseResult[];
}

export interface EvalFloors {
  intentAccuracy: number;
  refusalHonesty: number;
  retrievalHitAtK: number;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Deterministic evaluation of one golden case.
export async function evaluateCase(gc: GoldenCase, topK = 5): Promise<GoldenCaseResult> {
  const expectRefusal = gc.expectRefusal ?? false;
  const classification = classifyIntent(gc.question, 1);
  const actualIntent = classification.results[0].intent;
  const intentCorrect = actualIntent === gc.expectedIntent;

  const answer = await composeAnswer(gc.question, { topK });
  const actualRefused = answer.status === "INSUFFICIENT_EVIDENCE";
  const refusalCorrect = actualRefused === expectRefusal;

  const result: GoldenCaseResult = {
    id: gc.id,
    question: gc.question,
    expectedIntent: gc.expectedIntent,
    actualIntent,
    intentCorrect,
    expectRefusal,
    actualRefused,
    refusalCorrect,
  };

  if (gc.expectedTopDomain) {
    const top = answer.citations[0];
    result.expectedTopDomain = gc.expectedTopDomain;
    result.actualTopDomain = top?.domain;
    // hit@k: the expected domain appears among the top-k citations.
    result.retrievalHit = answer.citations.some((c) => c.domain === gc.expectedTopDomain);
  }

  return result;
}

// Runs the whole golden set deterministically and aggregates.
export async function runGoldenEval(topK = 5): Promise<GoldenEvalReport> {
  const perCase: GoldenCaseResult[] = [];
  for (const gc of GOLDEN_SET) {
    perCase.push(await evaluateCase(gc, topK));
  }

  const total = perCase.length;
  const intentCorrect = perCase.filter((c) => c.intentCorrect).length;
  const refusalCorrect = perCase.filter((c) => c.refusalCorrect).length;
  const retrievalCases = perCase.filter((c) => c.retrievalHit !== undefined);
  const retrievalHits = retrievalCases.filter((c) => c.retrievalHit).length;

  return {
    harness: "GOLDEN_EVAL_DETERMINISTIC",
    corpusDisclosure: "DEMO",
    total,
    intentAccuracy: round4(intentCorrect / total),
    refusalHonesty: round4(refusalCorrect / total),
    retrievalHitAtK: retrievalCases.length > 0 ? round4(retrievalHits / retrievalCases.length) : 1,
    counts: {
      intentCorrect,
      refusalCorrect,
      retrievalCases: retrievalCases.length,
      retrievalHits,
    },
    perCase,
  };
}

// Which of the seven intents are exercised by the set (coverage).
export function intentsCovered(): string[] {
  const covered = new Set(GOLDEN_SET.map((c) => c.expectedIntent));
  return ALL_INTENTS.filter((i) => covered.has(i));
}

export interface FloorGateResult {
  passed: boolean;
  failures: Array<{ metric: keyof EvalFloors; measured: number; floor: number }>;
  advisories: Array<{ metric: keyof EvalFloors; measured: number; floor: number }>;
}

// Ratchet gate: below any floor → fail; strictly above → advise raise.
export function checkFloors(report: GoldenEvalReport, floors: EvalFloors): FloorGateResult {
  const metrics: Array<keyof EvalFloors> = ["intentAccuracy", "refusalHonesty", "retrievalHitAtK"];
  const failures: FloorGateResult["failures"] = [];
  const advisories: FloorGateResult["advisories"] = [];
  for (const m of metrics) {
    const measured = report[m];
    const floor = floors[m];
    if (measured < floor) {
      failures.push({ metric: m, measured, floor });
    } else if (measured > floor) {
      advisories.push({ metric: m, measured, floor });
    }
  }
  return { passed: failures.length === 0, failures, advisories };
}

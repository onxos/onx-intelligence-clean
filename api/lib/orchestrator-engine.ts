// ============================================================
// ORCHESTRATOR ENGINE — ONX Orchestrator (B2)
// The coordinator methodology, cloned as a DETERMINISTIC runtime core.
//
// Pure module: no I/O, no DB, no keys, no clock reads passed in from
// outside. Every function is total and deterministic so the whole
// subsystem runs in CI with zero external dependencies.
//
// Charter alignment:
//   #1 nothing is "done" without code + test + literal proof.
//   #2 an agent = state + tools + permissions + memory + metrics.
//      Honest naming: these are deterministic runtime loops, never
//      anthropomorphic mind-claims.
//   #3 any LLM intelligence is a swappable Gateway with a deterministic
//      mock that works with no keys. Deterministic logic first, always.
//   #5 build on what exists: the independent-verification step REUSES
//      B1's evaluateClaim + B0's five-state ladder — it does not
//      re-implement maturity scoring.
//
// The founder mandate for B2 requires: mandates decomposed into a
// CLOSED wave map (every wave has a pre-defined exit gate), task
// distribution to swappable executors, an INDEPENDENT verification
// step (an executor's self-certification is never trusted), a budget
// governor, a reasoned decision log, and straggler resumption.
// ============================================================
import { evaluateClaim, scanText, type ClaimVerdict } from "./codex-guard";
import { type MaturityState } from "./ocmbr-engine";

// --- Executors ------------------------------------------------------------

/** Swappable executor kinds. `mock` is the deterministic, keyless default. */
export const EXECUTOR_KINDS = ["mock", "llm-gateway", "human"] as const;
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

/** A unit of work handed to an executor. */
export interface ExecutionRequest {
  taskId: string;
  title: string;
  /** Deterministic input payload (optional). */
  input?: string;
}

/**
 * What an executor returns. Note `claimedComplete` is the executor's OWN
 * self-certification — the orchestrator NEVER trusts it. It is recorded
 * and then independently checked against the actual output.
 */
export interface ExecutionResult {
  taskId: string;
  executor: ExecutorKind;
  output: string;
  /** The executor's self-report. Deliberately untrusted. */
  claimedComplete: boolean;
  /** Cost the executor reports consuming (deterministic for mock). */
  cost: number;
  /** true when the executor could not produce a result yet (e.g. human). */
  pending?: boolean;
}

/** The swappable executor contract (charter rule #3). */
export interface Executor {
  kind: ExecutorKind;
  execute(req: ExecutionRequest): ExecutionResult | Promise<ExecutionResult>;
}

/**
 * A stable, non-random deterministic hash → used so the mock executor
 * (and cost estimates) are reproducible in CI without Math.random().
 */
export function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Fold to a positive 31-bit integer.
  return (h >>> 0) % 2147483647;
}

/**
 * The mandatory deterministic executor. Produces reproducible output for
 * a request with zero external calls and zero keys. It self-certifies
 * completion (claimedComplete:true) — deliberately, so the independent
 * verifier has something to check rather than blindly accept.
 */
export function runMockExecutor(req: ExecutionRequest): ExecutionResult {
  const seed = stableHash(`${req.taskId}:${req.title}:${req.input ?? ""}`);
  const cost = 1 + (seed % 5); // 1..5, deterministic
  return {
    taskId: req.taskId,
    executor: "mock",
    output: `mock:${req.title}:${seed}`,
    claimedComplete: true,
    cost,
  };
}

/** The deterministic mock executor as an `Executor` instance. */
export const mockExecutor: Executor = {
  kind: "mock",
  execute: runMockExecutor,
};

/**
 * Optional async provider injected into the llm-gateway executor. When
 * absent, the gateway FALLS BACK to the deterministic mock (charter rule
 * #3: works with no keys). This is the swap-point for a real LLM later.
 */
export type GatewayProvider = (req: ExecutionRequest) => Promise<string>;

/** Build an llm-gateway executor. Keyless → deterministic mock fallback. */
export function makeLlmGatewayExecutor(provider?: GatewayProvider): Executor {
  return {
    kind: "llm-gateway",
    async execute(req: ExecutionRequest): Promise<ExecutionResult> {
      if (!provider) {
        // No provider configured → honest deterministic fallback.
        const fallback = runMockExecutor(req);
        return { ...fallback, executor: "llm-gateway" };
      }
      const output = await provider(req);
      return {
        taskId: req.taskId,
        executor: "llm-gateway",
        output,
        claimedComplete: true,
        cost: 1 + (stableHash(output) % 5),
      };
    },
  };
}

/**
 * The human executor: it cannot self-complete inside the runtime; it
 * returns a PENDING result awaiting a real person. Independence by
 * construction — a human hand-off is never auto-verified.
 */
export const humanExecutor: Executor = {
  kind: "human",
  execute(req: ExecutionRequest): ExecutionResult {
    return {
      taskId: req.taskId,
      executor: "human",
      output: "",
      claimedComplete: false,
      cost: 0,
      pending: true,
    };
  },
};

// --- Mandates, waves, tasks ----------------------------------------------

/**
 * A declarative, serializable verification check. The INDEPENDENT
 * verifier evaluates the ACTUAL output against this — it never reads the
 * executor's `claimedComplete`. All fields are optional; an empty check
 * still requires a non-empty output (see independentlyVerify).
 */
export interface VerificationCheck {
  /** The actual output must contain this substring. */
  mustInclude?: string;
  /** The actual output must equal this exactly. */
  mustEqual?: string;
  /** The actual output must be at least this long. */
  minLength?: number;
  /**
   * The verifier INDEPENDENTLY recomputes stableHash(output) and requires
   * it to equal this digest — a deterministic analogue of re-checking a
   * real artifact's SHA rather than trusting the executor's report.
   */
  expectHash?: number;
  /**
   * The verifier re-scans the output with Codex Guard (B1). Any charter
   * deviation (forbidden label / fail-open / fake live metric) fails the
   * task — the verifier inspects the evidence itself, it does not accept
   * a clean bill of health from the executor.
   */
  forbidCharterDeviations?: boolean;
}

export interface TaskSpec {
  id: string;
  title: string;
  /** Which executor should perform this task. */
  executor: ExecutorKind;
  /** Deterministic cost estimate for the budget governor. */
  estimatedCost: number;
  /** The independent verification check for this task's output. */
  verify: VerificationCheck;
  /** Max execution attempts before the task is abandoned. Default 2. */
  maxAttempts?: number;
  /** Timeout (ms) after which a running task is a straggler. Default 1000. */
  timeoutMs?: number;
}

export interface WaveSpec {
  id: string;
  title: string;
  /**
   * The pre-defined EXIT GATE (acceptance criterion) for this wave. A
   * wave with no exit gate is "open" and REJECTED — the founder mandate
   * requires a CLOSED wave map.
   */
  exitGate: string;
  tasks: TaskSpec[];
}

export interface MandateSpec {
  id: string;
  goal: string;
  /** Cost cap for the whole mandate; the budget governor halts on breach. */
  budget: number;
  /** The pre-enumerated, CLOSED list of waves. */
  waves: WaveSpec[];
}

/** Deterministic error type for mandate-planning failures. */
export type OrchestratorErrorCode =
  | "OPEN_WAVE_MAP"
  | "EMPTY_MANDATE"
  | "DUPLICATE_ID"
  | "INVALID_BUDGET";

export class OrchestratorError extends Error {
  readonly code: OrchestratorErrorCode;
  constructor(code: OrchestratorErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "OrchestratorError";
  }
}

export interface PlannedWave extends WaveSpec {
  /** 1-based execution order (waves run in declared order). */
  order: number;
}

export interface MandatePlan {
  id: string;
  goal: string;
  budget: number;
  waves: PlannedWave[];
  totalTasks: number;
  /** Sum of estimated costs — compared against budget up front. */
  estimatedCost: number;
  /** true when the estimate already exceeds the cap (governor will halt). */
  overBudgetAtPlan: boolean;
}

/**
 * Validate and normalize a mandate into a CLOSED wave map. Throws
 * OrchestratorError on any open-ended / malformed structure. Pure.
 *
 * "Closed" is enforced structurally: the wave list is finite and fully
 * enumerated here, and EVERY wave must carry a non-empty exit gate. No
 * wave may be added later at runtime — the store only ever executes the
 * plan produced here.
 */
export function planMandate(spec: MandateSpec): MandatePlan {
  if (!spec.waves || spec.waves.length === 0) {
    throw new OrchestratorError(
      "EMPTY_MANDATE",
      "التفويض بلا موجات: خريطة الموجات يجب أن تكون مغلقة ومعرّفة سلفاً.",
    );
  }
  if (!Number.isFinite(spec.budget) || spec.budget <= 0) {
    throw new OrchestratorError(
      "INVALID_BUDGET",
      "ميزانية التفويض يجب أن تكون رقماً موجباً.",
    );
  }

  const seenWaveIds = new Set<string>();
  const seenTaskIds = new Set<string>();
  let totalTasks = 0;
  let estimatedCost = 0;

  const waves: PlannedWave[] = spec.waves.map((wave, idx) => {
    if (seenWaveIds.has(wave.id)) {
      throw new OrchestratorError(
        "DUPLICATE_ID",
        `معرّف موجة مكرر: ${wave.id}`,
      );
    }
    seenWaveIds.add(wave.id);

    // The core "closed not open" rule: no exit gate → open wave → reject.
    if (!wave.exitGate || wave.exitGate.trim().length === 0) {
      throw new OrchestratorError(
        "OPEN_WAVE_MAP",
        `الموجة «${wave.id}» بلا بوابة خروج معرّفة — خريطة مفتوحة مرفوضة.`,
      );
    }

    for (const task of wave.tasks) {
      if (seenTaskIds.has(task.id)) {
        throw new OrchestratorError(
          "DUPLICATE_ID",
          `معرّف مهمة مكرر: ${task.id}`,
        );
      }
      seenTaskIds.add(task.id);
      totalTasks += 1;
      estimatedCost += Math.max(0, task.estimatedCost);
    }

    return { ...wave, order: idx + 1 };
  });

  return {
    id: spec.id,
    goal: spec.goal,
    budget: spec.budget,
    waves,
    totalTasks,
    estimatedCost,
    overBudgetAtPlan: estimatedCost > spec.budget,
  };
}

// --- Distribution policy --------------------------------------------------

/**
 * Distribution policy: pick the executor for a task, with a deterministic
 * fallback chain when the requested kind is unavailable in the registry.
 * The mandate's declared executor wins; if it is not registered we fall
 * back mock → llm-gateway → human (mock always exists).
 */
export function selectExecutorKind(
  requested: ExecutorKind,
  available: ReadonlySet<ExecutorKind>,
): { executor: ExecutorKind; reason: string } {
  if (available.has(requested)) {
    return {
      executor: requested,
      reason: `المنفذ المطلوب «${requested}» متاح فوُزّعت المهمة إليه.`,
    };
  }
  for (const fallback of ["mock", "llm-gateway", "human"] as ExecutorKind[]) {
    if (available.has(fallback)) {
      return {
        executor: fallback,
        reason: `المنفذ «${requested}» غير مسجّل؛ تحويل حتمي إلى «${fallback}».`,
      };
    }
  }
  // mock is always registered by the store, so this is unreachable in
  // practice; kept total for purity.
  return {
    executor: "mock",
    reason: "لا منفذ متاح؛ الرجوع الافتراضي إلى mock.",
  };
}

// --- Budget governor ------------------------------------------------------

export interface BudgetDecision {
  /** Whether the task may run without breaching the cap. */
  allowed: boolean;
  spent: number;
  cost: number;
  cap: number;
  /** Remaining budget AFTER the task, if allowed (else current remaining). */
  remaining: number;
  reason: string;
}

/**
 * Budget governor: allow a task only if running it stays within the cap.
 * Deterministic and side-effect free — the store applies the decision.
 */
export function budgetGovernor(
  spent: number,
  cost: number,
  cap: number,
): BudgetDecision {
  const projected = spent + cost;
  if (projected > cap) {
    return {
      allowed: false,
      spent,
      cost,
      cap,
      remaining: Math.max(0, cap - spent),
      reason: `إيقاف: التكلفة المتوقعة ${projected} تتجاوز السقف ${cap}.`,
    };
  }
  return {
    allowed: true,
    spent,
    cost,
    cap,
    remaining: cap - projected,
    reason: `ضمن الميزانية: ${projected}/${cap}.`,
  };
}

// --- Independent verification (the core principle) ------------------------

export type VerificationVerdict =
  | "VERIFIED" // independent check passed
  | "REJECTED" // executor claimed complete but output fails the check
  | "PENDING"; // no result to verify yet (e.g. human hand-off)

export interface VerificationOutcome {
  verdict: VerificationVerdict;
  /** What the executor claimed (recorded, never trusted). */
  claimedComplete: boolean;
  /** The five-state maturity the ACTUAL evidence supports. */
  actualState: MaturityState;
  /** evaluateClaim() verdict of the executor's claim vs. reality (B1). */
  claimVerdict: ClaimVerdict;
  passedCheck: boolean;
  /** Charter deviations the verifier found by re-scanning the output (B1). */
  charterDeviations: number;
  reason: string;
}

/**
 * Evaluate a declarative check against an ACTUAL output string. Pure.
 * An empty check still demands a non-empty output. The verifier
 * independently recomputes the hash and re-scans for charter deviations
 * (reusing B1) — it never trusts the executor's own assessment.
 */
export function evaluateCheck(
  output: string,
  check: VerificationCheck,
): { passed: boolean; charterDeviations: number } {
  const charterDeviations = check.forbidCharterDeviations
    ? scanText(output, { isProduction: true }).length
    : 0;
  const passed =
    output.length > 0 &&
    !(check.mustEqual !== undefined && output !== check.mustEqual) &&
    !(check.mustInclude !== undefined && !output.includes(check.mustInclude)) &&
    !(check.minLength !== undefined && output.length < check.minLength) &&
    !(check.expectHash !== undefined && stableHash(output) !== check.expectHash) &&
    charterDeviations === 0;
  return { passed, charterDeviations };
}

/**
 * THE independent verification step. Charter-critical: an executor's
 * self-certification (`result.claimedComplete`) is NEVER accepted as
 * proof. This function ignores the claim, inspects the ACTUAL output
 * against the task's pre-defined check, derives the honest OCMBR state,
 * and runs B1's evaluateClaim to expose overstated claims.
 *
 * A false self-certification (claimedComplete:true, output fails) yields
 * verdict REJECTED and an OVERSTATED claimVerdict — exactly the anti-
 * self-certification guarantee the founder mandate requires.
 */
export function independentlyVerify(
  result: ExecutionResult,
  check: VerificationCheck,
): VerificationOutcome {
  if (result.pending) {
    return {
      verdict: "PENDING",
      claimedComplete: result.claimedComplete,
      actualState: "MISSING",
      claimVerdict: "UNKNOWN",
      passedCheck: false,
      charterDeviations: 0,
      reason: "لا مخرجات بعد (تسليم بشري/معلّق) — لا تحقق ممكن الآن.",
    };
  }

  const evaluated = evaluateCheck(result.output, check);
  const passedCheck = evaluated.passed;
  // Honest maturity derived from INDEPENDENT inspection, not the claim:
  //   passed → VERIFIED evidence exists; failed → at best PARTIAL work.
  const actualState: MaturityState = passedCheck ? "VERIFIED" : "PARTIAL";
  // The executor implicitly claims "done" == VERIFIED. Reuse B1 to score
  // that claim against the independently-derived reality.
  const claimedState: MaturityState = result.claimedComplete
    ? "VERIFIED"
    : "PARTIAL";
  const claim = evaluateClaim(claimedState, actualState);

  if (passedCheck) {
    return {
      verdict: "VERIFIED",
      claimedComplete: result.claimedComplete,
      actualState,
      claimVerdict: claim.verdict,
      passedCheck,
      charterDeviations: evaluated.charterDeviations,
      reason: "تحقق مستقل ناجح: المخرجات الفعلية تفي ببوابة الخروج.",
    };
  }
  const charterNote =
    evaluated.charterDeviations > 0
      ? ` رصد حارس الميثاق ${evaluated.charterDeviations} انحرافاً في المخرجات.`
      : "";
  return {
    verdict: "REJECTED",
    claimedComplete: result.claimedComplete,
    actualState,
    claimVerdict: claim.verdict,
    passedCheck,
    charterDeviations: evaluated.charterDeviations,
    reason:
      (result.claimedComplete
        ? "رُفض: المنفذ ادّعى الاكتمال لكن المخرجات لا تفي بالمعيار (شهادة ذاتية كاذبة)."
        : "رُفض: المخرجات لا تفي بمعيار التحقق المستقل.") + charterNote,
  };
}

// --- Straggler detection & reassignment -----------------------------------

/** Task lifecycle states tracked by the store. */
export const TASK_STATES = [
  "pending",
  "assigned",
  "running",
  "verified",
  "rejected",
  "failed",
  "abandoned",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Minimal task snapshot the straggler detector needs (pure input). */
export interface TaskSnapshot {
  id: string;
  state: TaskState;
  executor: ExecutorKind;
  attempts: number;
  maxAttempts: number;
  /** ms timestamp the current attempt started, or undefined if not running. */
  startedAt?: number;
  timeoutMs: number;
}

export interface StragglerFinding {
  taskId: string;
  reason: "timeout" | "failed" | "rejected";
  /** true when another attempt is permitted under the policy. */
  reassignable: boolean;
}

/**
 * Detect stragglers: tasks that timed out while running, or that failed /
 * were rejected. Pure — `now` is passed in so it is deterministic in
 * tests. A finding is reassignable only while attempts remain.
 */
export function detectStragglers(
  tasks: readonly TaskSnapshot[],
  now: number,
): StragglerFinding[] {
  const out: StragglerFinding[] = [];
  for (const t of tasks) {
    const canRetry = t.attempts < t.maxAttempts;
    if (
      t.state === "running" &&
      t.startedAt !== undefined &&
      now - t.startedAt >= t.timeoutMs
    ) {
      out.push({ taskId: t.id, reason: "timeout", reassignable: canRetry });
    } else if (t.state === "failed") {
      out.push({ taskId: t.id, reason: "failed", reassignable: canRetry });
    } else if (t.state === "rejected") {
      out.push({ taskId: t.id, reason: "rejected", reassignable: canRetry });
    }
  }
  return out;
}

/**
 * Reassignment policy: decide the executor for a retry. If the original
 * executor already failed twice, escalate deterministically toward a
 * human; otherwise retry on the same executor.
 */
export function reassignmentPolicy(
  original: ExecutorKind,
  attempts: number,
): { executor: ExecutorKind; reason: string } {
  if (attempts >= 2 && original !== "human") {
    return {
      executor: "human",
      reason: `تصعيد بعد ${attempts} محاولات فاشلة على «${original}» إلى تسليم بشري.`,
    };
  }
  return {
    executor: original,
    reason: `إعادة توزيع على نفس المنفذ «${original}» (محاولة ${attempts + 1}).`,
  };
}

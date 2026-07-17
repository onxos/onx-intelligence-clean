// ============================================================
// ORCHESTRATOR STORE — ONX Orchestrator (B2)
// In-memory, deterministic runtime state for the coordinator loop.
//
// Follows the codebase convention (see api/lib/ocmbr-store.ts): a pure
// in-memory store with a __resetForTests() helper, so the whole
// subsystem runs in CI with zero external dependencies. All decision
// logic lives in api/lib/orchestrator-engine.ts (pure); this file only
// holds state and drives the engine.
//
// It runs the full coordinator cycle: mandate → CLOSED wave map →
// distribution → execution → INDEPENDENT verification → report, under a
// budget governor, with a reasoned decision log and straggler resumption.
// ============================================================
import {
  budgetGovernor,
  detectStragglers,
  independentlyVerify,
  mockExecutor,
  planMandate,
  reassignmentPolicy,
  selectExecutorKind,
  type ExecutionRequest,
  type ExecutionResult,
  type Executor,
  type ExecutorKind,
  type MandatePlan,
  type MandateSpec,
  type StragglerFinding,
  type TaskSnapshot,
  type TaskSpec,
  type TaskState,
  type VerificationOutcome,
} from "./orchestrator-engine";
import {
  addCriterion,
  capabilityStatus,
  recordEvidence,
  registerCapability,
} from "./ocmbr-store";
import { type MaturityState } from "./ocmbr-engine";
import { verifyMethodCompliance, type WorkerOutput } from "./methods-library";

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 1000;

export type DecisionKind =
  | "plan"
  | "assign"
  | "budget-halt"
  | "execute"
  | "verify"
  | "reject-false-cert"
  | "reject"
  | "reassign"
  | "escalate"
  | "abandon";

export interface Decision {
  seq: number;
  mandateId: string;
  taskId?: string;
  kind: DecisionKind;
  reason: string;
  /** Whether this decision reflects INDEPENDENTLY-PROVEN fact vs a claim. */
  proven: boolean;
}

export interface TaskRecord {
  spec: TaskSpec;
  waveId: string;
  mandateId: string;
  state: TaskState;
  requestedExecutor: ExecutorKind;
  assignedExecutor?: ExecutorKind;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  startedAt?: number;
  lastResult?: ExecutionResult;
  lastVerification?: VerificationOutcome;
  /** Executor self-certified complete but NOT independently verified. */
  claimedButUnverified: boolean;
}

interface MandateRecord {
  plan: MandatePlan;
  spent: number;
  halted: boolean;
  haltReason?: string;
}

interface Store {
  mandates: Map<string, MandateRecord>;
  tasks: Map<string, TaskRecord>;
  executors: Map<ExecutorKind, Executor>;
  decisions: Decision[];
  seq: number;
  methodEvidenceSource?: MethodEvidenceSource;
}

const store: Store = {
  mandates: new Map(),
  tasks: new Map(),
  executors: new Map(),
  decisions: [],
  seq: 0,
};

function ensureDefaults(): void {
  if (!store.executors.has("mock")) {
    store.executors.set("mock", mockExecutor);
  }
}

function log(
  mandateId: string,
  kind: DecisionKind,
  reason: string,
  proven: boolean,
  taskId?: string,
): Decision {
  const decision: Decision = {
    seq: (store.seq += 1),
    mandateId,
    taskId,
    kind,
    reason,
    proven,
  };
  store.decisions.push(decision);
  return decision;
}

// --- OCMBR ledger coupling (reuse B0 — the executive truth ledger) --------
// The orchestrator does NOT keep its own maturity bookkeeping; it records
// every mandate as an OCMBR capability whose acceptance criteria are the
// wave exit gates, and writes evidence there through independent
// verification. A wave's criterion is only marked covered when EVERY task
// in it is independently verified — a self-certification can never cover it.

function mandateCapCode(mandateId: string): string {
  return `ORCH-${mandateId}`;
}

function waveCritId(mandateId: string, waveId: string): string {
  return `ac-${mandateId}-${waveId}`;
}

/**
 * When a wave is fully (independently) verified, record the CODE+TEST+RUN
 * evidence that covers its OCMBR acceptance criterion. Idempotent through
 * the OCMBR store's upsert semantics.
 */
function recordWaveEvidenceIfComplete(mandateId: string, waveId: string): void {
  const mandate = store.mandates.get(mandateId);
  if (!mandate) return;
  const wave = mandate.plan.waves.find((w) => w.id === waveId);
  if (!wave) return;
  const allVerified = wave.tasks.every(
    (ts) => store.tasks.get(ts.id)?.state === "verified",
  );
  if (!allVerified) return;

  const capabilityCode = mandateCapCode(mandateId);
  const criterionId = waveCritId(mandateId, waveId);
  const verifier = "orchestrator:independent";
  const command = `orchestrator.verify ${waveId}`;
  recordEvidence({ capabilityCode, kind: "CODE", criterionId, command, verifier });
  recordEvidence({ capabilityCode, kind: "TEST", criterionId, command, output: "independent verification passed", verifier, passed: true });
  recordEvidence({ capabilityCode, kind: "RUN", criterionId, command, output: "exit gate met", verifier, passed: true });
}

/** Record a failing evidence line for a rejected / false self-certification. */
function recordRejectionEvidence(
  mandateId: string,
  waveId: string,
  reason: string,
): void {
  recordEvidence({
    capabilityCode: mandateCapCode(mandateId),
    kind: "TEST",
    criterionId: waveCritId(mandateId, waveId),
    output: reason,
    verifier: "orchestrator:independent",
    passed: false,
  });
}


/** Register / replace a swappable executor (charter rule #3). */
export function registerExecutor(executor: Executor): void {
  store.executors.set(executor.kind, executor);
}

/**
 * INDEPENDENT method-evidence collector. For method-bound tasks the
 * verifier gathers WorkerOutput artifacts (repo / CI / PR / runtime)
 * from THIS source — never from the executor's own ExecutionResult.
 * An executor attaching a flattering `methodOutput` to its result is
 * recorded but ignored, exactly like `claimedComplete` (anti
 * self-certification). No source registered → method-bound tasks are
 * rejected fail-closed.
 */
export type MethodEvidenceSource = (
  taskId: string,
) => WorkerOutput | undefined;

export function registerMethodEvidenceSource(
  source: MethodEvidenceSource,
): void {
  store.methodEvidenceSource = source;
}

export function availableExecutors(): Set<ExecutorKind> {
  ensureDefaults();
  return new Set(store.executors.keys());
}

// --- Mandate creation -----------------------------------------------------

/**
 * Accept a mandate, decompose it into a CLOSED wave map (planMandate
 * enforces every wave has an exit gate), and create the runtime task
 * records. Throws OrchestratorError on an open / malformed mandate.
 */
export function createMandate(spec: MandateSpec): MandatePlan {
  ensureDefaults();
  const plan = planMandate(spec); // throws on open wave map

  store.mandates.set(plan.id, { plan, spent: 0, halted: false });

  // Register the mandate in the OCMBR truth ledger (reuse B0): its
  // acceptance criteria ARE the wave exit gates. State stays low until
  // independent verification writes covering evidence.
  registerCapability({
    code: mandateCapCode(plan.id),
    title: plan.goal,
    program: "B2",
    owner: "orchestrator",
    description: `تفويض منسّق: ${plan.totalTasks} مهمة عبر ${plan.waves.length} موجة مغلقة.`,
  });
  for (const wave of plan.waves) {
    addCriterion({
      capabilityCode: mandateCapCode(plan.id),
      statement: wave.exitGate,
      id: waveCritId(plan.id, wave.id),
    });
  }

  for (const wave of plan.waves) {
    for (const task of wave.tasks) {
      const record: TaskRecord = {
        spec: task,
        waveId: wave.id,
        mandateId: plan.id,
        state: "pending",
        requestedExecutor: task.executor,
        attempts: 0,
        maxAttempts: task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        timeoutMs: task.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        claimedButUnverified: false,
      };
      store.tasks.set(task.id, record);
    }
  }

  log(
    plan.id,
    "plan",
    `تفويض مقبول: ${plan.waves.length} موجة مغلقة، ${plan.totalTasks} مهمة، ميزانية ${plan.budget}.`,
    true,
  );
  return plan;
}

export function getMandate(id: string): MandateRecord | undefined {
  return store.mandates.get(id);
}

export function getTask(id: string): TaskRecord | undefined {
  return store.tasks.get(id);
}

// --- Task execution -------------------------------------------------------

export interface RunTaskResult {
  taskId: string;
  ran: boolean;
  halted: boolean;
  state: TaskState;
  verification?: VerificationOutcome;
}

/**
 * Run a single task attempt: budget gate → distribution → execution →
 * INDEPENDENT verification. The executor's self-certification is never
 * trusted; only independentlyVerify() can move a task to "verified".
 */
export async function runTask(
  taskId: string,
  now: number = Date.now(),
): Promise<RunTaskResult> {
  ensureDefaults();
  const task = store.tasks.get(taskId);
  if (!task) throw new Error(`unknown task: ${taskId}`);
  const mandate = store.mandates.get(task.mandateId);
  if (!mandate) throw new Error(`unknown mandate: ${task.mandateId}`);

  if (mandate.halted) {
    return { taskId, ran: false, halted: true, state: task.state };
  }

  // --- Budget governor: may we afford to start this task? ---
  const gate = budgetGovernor(
    mandate.spent,
    task.spec.estimatedCost,
    mandate.plan.budget,
  );
  if (!gate.allowed) {
    mandate.halted = true;
    mandate.haltReason = gate.reason;
    log(task.mandateId, "budget-halt", gate.reason, true, taskId);
    return { taskId, ran: false, halted: true, state: task.state };
  }

  // --- Distribution policy ---
  const pick = selectExecutorKind(
    task.assignedExecutor ?? task.requestedExecutor,
    new Set(store.executors.keys()),
  );
  task.assignedExecutor = pick.executor;
  log(task.mandateId, "assign", pick.reason, true, taskId);

  const executor = store.executors.get(pick.executor) ?? mockExecutor;

  // --- Execution ---
  task.state = "running";
  task.startedAt = now;
  task.attempts += 1;

  const req: ExecutionRequest = { taskId, title: task.spec.title };
  let result: ExecutionResult;
  try {
    result = await executor.execute(req);
  } catch (err) {
    // Fail-closed: an executor crash never counts as success.
    task.state = "failed";
    const message = err instanceof Error ? err.message : String(err);
    log(
      task.mandateId,
      "reject",
      `فشل تنفيذي على «${pick.executor}»: ${message}`,
      true,
      taskId,
    );
    return { taskId, ran: true, halted: false, state: task.state };
  }

  task.lastResult = result;
  mandate.spent += result.cost;
  log(
    task.mandateId,
    "execute",
    `نُفّذت على «${result.executor}» بتكلفة ${result.cost}؛ ادعاء الاكتمال=${result.claimedComplete} (غير موثوق حتى التحقق).`,
    false,
    taskId,
  );

  // --- INDEPENDENT verification (never trust the self-certification) ---
  let verification = independentlyVerify(result, task.spec.verify);

  // Method-bound tasks (K4): the work must ALSO comply with the declared
  // B2-β method, proven by INDEPENDENTLY collected artifacts. The
  // executor's own `result.methodOutput` is recorded-but-ignored (same
  // anti-self-certification stance as `claimedComplete`): evidence comes
  // only from the registered MethodEvidenceSource (repo/CI/PR/runtime).
  // No source or no evidence → missing-input → REJECTED, never a pass.
  if (verification.verdict === "VERIFIED" && task.spec.methodId !== undefined) {
    const independentEvidence = store.methodEvidenceSource
      ? store.methodEvidenceSource(taskId)
      : undefined;
    if (result.methodOutput !== undefined) {
      log(
        task.mandateId,
        "verify",
        "منفّذ أرفق methodOutput ذاتياً — سُجّل وتم تجاهله؛ الدليل يُجمَع من مصدر مستقل فقط.",
        false,
        taskId,
      );
    }
    const compliance = verifyMethodCompliance(
      task.spec.methodId,
      independentEvidence,
    );
    if (!compliance.compliant) {
      const details = compliance.violations
        .map((v) => `[${v.rule}] ${v.message}`)
        .join(" | ");
      verification = {
        ...verification,
        verdict: "REJECTED",
        passedCheck: false,
        actualState: "PARTIAL",
        reason: `رُفض: الدليل المستقل يخالف المنهج المعتمد «${task.spec.methodId}» — ${details}`,
      };
    }
  }
  task.lastVerification = verification;

  if (verification.verdict === "VERIFIED") {
    task.state = "verified";
    task.claimedButUnverified = false;
    log(task.mandateId, "verify", verification.reason, true, taskId);
    // Independent verification writes covering evidence to the OCMBR ledger.
    recordWaveEvidenceIfComplete(task.mandateId, task.waveId);
  } else if (verification.verdict === "PENDING") {
    task.state = "assigned";
    task.claimedButUnverified = false;
    log(task.mandateId, "verify", verification.reason, true, taskId);
  } else {
    // REJECTED — the executor may have lied (false self-certification).
    task.claimedButUnverified = result.claimedComplete;
    recordRejectionEvidence(task.mandateId, task.waveId, verification.reason);
    if (result.claimedComplete) {
      log(
        task.mandateId,
        "reject-false-cert",
        `${verification.reason} تقييم الادعاء=${verification.claimVerdict}.`,
        true,
        taskId,
      );
    }
    if (task.attempts >= task.maxAttempts) {
      task.state = "abandoned";
      log(
        task.mandateId,
        "abandon",
        `استُنفدت المحاولات (${task.attempts}/${task.maxAttempts}) — تُترك المهمة غير مُثبتة.`,
        true,
        taskId,
      );
    } else {
      task.state = "rejected";
      log(task.mandateId, "reject", verification.reason, true, taskId);
    }
  }

  return {
    taskId,
    ran: true,
    halted: false,
    state: task.state,
    verification,
  };
}

/**
 * Run every pending task of a mandate, wave by wave in declared order.
 * Stops early if the budget governor halts the mandate. Returns the
 * full report.
 */
export async function runMandate(
  mandateId: string,
  now: number = Date.now(),
): Promise<MandateReport> {
  const mandate = store.mandates.get(mandateId);
  if (!mandate) throw new Error(`unknown mandate: ${mandateId}`);

  for (const wave of mandate.plan.waves) {
    for (const taskSpec of wave.tasks) {
      const task = store.tasks.get(taskSpec.id);
      if (!task) continue;
      if (task.state === "pending") {
        const res = await runTask(taskSpec.id, now);
        if (res.halted) return report(mandateId);
      }
    }
  }
  return report(mandateId);
}

// --- Straggler resumption -------------------------------------------------

/**
 * Detect stragglers (timed-out / failed / rejected tasks) and reassign
 * the reassignable ones per policy, resetting them to pending so a later
 * run retries them. Returns the findings for transparency.
 */
export function reassignStragglers(
  mandateId: string,
  now: number = Date.now(),
): StragglerFinding[] {
  const mandate = store.mandates.get(mandateId);
  if (!mandate) throw new Error(`unknown mandate: ${mandateId}`);

  const snapshots: TaskSnapshot[] = [];
  for (const wave of mandate.plan.waves) {
    for (const taskSpec of wave.tasks) {
      const t = store.tasks.get(taskSpec.id);
      if (!t) continue;
      snapshots.push({
        id: t.spec.id,
        state: t.state,
        executor: t.assignedExecutor ?? t.requestedExecutor,
        attempts: t.attempts,
        maxAttempts: t.maxAttempts,
        startedAt: t.startedAt,
        timeoutMs: t.timeoutMs,
      });
    }
  }

  const findings = detectStragglers(snapshots, now);
  for (const finding of findings) {
    if (!finding.reassignable) {
      const t = store.tasks.get(finding.taskId);
      if (t && t.state !== "abandoned") {
        t.state = "abandoned";
        log(
          mandateId,
          "abandon",
          `متعثر غير قابل لإعادة التوزيع (${finding.reason}) — استُنفدت المحاولات.`,
          true,
          finding.taskId,
        );
      }
      continue;
    }
    const t = store.tasks.get(finding.taskId);
    if (!t) continue;
    const policy = reassignmentPolicy(
      t.assignedExecutor ?? t.requestedExecutor,
      t.attempts,
    );
    t.assignedExecutor = policy.executor;
    t.state = "pending";
    t.startedAt = undefined;
    const kind: DecisionKind =
      policy.executor === "human" &&
      (t.requestedExecutor !== "human")
        ? "escalate"
        : "reassign";
    log(
      mandateId,
      kind,
      `متعثر (${finding.reason}): ${policy.reason}`,
      true,
      finding.taskId,
    );
  }
  return findings;
}

// --- Reporting (separates PROVEN from CLAIMED) ----------------------------

export interface TaskReport {
  id: string;
  title: string;
  waveId: string;
  state: TaskState;
  requestedExecutor: ExecutorKind;
  assignedExecutor?: ExecutorKind;
  attempts: number;
  claimedComplete: boolean;
  independentlyVerified: boolean;
  claimedButUnverified: boolean;
}

export interface WaveReport {
  id: string;
  title: string;
  exitGate: string;
  /** Exit gate is met ONLY when every task is independently verified. */
  passed: boolean;
  tasks: TaskReport[];
}

export interface MandateReport {
  mandateId: string;
  goal: string;
  budget: {
    cap: number;
    spent: number;
    remaining: number;
    halted: boolean;
    haltReason?: string;
  };
  waves: WaveReport[];
  /** Tasks whose ACTUAL output passed independent verification. */
  proven: TaskReport[];
  /** Tasks the executor self-certified but which are NOT proven. */
  claimed: TaskReport[];
  /** true only when every task is independently verified. */
  complete: boolean;
  /** The mandate's state as COMPUTED by the OCMBR truth ledger (B0). */
  ledger: { code: string; state: MaturityState; labelAr: string } | null;
  decisions: Decision[];
}

function toTaskReport(t: TaskRecord): TaskReport {
  return {
    id: t.spec.id,
    title: t.spec.title,
    waveId: t.waveId,
    state: t.state,
    requestedExecutor: t.requestedExecutor,
    assignedExecutor: t.assignedExecutor,
    attempts: t.attempts,
    claimedComplete: t.lastResult?.claimedComplete ?? false,
    independentlyVerified: t.state === "verified",
    claimedButUnverified: t.claimedButUnverified,
  };
}

/**
 * Build the mandate report. Honesty requirement: `proven` (independently
 * verified) is kept strictly separate from `claimed` (executor self-
 * certified but not proven). A wave's exit gate passes only when every
 * task in it is independently verified — a self-certification alone can
 * never close a gate.
 */
export function report(mandateId: string): MandateReport {
  const mandate = store.mandates.get(mandateId);
  if (!mandate) throw new Error(`unknown mandate: ${mandateId}`);

  const waves: WaveReport[] = mandate.plan.waves.map((wave) => {
    const tasks = wave.tasks
      .map((ts) => store.tasks.get(ts.id))
      .filter((t): t is TaskRecord => t !== undefined)
      .map(toTaskReport);
    return {
      id: wave.id,
      title: wave.title,
      exitGate: wave.exitGate,
      passed: tasks.length > 0 && tasks.every((t) => t.independentlyVerified),
      tasks,
    };
  });

  const allTasks = waves.flatMap((w) => w.tasks);
  const proven = allTasks.filter((t) => t.independentlyVerified);
  const claimed = allTasks.filter(
    (t) => t.claimedComplete && !t.independentlyVerified,
  );

  const ledgerStatus = capabilityStatus(mandateCapCode(mandateId));

  return {
    mandateId,
    goal: mandate.plan.goal,
    budget: {
      cap: mandate.plan.budget,
      spent: mandate.spent,
      remaining: Math.max(0, mandate.plan.budget - mandate.spent),
      halted: mandate.halted,
      haltReason: mandate.haltReason,
    },
    waves,
    proven,
    claimed,
    complete: allTasks.length > 0 && allTasks.every((t) => t.independentlyVerified),
    ledger: ledgerStatus
      ? {
          code: ledgerStatus.capability.code,
          state: ledgerStatus.state,
          labelAr: ledgerStatus.labelAr,
        }
      : null,
    decisions: store.decisions.filter((d) => d.mandateId === mandateId),
  };
}

export function listDecisions(mandateId?: string): Decision[] {
  return mandateId
    ? store.decisions.filter((d) => d.mandateId === mandateId)
    : [...store.decisions];
}

// --- Test / reset ---------------------------------------------------------

export function __resetOrchestratorForTests(): void {
  store.mandates.clear();
  store.tasks.clear();
  store.executors.clear();
  store.decisions.length = 0;
  store.seq = 0;
  store.methodEvidenceSource = undefined;
  ensureDefaults();
}

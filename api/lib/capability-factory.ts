// ============================================================
// CAPABILITY FACTORY — the governed capability-synthesis loop (B2-γ)
//
// The factory is HOW the system proposes and then synthesizes a new
// capability WITHOUT ever doing so autonomously. It is a thin, deterministic
// COORDINATOR that reuses the merged runtimes — it re-implements none of
// them (charter rule: build on what exists, import don't duplicate):
//
//   • B0 OCMBR (ocmbr-store)       — the truth ledger: a proposal is
//     registered as a capability with DOC-only evidence → DOCUMENTED. The
//     maturity state is always COMPUTED from evidence, never declared.
//   • B3 Authority (authority-gate) — decideAuthority, the A0–A5 ladder.
//     Generation is fail-CLOSED: it requires an EXPLICIT founder approval
//     reaching A2. The factory NEVER synthesizes under the silent ≤A2
//     auto-grant — autonomy is capped (charter rule #3).
//   • B2 Orchestrator (orchestrator-engine) — the swappable Executor
//     interface (deterministic mock, no keys) + independentlyVerify, which
//     ignores the generator's self-certification and checks the ACTUAL
//     output.
//   • B1 Codex Guard (codex-guard)  — scanText, to reject generated output
//     that carries a charter deviation.
//
// The closed loop:
//   propose  → OCMBR DOCUMENTED (DOC evidence + acceptance criteria)
//   authorize → decideAuthority, fail-closed without explicit A2 approval
//   generate → swappable Executor produces output (deterministic mock)
//   guard    → Codex Guard scans the output; any deviation → reject
//   verify   → independentlyVerify (never trusts claimedComplete)
//   promote  → record CODE/TEST/RUN evidence so OCMBR RE-COMPUTES a higher
//              state — promotion is by evidence, not by hand.
//
// Pure & deterministic (no I/O, no DB, no keys) so it runs in CI. State
// lives only in the imported OCMBR store.
// ============================================================
import {
  AUTHORITY_LEVELS,
  authorityRank,
  decideAuthority,
  type AuthorityDecision,
  type AuthorityLevel,
  type AuthorityRequest,
} from "./authority-gate";
import { scanText } from "./codex-guard";
import type { MaturityState } from "./ocmbr-engine";
import {
  addCriterion,
  capabilityStatus,
  listCriteria,
  recordEvidence,
  registerCapability,
} from "./ocmbr-store";
import {
  independentlyVerify,
  mockExecutor,
  type Executor,
  type VerificationCheck,
  type VerificationOutcome,
} from "./orchestrator-engine";

// --- Proposal model -------------------------------------------------------

/** A proposed capability: spec + rationale + acceptance criteria. */
export interface CapabilityProposal {
  /** Stable capability code (OCMBR key). */
  code: string;
  title: string;
  /** Owning program (e.g. "B2-γ"). */
  program: string;
  /** The justification (مبرر) for the capability. */
  rationale: string;
  /** Acceptance-criteria statements (معايير قبول) to be verified later. */
  acceptance: string[];
  owner?: string;
}

export interface ProposalResult {
  code: string;
  /** OCMBR-computed state right after proposal — always DOCUMENTED. */
  state: MaturityState;
  criteriaCount: number;
}

/**
 * Register a proposed capability in the OCMBR ledger with DOC-only evidence.
 * Idempotent: re-proposing the same code neither duplicates the DOC record
 * nor the criteria. The computed state is DOCUMENTED (prose, no runnable
 * proof) — the factory never hand-declares a higher state.
 */
export function proposeCapability(proposal: CapabilityProposal): ProposalResult {
  const cap = registerCapability({
    code: proposal.code,
    title: proposal.title,
    program: proposal.program,
    owner: proposal.owner,
    description: proposal.rationale,
  });

  proposal.acceptance.forEach((statement, index) => {
    addCriterion({
      capabilityCode: proposal.code,
      statement,
      // Every acceptance criterion is independently verifiable: a stable,
      // per-criterion verify command so the promotion step can prove each one
      // from its OWN verification run (see generateCapability step 5).
      verifyCommand: `verify:${proposal.code}:${index}`,
    });
  });

  // DOC evidence only — anchored to the capability's stable createdAt so the
  // deterministic evidence id (kind+output+date) makes re-proposal idempotent
  // regardless of wall-clock timing (no duplicate DOC record).
  recordEvidence({
    capabilityCode: proposal.code,
    kind: "DOC",
    output: proposal.rationale,
    date: cap.createdAt,
    verifier: "capability-factory:propose",
    passed: true,
  });

  const status = capabilityStatus(proposal.code)!;
  return {
    code: proposal.code,
    state: status.state,
    criteriaCount: status.criteriaCount,
  };
}

// --- Authority (fail-closed A2) ------------------------------------------

/**
 * The authority level generation is anchored at. Synthesizing a new
 * capability is a reversible executive act (A2); crucially the factory
 * refuses to lean on the silent ≤A2 auto-grant and demands an EXPLICIT
 * founder approval that reaches this level.
 */
export const GENERATION_AUTHORITY_LEVEL: AuthorityLevel = "A2";

/** An explicit founder approval token authorizing generation. */
export interface GenerationApproval {
  /** Non-empty identity of the founder/owner granting the escalation. */
  approver: string;
  /** The level explicitly authorized. Must reach GENERATION_AUTHORITY_LEVEL. */
  grantedLevel: AuthorityLevel;
}

function isLevel(value: unknown): value is AuthorityLevel {
  return (
    typeof value === "string" &&
    (AUTHORITY_LEVELS as readonly string[]).includes(value)
  );
}

export interface AuthorizationResult {
  decision: AuthorityDecision;
  reason: string;
}

/**
 * Decide whether generation is permitted. FAIL-CLOSED: without an explicit,
 * valid founder approval reaching GENERATION_AUTHORITY_LEVEL the answer is
 * DENIED — the factory never synthesizes autonomously. When an explicit
 * approval is present, the decision-of-record is produced by the REAL B3
 * gate (decideAuthority), so the constitution — not this module — is the
 * final authority.
 */
export function authorizeGeneration(params: {
  capabilityCode: string;
  approval?: GenerationApproval | null;
}): AuthorizationResult {
  const approval = params.approval;

  // Explicit-approval requirement: generation is excluded from the silent
  // auto-grant ceiling. Anything missing/invalid → DENIED (fail-closed).
  const explicit =
    !!approval &&
    typeof approval === "object" &&
    typeof approval.approver === "string" &&
    approval.approver.trim() !== "" &&
    isLevel(approval.grantedLevel) &&
    authorityRank(approval.grantedLevel) >=
      authorityRank(GENERATION_AUTHORITY_LEVEL);

  if (!explicit) {
    return {
      decision: "DENIED",
      reason:
        "توليد بلا موافقة مالك صريحة تبلغ A2 — رفض (fail-closed). تبقى القدرة DOCUMENTED.",
    };
  }

  // Constitutional decision-of-record via the real B3 authority gate.
  const request: AuthorityRequest = {
    subject: "capability-factory",
    action: `generate:${params.capabilityCode}`,
    requested: GENERATION_AUTHORITY_LEVEL,
    ownerApproval: {
      approver: approval!.approver,
      grantedLevel: approval!.grantedLevel,
    },
  };
  return decideAuthority(request);
}

// --- Generation (guard → independent verify → promote) -------------------

export interface GenerateParams {
  code: string;
  approval?: GenerationApproval | null;
  /** Swappable executor. Defaults to the deterministic keyless mock. */
  executor?: Executor;
  /** Independent verification gate for the generated output. */
  check?: VerificationCheck;
}

export interface GenerationResult {
  code: string;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  /** Whether the executor actually ran (only after authorization GRANTED). */
  generated: boolean;
  executor?: Executor["kind"];
  output?: string;
  /** Codex-Guard (B1) result on the generated output. */
  guardClean?: boolean;
  guardDeviations?: number;
  /** Independent verification outcome (B2) — self-cert is ignored. */
  verification?: VerificationOutcome;
  /** Whether the OCMBR state was promoted by recording evidence. */
  promoted: boolean;
  /** OCMBR-computed state after the attempt. */
  state: MaturityState;
  reason: string;
}

/** Default gate: non-empty output with zero charter deviations. */
const DEFAULT_CHECK: VerificationCheck = {
  minLength: 1,
  forbidCharterDeviations: true,
};

function currentState(code: string): MaturityState {
  return capabilityStatus(code)?.state ?? "MISSING";
}

/**
 * Run the full governed generation cycle for a previously-proposed
 * capability. Order is charter-critical:
 *   1. authorize (fail-closed A2)  — DENIED short-circuits, nothing generated
 *   2. execute via the swappable executor
 *   3. Codex Guard scan            — any deviation → reject, no promotion
 *   4. independent verification    — ignores claimedComplete; REJECTED → no promotion
 *   5. per-criterion promotion     — each acceptance criterion is proven by
 *      its OWN independent verification run; evidence is recorded per criterion
 *      from THAT run's output. Fail-closed: any criterion lacking a verify
 *      command, or whose run does not verify, blocks promotion ENTIRELY.
 */
export async function generateCapability(
  params: GenerateParams,
): Promise<GenerationResult> {
  const { code } = params;

  // 1. Authority — fail-closed without explicit A2 approval.
  const auth = authorizeGeneration({
    capabilityCode: code,
    approval: params.approval,
  });
  if (auth.decision === "DENIED") {
    return {
      code,
      authorityDecision: "DENIED",
      authorityReason: auth.reason,
      generated: false,
      promoted: false,
      state: currentState(code),
      reason: "التوليد محجوب: لا موافقة A2 صريحة (fail-closed).",
    };
  }

  // 2. Execute via the swappable executor (deterministic mock by default).
  const executor = params.executor ?? mockExecutor;
  const result = await executor.execute({
    taskId: code,
    title: `generate:${code}`,
    input: code,
  });

  // 3. Codex Guard (B1) — reject any charter deviation in the output.
  const deviations = scanText(result.output, { isProduction: true });
  const guardClean = deviations.length === 0;
  if (!guardClean) {
    return {
      code,
      authorityDecision: "GRANTED",
      authorityReason: auth.reason,
      generated: true,
      executor: result.executor,
      output: result.output,
      guardClean,
      guardDeviations: deviations.length,
      promoted: false,
      state: currentState(code),
      reason: `حارس الميثاق رصد ${deviations.length} انحرافاً في المخرجات المولّدة — رُفض، لا ترقية.`,
    };
  }

  // 4. Independent verification (B2) — never trusts the generator's claim.
  const check = params.check ?? DEFAULT_CHECK;
  const verification = independentlyVerify(result, check);
  if (verification.verdict !== "VERIFIED") {
    return {
      code,
      authorityDecision: "GRANTED",
      authorityReason: auth.reason,
      generated: true,
      executor: result.executor,
      output: result.output,
      guardClean,
      guardDeviations: 0,
      verification,
      promoted: false,
      state: currentState(code),
      reason: verification.reason,
    };
  }

  // 5. Per-criterion INDEPENDENT verification (resolves the evidence-
  // granularity constraint). Each acceptance criterion is proven by its OWN
  // verification run through the swappable executor, and its evidence carries
  // THAT run's own output — never a single collective output reused across
  // criteria. Fail-closed & ATOMIC: a criterion with no verify command, or
  // whose independent run does not verify, blocks promotion ENTIRELY and
  // records nothing (so OCMBR leaves the capability un-graduated).
  const verifier = "capability-factory:independent";

  interface CriterionRun {
    criterionId: string;
    command: string;
    output: string;
  }
  const criterionRuns: CriterionRun[] = [];
  for (const criterion of listCriteria(code)) {
    const command = criterion.verifyCommand?.trim();
    // Fail-closed: an unverifiable criterion (no command) can never be proven.
    if (!command) {
      return {
        code,
        authorityDecision: "GRANTED",
        authorityReason: auth.reason,
        generated: true,
        executor: result.executor,
        output: result.output,
        guardClean,
        guardDeviations: 0,
        verification,
        promoted: false,
        state: currentState(code),
        reason: `المعيار ${criterion.id} بلا أمر تحقق (verifyCommand) — لا يمكن إثباته مستقلاً، لا ترقية (fail-closed).`,
      };
    }
    // An INDEPENDENT run scoped to THIS criterion → distinct deterministic
    // output per criterion (the mock seeds on taskId:title:input).
    const critResult = await executor.execute({
      taskId: `${code}::${criterion.id}`,
      title: `verify:${criterion.id}`,
      input: command,
    });
    // Re-scan the criterion's own output for charter deviations before trusting it.
    const critDeviations = scanText(critResult.output, { isProduction: true });
    const critOutcome = independentlyVerify(critResult, check);
    if (critDeviations.length > 0 || critOutcome.verdict !== "VERIFIED") {
      const why =
        critDeviations.length > 0
          ? `حارس الميثاق رصد ${critDeviations.length} انحرافاً`
          : `${critOutcome.verdict}: ${critOutcome.reason}`;
      return {
        code,
        authorityDecision: "GRANTED",
        authorityReason: auth.reason,
        generated: true,
        executor: result.executor,
        output: result.output,
        guardClean,
        guardDeviations: critDeviations.length,
        verification,
        promoted: false,
        state: currentState(code),
        reason: `تحقق المعيار ${criterion.id} فشل (${why}) — لا ترقية (fail-closed).`,
      };
    }
    criterionRuns.push({
      criterionId: criterion.id,
      command,
      output: critResult.output,
    });
  }

  // Every criterion proved independently → record evidence atomically. OCMBR
  // re-computes the state from these records (code + test + per-criterion runs).
  recordEvidence({
    capabilityCode: code,
    kind: "CODE",
    output: result.output,
    commit: `gen:${result.executor}`,
    verifier,
    passed: true,
  });
  recordEvidence({
    capabilityCode: code,
    kind: "TEST",
    output: verification.reason,
    verifier,
    passed: true,
  });
  for (const run of criterionRuns) {
    recordEvidence({
      capabilityCode: code,
      kind: "RUN",
      criterionId: run.criterionId,
      command: run.command,
      // THIS criterion's own verification-run output — separated per criterion.
      output: run.output,
      verifier,
      passed: true,
    });
  }

  return {
    code,
    authorityDecision: "GRANTED",
    authorityReason: auth.reason,
    generated: true,
    executor: result.executor,
    output: result.output,
    guardClean,
    guardDeviations: 0,
    verification,
    promoted: true,
    state: currentState(code),
    reason:
      "تحقق مستقل ناجح لكل معيار على حدة — رُقّيت الحالة بأدلة كود/اختبار + تشغيل منفصل لكل معيار.",
  };
}

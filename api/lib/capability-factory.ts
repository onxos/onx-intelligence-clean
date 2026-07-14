// ============================================================
// CAPABILITY FACTORY — the self-extending runtime, GOVERNED under A2 (B2-γ)
//
// The founder's dream of "a system that grows itself" — implemented as a
// DETERMINISTIC runtime and clamped HARD under the charter: no capability
// is ever generated without an explicit human owner approval. Autonomy is
// capped at A2; generating a new capability is a STRUCTURAL change (A3), so
// it is fail-CLOSED — denied unless a constitutional owner signs off.
//
// Pure module: no I/O, no DB, no keys, no clock reads. Every function is
// total and deterministic so the whole subsystem runs in CI with zero
// external dependencies (following api/lib/orchestrator-engine.ts).
//
// Charter alignment & REUSE (build on what exists, never duplicate):
//   #3 the generator is a swappable executor with a deterministic mock
//      (B2-α runMockExecutor) that needs no keys.
//   #4 autonomy forbidden above A2 — the authorization step calls B3's
//      pure decideAuthority; > A2 requires a real OwnerApproval.
//   #5 the guard step REUSES B1 scanText; the verification step REUSES
//      B2-α independentlyVerify (an executor's self-certification is never
//      trusted); maturity is COMPUTED by B0's five-state ladder, not here.
// ============================================================
import {
  decideAuthority,
  authorityRank,
  AUTO_GRANT_CEILING,
  type AuthorityLevel,
  type AuthorityDecision,
  type AuthorityRequest,
  type OwnerApproval,
} from "./authority-gate";
import {
  runMockExecutor,
  independentlyVerify,
  type ExecutionRequest,
  type ExecutionResult,
  type VerificationCheck,
  type VerificationOutcome,
} from "./orchestrator-engine";
import { scanText, type Deviation } from "./codex-guard";

// --- The governance invariant --------------------------------------------

/**
 * Generating a brand-new capability is a STRUCTURAL change. It is
 * classified ABOVE the auto-grant ceiling (A2) so it can NEVER be granted
 * autonomously — it always requires an explicit human owner approval that
 * reaches this level. This is the beating heart of B2-γ.
 */
export const CAPABILITY_GENERATION_LEVEL: AuthorityLevel = "A3";

// --- Step 1: propose a capability ----------------------------------------

export interface ProposeCapabilityInput {
  /** Stable capability code (OCMBR key). */
  code: string;
  /** Human title. */
  title: string;
  /** Owning program (defaults to B2-γ). */
  program?: string;
  /** WHY this capability should exist (recorded in the decision log). */
  rationale: string;
  /** The acceptance criteria the generated artifact must satisfy. */
  acceptanceCriteria: string[];
  /** Optional owner (informational). */
  owner?: string;
}

export interface CapabilityProposal {
  code: string;
  title: string;
  program: string;
  rationale: string;
  acceptanceCriteria: string[];
  owner?: string;
}

/** Deterministic error type for factory input failures. */
export type CapabilityFactoryErrorCode =
  | "INVALID_CODE"
  | "INVALID_TITLE"
  | "MISSING_RATIONALE"
  | "NO_ACCEPTANCE_CRITERIA";

export class CapabilityFactoryError extends Error {
  readonly code: CapabilityFactoryErrorCode;
  constructor(code: CapabilityFactoryErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CapabilityFactoryError";
  }
}

/**
 * Validate and normalize a proposal. A capability with no acceptance
 * criteria has nothing to verify against, so it is REJECTED — the charter
 * forbids unfalsifiable capabilities. Pure.
 */
export function proposeCapability(
  input: ProposeCapabilityInput,
): CapabilityProposal {
  if (typeof input?.code !== "string" || input.code.trim() === "") {
    throw new CapabilityFactoryError(
      "INVALID_CODE",
      "مواصفة القدرة بلا رمز (code) صالح.",
    );
  }
  if (typeof input.title !== "string" || input.title.trim() === "") {
    throw new CapabilityFactoryError(
      "INVALID_TITLE",
      "مواصفة القدرة بلا عنوان صالح.",
    );
  }
  if (typeof input.rationale !== "string" || input.rationale.trim() === "") {
    throw new CapabilityFactoryError(
      "MISSING_RATIONALE",
      "مواصفة القدرة بلا مبرر — كل قدرة تتطلب مبرراً مسجَّلاً.",
    );
  }
  const criteria = (input.acceptanceCriteria ?? [])
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter((c) => c.length > 0);
  if (criteria.length === 0) {
    throw new CapabilityFactoryError(
      "NO_ACCEPTANCE_CRITERIA",
      "قدرة بلا معايير قبول لا يمكن التحقق منها — مرفوضة.",
    );
  }
  return {
    code: input.code.trim(),
    title: input.title.trim(),
    program: input.program?.trim() || "B2-γ",
    rationale: input.rationale.trim(),
    acceptanceCriteria: criteria,
    owner: input.owner?.trim() || undefined,
  };
}

// --- Step 3: authorization (governed under A2, via the REAL B3 gate) ------

/**
 * Build the AuthorityRequest for GENERATING a capability. It is always at
 * CAPABILITY_GENERATION_LEVEL (> A2), so B3's decideAuthority will DENY it
 * unless a valid owner approval reaching that level is attached.
 */
export function generationAuthorityRequest(
  proposal: CapabilityProposal,
  ownerApproval?: OwnerApproval | null,
): AuthorityRequest {
  return {
    subject: `capability-factory:${proposal.code}`,
    action: `generate-capability:${proposal.code}`,
    requested: CAPABILITY_GENERATION_LEVEL,
    ownerApproval: ownerApproval ?? null,
  };
}

export interface AuthorizationOutcome {
  decision: AuthorityDecision;
  reason: string;
  requested: AuthorityLevel;
  /** true when the request cleared the gate and generation may proceed. */
  mayGenerate: boolean;
}

/**
 * Decide whether generation is authorized, using B3's pure decideAuthority.
 * fail-CLOSED: anything but an explicit GRANTED blocks generation.
 */
export function authorizeGeneration(
  proposal: CapabilityProposal,
  ownerApproval?: OwnerApproval | null,
): AuthorizationOutcome {
  const request = generationAuthorityRequest(proposal, ownerApproval);
  const { decision, reason } = decideAuthority(request);
  return {
    decision,
    reason,
    requested: CAPABILITY_GENERATION_LEVEL,
    mayGenerate: decision === "GRANTED",
  };
}

// --- Step 4: generation via a swappable, deterministic executor -----------

/**
 * A capability generator: turns a proposal's execution request into a
 * concrete artifact result. The default is B2-α's deterministic mock
 * executor (no keys). A real LLM gateway can be swapped in later behind
 * this exact signature. Deliberately synchronous & deterministic so the
 * whole factory cycle is pure and reproducible in CI.
 */
export type CapabilityGenerator = (req: ExecutionRequest) => ExecutionResult;

/** The execution request describing what to generate for this proposal. */
export function buildGenerationRequest(
  proposal: CapabilityProposal,
): ExecutionRequest {
  return {
    taskId: `capability-gen:${proposal.code}`,
    title: proposal.title,
    input: proposal.acceptanceCriteria.join(" | "),
  };
}

/**
 * The INDEPENDENT verification check for a generated artifact. It demands
 * a non-empty artifact that carries the capability's title and is free of
 * charter deviations — evaluated against the ACTUAL output, never the
 * executor's self-report (B2-α independentlyVerify enforces that).
 */
export function verificationCheckFor(
  proposal: CapabilityProposal,
): VerificationCheck {
  return {
    mustInclude: proposal.title,
    minLength: 1,
    forbidCharterDeviations: true,
  };
}

// --- Steps 4→6: generate → guard → independently verify (pure) -----------

export type GenerationVerdict =
  | "VERIFIED" // generated, charter-clean, independently verified
  | "CHARTER_REJECTED" // generated artifact tripped the codex guard (B1)
  | "VERIFICATION_REJECTED"; // artifact failed independent verification (B2-α)

export interface GenerationResult {
  verdict: GenerationVerdict;
  /** The generated artifact (kept even when rejected, for the audit trail). */
  artifact: string;
  /** The executor's raw result (its claimedComplete is recorded, not trusted). */
  execution: ExecutionResult;
  /** Codex-guard findings on the generated artifact (B1). */
  charterDeviations: Deviation[];
  charterClean: boolean;
  /** Independent verification outcome (B2-α), null when charter-rejected. */
  verification: VerificationOutcome | null;
  reason: string;
}

/**
 * Run generation (step 4) then the two independent gates in order:
 *   5. codex-guard scanText on the ACTUAL artifact — any deviation rejects
 *      it before it is ever verified (a poisoned artifact never advances).
 *   6. B2-α independentlyVerify — the executor's self-certification is
 *      ignored; the artifact is checked against the acceptance criteria.
 *
 * Pure: it performs NO ledger writes and assumes authorization already
 * passed. Callers (the store) must gate this behind authorizeGeneration.
 */
export function runGeneration(
  proposal: CapabilityProposal,
  generator: CapabilityGenerator = runMockExecutor,
): GenerationResult {
  const request = buildGenerationRequest(proposal);
  const execution = generator(request);
  const artifact = execution.output ?? "";

  // Step 5 — codex-guard the generated artifact (B1). Production rules.
  const charterDeviations = scanText(artifact, {
    filename: `generated/${proposal.code}.ts`,
    isProduction: true,
  });
  if (charterDeviations.length > 0) {
    return {
      verdict: "CHARTER_REJECTED",
      artifact,
      execution,
      charterDeviations,
      charterClean: false,
      verification: null,
      reason: `المخرج المولّد خالف الميثاق (${charterDeviations.length} انحراف) — رُفض قبل التحقق.`,
    };
  }

  // Step 6 — independent verification (B2-α). Self-certification untrusted.
  const verification = independentlyVerify(
    execution,
    verificationCheckFor(proposal),
  );
  if (verification.verdict === "VERIFIED") {
    return {
      verdict: "VERIFIED",
      artifact,
      execution,
      charterDeviations,
      charterClean: true,
      verification,
      reason: "تحقق مستقل ناجح: المخرج المولّد يفي بمعايير القبول.",
    };
  }
  return {
    verdict: "VERIFICATION_REJECTED",
    artifact,
    execution,
    charterDeviations,
    charterClean: true,
    verification,
    reason: `فشل التحقق المستقل (${verification.claimVerdict}): ${verification.reason}`,
  };
}

// --- Governance summary (pure) -------------------------------------------

/**
 * Human-readable confirmation that the factory's autonomy is capped: the
 * generation level is above the auto-grant ceiling, so no capability can
 * be produced without an owner approval. Useful for the router surface.
 */
export function governanceInvariant(): {
  autoGrantCeiling: AuthorityLevel;
  generationLevel: AuthorityLevel;
  autonomyCapped: boolean;
  statement: string;
} {
  const autonomyCapped =
    authorityRank(CAPABILITY_GENERATION_LEVEL) >
    authorityRank(AUTO_GRANT_CEILING);
  return {
    autoGrantCeiling: AUTO_GRANT_CEILING,
    generationLevel: CAPABILITY_GENERATION_LEVEL,
    autonomyCapped,
    statement: autonomyCapped
      ? `توليد القدرات مصنّف عند ${CAPABILITY_GENERATION_LEVEL} فوق السقف التلقائي ${AUTO_GRANT_CEILING} — لا توليد بلا موافقة مالك صريحة.`
      : "تحذير: مستوى التوليد ليس فوق السقف التلقائي — الاستقلال غير مقيّد.",
  };
}

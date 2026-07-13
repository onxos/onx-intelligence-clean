// ============================================================
// CAPABILITY FACTORY STORE — governed self-extension state (B2-γ)
//
// In-memory, deterministic runtime state that DRIVES the pure factory
// engine (api/lib/capability-factory.ts) through the founder's cycle:
//
//   1. propose a capability
//   2. register it in the OCMBR truth ledger as DOCUMENTED only (reuse B0)
//   3. request generation authority through the REAL B3 AuthorityGate — a
//      structural change (> A2) that is DENIED without an owner approval
//   4. generate via the swappable deterministic executor (reuse B2-α)
//   5. codex-guard the artifact (reuse B1)
//   6. independently verify it (reuse B2-α)
//   7. ONLY THEN upgrade the OCMBR state with covering CODE/TEST/RUN
//      evidence — otherwise the capability stays DOCUMENTED.
//
// Follows the codebase convention (see api/lib/orchestrator-store.ts): a
// pure in-memory store with a __reset helper, so the subsystem runs in CI
// with zero external dependencies. All decision logic lives in the pure
// engine; this file only holds state and records evidence / audit.
// ============================================================
import {
  authorizeGeneration,
  generationAuthorityRequest,
  proposeCapability,
  runGeneration,
  CAPABILITY_GENERATION_LEVEL,
  type CapabilityGenerator,
  type CapabilityProposal,
  type GenerationResult,
  type ProposeCapabilityInput,
} from "./capability-factory";
import { authorityGate, type AuthorityRecord, type OwnerApproval } from "./authority-gate";
import {
  addCriterion,
  capabilityStatus,
  listCriteria,
  recordEvidence,
  registerCapability,
  type CapabilityStatus,
} from "./ocmbr-store";

// --- Decision log (the reasoned audit trail) ------------------------------

export type FactoryDecisionKind =
  | "propose"
  | "authorize-granted"
  | "authorize-denied"
  | "generate"
  | "charter-reject"
  | "verify-reject"
  | "graduate";

export interface FactoryDecision {
  seq: number;
  code: string;
  kind: FactoryDecisionKind;
  reason: string;
  /** true when this reflects an INDEPENDENTLY-PROVEN fact rather than a claim. */
  proven: boolean;
  /** Short pointer to the evidence backing the decision (audit hash / verdict). */
  evidence?: string;
}

// --- Factory run outcome --------------------------------------------------

export type FactoryPhase =
  | "AUTHORIZATION_DENIED" // fail-closed: no generation, capability stays DOCUMENTED
  | "CHARTER_REJECTED" // generated artifact tripped the codex guard (B1)
  | "VERIFICATION_REJECTED" // artifact failed independent verification (B2-α)
  | "VERIFIED"; // full cycle succeeded → OCMBR graduated

export interface FactoryRun {
  code: string;
  phase: FactoryPhase;
  /** Whether ANY artifact was generated (false ⇒ fail-closed denial). */
  generated: boolean;
  /** The B3 authority audit record (hash-chained, tamper-evident). */
  authorityRecord: AuthorityRecord;
  /** The generation result, absent when authorization was denied. */
  generation: GenerationResult | null;
  /** The capability's OCMBR state AFTER the run (the honest source of truth). */
  status: CapabilityStatus | undefined;
  reason: string;
}

interface Store {
  decisions: FactoryDecision[];
  seq: number;
}

const store: Store = {
  decisions: [],
  seq: 0,
};

function log(
  code: string,
  kind: FactoryDecisionKind,
  reason: string,
  proven: boolean,
  evidence?: string,
): FactoryDecision {
  const decision: FactoryDecision = {
    seq: (store.seq += 1),
    code,
    kind,
    reason,
    proven,
    evidence,
  };
  store.decisions.push(decision);
  return decision;
}

export function listDecisions(code?: string): FactoryDecision[] {
  return code
    ? store.decisions.filter((d) => d.code === code)
    : [...store.decisions];
}

// --- Steps 1–2: propose + register as DOCUMENTED --------------------------

/**
 * Propose a capability and register it in the OCMBR ledger with ONLY its
 * acceptance criteria and no runnable evidence — so its computed state is
 * DOCUMENTED (موثق). Idempotent through the OCMBR store's upsert semantics.
 */
export function proposeAndRegister(input: ProposeCapabilityInput): {
  proposal: CapabilityProposal;
  status: CapabilityStatus | undefined;
} {
  const proposal = proposeCapability(input);
  registerCapability({
    code: proposal.code,
    title: proposal.title,
    program: proposal.program,
    owner: proposal.owner,
    description: `اقتراح قدرة: ${proposal.rationale}`,
  });
  for (const statement of proposal.acceptanceCriteria) {
    addCriterion({ capabilityCode: proposal.code, statement });
  }
  // Record the proposal as DOC evidence only (prose, nothing runnable) so
  // the OCMBR-computed state is honestly DOCUMENTED — never MISSING and
  // never above DOCUMENTED until independent verification writes real
  // CODE/TEST/RUN evidence in step 7.
  recordEvidence({
    capabilityCode: proposal.code,
    kind: "DOC",
    output: `مواصفة + مبرر: ${proposal.rationale}`,
    verifier: "capability-factory:proposal",
  });
  log(
    proposal.code,
    "propose",
    `اقتُرحت القدرة «${proposal.title}» بـ${proposal.acceptanceCriteria.length} معيار قبول؛ المبرر: ${proposal.rationale}`,
    true,
    "documented-only",
  );
  return { proposal, status: capabilityStatus(proposal.code) };
}

// --- The full governed cycle ---------------------------------------------

/**
 * Run the WHOLE governed factory cycle for a capability. This is the
 * charter-critical path: generation is fail-CLOSED behind the real B3
 * AuthorityGate. Without a valid owner approval reaching
 * CAPABILITY_GENERATION_LEVEL (A3, above the A2 ceiling), the request is
 * DENIED, NO artifact is produced, and the capability stays DOCUMENTED.
 *
 * The optional `generator` swaps the executor (default: B2-α mock). It is
 * used by tests to inject a poisoned artifact (charter deviation) or a
 * false self-certification, proving the two independent gates reject them.
 */
export function generateCapability(
  input: ProposeCapabilityInput,
  ownerApproval?: OwnerApproval | null,
  generator?: CapabilityGenerator,
): FactoryRun {
  // Steps 1–2: propose + register DOCUMENTED (no evidence yet).
  const { proposal } = proposeAndRegister(input);

  // Step 3: request generation authority through the REAL B3 gate. This
  // appends a tamper-evident record to the hash-chained audit log.
  const authorityRecord = authorityGate.request(
    generationAuthorityRequest(proposal, ownerApproval),
  );

  // fail-CLOSED — anything but an explicit GRANTED blocks generation.
  if (authorityRecord.decision !== "GRANTED") {
    log(
      proposal.code,
      "authorize-denied",
      `رُفض توليد القدرة (fail-closed): ${authorityRecord.reason}`,
      true,
      `authority#${authorityRecord.seq}:${authorityRecord.hash.slice(0, 12)}`,
    );
    return {
      code: proposal.code,
      phase: "AUTHORIZATION_DENIED",
      generated: false,
      authorityRecord,
      generation: null,
      status: capabilityStatus(proposal.code), // stays DOCUMENTED
      reason: `التوليد محظور بلا موافقة مالك صريحة عند ${CAPABILITY_GENERATION_LEVEL}. القدرة تبقى موثقة فقط.`,
    };
  }

  log(
    proposal.code,
    "authorize-granted",
    `مُنحت صلاحية التوليد (${CAPABILITY_GENERATION_LEVEL}): ${authorityRecord.reason}`,
    true,
    `authority#${authorityRecord.seq}:${authorityRecord.hash.slice(0, 12)}`,
  );

  // Steps 4–6: generate → codex-guard → independent verification (pure).
  const generation = runGeneration(proposal, generator);
  log(
    proposal.code,
    "generate",
    `تولّد مخرج القدرة عبر المنفذ «${generation.execution.executor}» (ادّعاء ذاتي: ${generation.execution.claimedComplete}، غير موثوق).`,
    false,
    `artifact:${generation.artifact.length}bytes`,
  );

  // Step 5 gate: a charter deviation in the artifact aborts before upgrade.
  if (generation.verdict === "CHARTER_REJECTED") {
    log(
      proposal.code,
      "charter-reject",
      generation.reason,
      true,
      `deviations:${generation.charterDeviations.length}`,
    );
    return {
      code: proposal.code,
      phase: "CHARTER_REJECTED",
      generated: true,
      authorityRecord,
      generation,
      status: capabilityStatus(proposal.code), // NOT upgraded
      reason: generation.reason,
    };
  }

  // Step 6 gate: a failed independent verification (e.g. false claim) aborts.
  if (generation.verdict === "VERIFICATION_REJECTED") {
    log(
      proposal.code,
      "verify-reject",
      generation.reason,
      true,
      `claim:${generation.verification?.claimVerdict ?? "UNKNOWN"}`,
    );
    return {
      code: proposal.code,
      phase: "VERIFICATION_REJECTED",
      generated: true,
      authorityRecord,
      generation,
      status: capabilityStatus(proposal.code), // NOT upgraded
      reason: generation.reason,
    };
  }

  // Step 7: independent verification PASSED → graduate the OCMBR state by
  // writing covering CODE/TEST/RUN evidence for every acceptance criterion.
  const verifier = "capability-factory:independent";
  const command = `capability-factory.verify ${proposal.code}`;
  for (const criterion of listCriteria(proposal.code)) {
    recordEvidence({
      capabilityCode: proposal.code,
      kind: "CODE",
      criterionId: criterion.id,
      command,
      output: generation.artifact,
      verifier,
    });
    recordEvidence({
      capabilityCode: proposal.code,
      kind: "TEST",
      criterionId: criterion.id,
      command,
      output: "independent verification passed",
      verifier,
      passed: true,
    });
    recordEvidence({
      capabilityCode: proposal.code,
      kind: "RUN",
      criterionId: criterion.id,
      command,
      output: "acceptance criteria met",
      verifier,
      passed: true,
    });
  }
  const status = capabilityStatus(proposal.code);
  log(
    proposal.code,
    "graduate",
    `ترقّت القدرة إلى ${status?.state ?? "?"} بعد تحقق مستقل ناجح.`,
    true,
    `state:${status?.state ?? "?"}`,
  );
  return {
    code: proposal.code,
    phase: "VERIFIED",
    generated: true,
    authorityRecord,
    generation,
    status,
    reason: "دورة المصنع اكتملت: مُنحت الصلاحية، تولّد المخرج، اجتاز حارس الميثاق والتحقق المستقل.",
  };
}

// --- Read helpers ---------------------------------------------------------

export { authorizeGeneration };

export function capabilityState(code: string): CapabilityStatus | undefined {
  return capabilityStatus(code);
}

// --- Test / reset ---------------------------------------------------------

export function __resetCapabilityFactoryForTests(): void {
  store.decisions.length = 0;
  store.seq = 0;
  authorityGate.reset();
}

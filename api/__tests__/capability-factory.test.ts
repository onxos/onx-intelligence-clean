// ============================================================
// CAPABILITY FACTORY — UNIT + INTEGRATION TESTS (B2-γ)
//
// Proves the founder mandate for the governed self-extending runtime:
//   • propose → registered in OCMBR as DOCUMENTED only (reuse B0)
//   • generation is fail-CLOSED behind the REAL B3 AuthorityGate — without
//     a valid owner approval reaching A3 (> the A2 auto-grant ceiling) the
//     request is DENIED, NO artifact is produced, state stays DOCUMENTED
//     (THE most important guarantee: autonomy forbidden above A2)
//   • a valid A3 owner approval → GRANTED → generate → codex-guard (B1) →
//     independent verification (B2-α) → graduation to VERIFIED (full cycle)
//   • a generated artifact with a forbidden label → codex-guard rejects it
//     → the capability is NOT graduated
//   • a false self-certification → independentlyVerify flags OVERSTATED and
//     rejects it → the capability is NOT graduated
//   • a reasoned decision log (why GRANTED/DENIED, what evidence)
//   • the whole surface over tRPC via appRouter.createCaller
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  authorizeGeneration,
  proposeCapability,
  governanceInvariant,
  runGeneration,
  CAPABILITY_GENERATION_LEVEL,
  CapabilityFactoryError,
  type CapabilityGenerator,
} from "../lib/capability-factory";
import {
  __resetCapabilityFactoryForTests,
  generateCapability,
  listDecisions,
  proposeAndRegister,
} from "../lib/capability-factory-store";
import { __resetOcmbrForTests } from "../lib/ocmbr-store";
import { authorityGate, type OwnerApproval } from "../lib/authority-gate";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as never);

beforeEach(() => {
  __resetCapabilityFactoryForTests();
  __resetOcmbrForTests();
});

// A valid constitutional owner approval that reaches the generation level.
const OWNER_OK: OwnerApproval = {
  approver: "founder:onx",
  grantedLevel: CAPABILITY_GENERATION_LEVEL,
};

function proposal(over: Record<string, unknown> = {}) {
  return {
    code: "CAP-DEMO",
    title: "demo capability",
    program: "B2-γ",
    rationale: "needed to prove the governed factory cycle end to end",
    acceptanceCriteria: ["exposes a deterministic endpoint", "has a passing test"],
    ...over,
  };
}

describe("proposeCapability (pure)", () => {
  it("normalizes a valid proposal and defaults the program", () => {
    const p = proposeCapability(proposal({ program: undefined }));
    expect(p.program).toBe("B2-γ");
    expect(p.acceptanceCriteria).toHaveLength(2);
  });

  it("rejects a capability with no acceptance criteria (unfalsifiable)", () => {
    expect(() =>
      proposeCapability(proposal({ acceptanceCriteria: [] })),
    ).toThrow(CapabilityFactoryError);
  });

  it("rejects a capability with no rationale", () => {
    expect(() => proposeCapability(proposal({ rationale: "  " }))).toThrow(
      CapabilityFactoryError,
    );
  });
});

describe("governance invariant — autonomy capped at A2", () => {
  it("classifies generation above the auto-grant ceiling", () => {
    const g = governanceInvariant();
    expect(g.autoGrantCeiling).toBe("A2");
    expect(g.generationLevel).toBe("A3");
    expect(g.autonomyCapped).toBe(true);
  });
});

describe("propose → OCMBR DOCUMENTED", () => {
  it("registers the capability as DOCUMENTED with no runnable evidence", () => {
    const { status } = proposeAndRegister(proposal());
    expect(status?.state).toBe("DOCUMENTED");
    expect(status?.criteriaCount).toBe(2);
    // Only prose (DOC) evidence exists — nothing runnable yet.
    expect(status?.evidenceCount).toBe(1);
  });
});

describe("fail-CLOSED: generation forbidden above A2 without approval", () => {
  it("DENIES generation with NO owner approval and produces NO artifact", () => {
    const run = generateCapability(proposal(), null);
    expect(run.phase).toBe("AUTHORIZATION_DENIED");
    expect(run.generated).toBe(false);
    expect(run.generation).toBeNull();
    // The capability exists but stays DOCUMENTED — nothing was built.
    expect(run.status?.state).toBe("DOCUMENTED");
    expect(run.authorityRecord.decision).toBe("DENIED");
  });

  it("DENIES an owner approval that does NOT reach the generation level", () => {
    const run = generateCapability(proposal(), {
      approver: "founder:onx",
      grantedLevel: "A2", // below A3 → insufficient
    });
    expect(run.phase).toBe("AUTHORIZATION_DENIED");
    expect(run.generated).toBe(false);
    expect(run.status?.state).toBe("DOCUMENTED");
  });

  it("authorizeGeneration (pure) is fail-closed without approval", () => {
    const decision = authorizeGeneration(proposeCapability(proposal()), null);
    expect(decision.decision).toBe("DENIED");
    expect(decision.mayGenerate).toBe(false);
    expect(decision.requested).toBe("A3");
  });
});

describe("full cycle: valid A3 approval → generate → guard → verify → VERIFIED", () => {
  it("graduates the capability to VERIFIED after independent verification", () => {
    const run = generateCapability(proposal(), OWNER_OK);
    expect(run.authorityRecord.decision).toBe("GRANTED");
    expect(run.generated).toBe(true);
    expect(run.phase).toBe("VERIFIED");
    expect(run.generation?.charterClean).toBe(true);
    expect(run.generation?.verification?.verdict).toBe("VERIFIED");
    expect(run.status?.state).toBe("VERIFIED");
  });

  it("writes a tamper-evident authority audit record", () => {
    const run = generateCapability(proposal(), OWNER_OK);
    const chain = authorityGate.exportChain();
    expect(chain.some((r) => r.seq === run.authorityRecord.seq)).toBe(true);
    expect(authorityGate.verifyChain().valid).toBe(true);
  });
});

describe("codex-guard rejects a poisoned generated artifact", () => {
  // A rogue generator emitting a forbidden anthropomorphic label.
  const poisoned: CapabilityGenerator = (req) => ({
    taskId: req.taskId,
    executor: "mock",
    output: `${req.title} — a self-aware consciousness module`,
    claimedComplete: true,
    cost: 1,
  });

  it("blocks graduation when the artifact trips the charter guard (B1)", () => {
    const run = generateCapability(proposal(), OWNER_OK, poisoned);
    expect(run.authorityRecord.decision).toBe("GRANTED");
    expect(run.generated).toBe(true);
    expect(run.phase).toBe("CHARTER_REJECTED");
    expect(run.generation?.charterClean).toBe(false);
    expect(run.generation?.charterDeviations.length).toBeGreaterThan(0);
    // NOT upgraded — real code was refused entry.
    expect(run.status?.state).toBe("DOCUMENTED");
  });
});

describe("independent verification rejects a false self-certification", () => {
  // Executor claims completion but the output fails the acceptance check.
  const liar: CapabilityGenerator = (req) => ({
    taskId: req.taskId,
    executor: "mock",
    output: "incomplete-artifact", // does NOT contain the required title
    claimedComplete: true, // deliberately overstated
    cost: 1,
  });

  it("flags OVERSTATED and refuses graduation", () => {
    const run = generateCapability(proposal(), OWNER_OK, liar);
    expect(run.phase).toBe("VERIFICATION_REJECTED");
    expect(run.generation?.verification?.verdict).toBe("REJECTED");
    expect(run.generation?.verification?.claimVerdict).toBe("OVERSTATED");
    expect(run.status?.state).toBe("DOCUMENTED");
  });

  it("runGeneration (pure) verifies a clean mock artifact", () => {
    const gen = runGeneration(proposeCapability(proposal()));
    expect(gen.verdict).toBe("VERIFIED");
    expect(gen.verification?.claimedComplete).toBe(true);
  });
});

describe("reasoned decision log", () => {
  it("records a denial with its reason and evidence", () => {
    generateCapability(proposal(), null);
    const log = listDecisions("CAP-DEMO");
    expect(log.some((d) => d.kind === "propose")).toBe(true);
    const denied = log.find((d) => d.kind === "authorize-denied");
    expect(denied).toBeDefined();
    expect(denied?.reason).toContain("fail-closed");
    expect(denied?.proven).toBe(true);
  });

  it("records the granted → generate → graduate chain on success", () => {
    generateCapability(proposal(), OWNER_OK);
    const kinds = listDecisions("CAP-DEMO").map((d) => d.kind);
    expect(kinds).toContain("authorize-granted");
    expect(kinds).toContain("generate");
    expect(kinds).toContain("graduate");
  });
});

describe("tRPC surface (appRouter.createCaller)", () => {
  it("exposes the governance invariant", async () => {
    const g = await caller.capabilityFactory.governance();
    expect(g.autonomyCapped).toBe(true);
    expect(g.generationLevel).toBe("A3");
  });

  it("propose → DOCUMENTED, generate w/o approval → DENIED, then graduate", async () => {
    const proposed = await caller.capabilityFactory.propose(proposal());
    expect(proposed.status?.state).toBe("DOCUMENTED");

    const denied = await caller.capabilityFactory.generate({
      proposal: proposal(),
      ownerApproval: null,
    });
    expect(denied.phase).toBe("AUTHORIZATION_DENIED");

    const granted = await caller.capabilityFactory.generate({
      proposal: proposal(),
      ownerApproval: OWNER_OK,
    });
    expect(granted.phase).toBe("VERIFIED");

    const status = await caller.capabilityFactory.status({ code: "CAP-DEMO" });
    expect(status.found).toBe(true);
    if (status.found) expect(status.status.state).toBe("VERIFIED");
  });
});

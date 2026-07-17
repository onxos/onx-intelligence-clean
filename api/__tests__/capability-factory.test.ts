// ============================================================
// CAPABILITY FACTORY — UNIT + INTEGRATION TESTS (B2-γ)
//
// Proves the founder mandate for the governed Capability Factory. The
// factory is the closed loop by which the system PROPOSES a new capability
// and only SYNTHESIZES it under EXPLICIT founder authority — never
// autonomously. It reuses (does not re-implement) the merged runtimes:
//   • B0 OCMBR      — registerCapability / addCriterion / recordEvidence
//   • B3 Authority  — decideAuthority (A0–A5 ladder, fail-closed)
//   • B2 Orchestrator — the swappable Executor + independentlyVerify
//   • B1 Codex Guard  — scanText (charter-deviation scan)
//
// The critical cases (founder-mandated):
//   (a) a proposal is registered in OCMBR as DOCUMENTED (DOC evidence only)
//   (b) generation is BLOCKED without an explicit A2 owner approval
//       (fail-closed) — the capability stays DOCUMENTED, nothing generated
//   (c) with an explicit A2 approval: it generates → Codex-Guard scans →
//       independent verification → promotes the state by recording evidence
//   (d) generated code carrying a charter deviation → Codex Guard REJECTS it
//       and NOTHING is promoted (stays DOCUMENTED)
//   (e) a generator that LIES (claims complete on failing output) is caught
//       by the INDEPENDENT verifier — never self-certified — no promotion
//   (f) the executor is swappable and the default mock is deterministic
//       (no keys, reproducible)
// ============================================================
import { beforeEach, describe, it, expect } from "vitest";
import {
  proposeCapability,
  authorizeGeneration,
  generateCapability,
  GENERATION_AUTHORITY_LEVEL,
  type CapabilityProposal,
  type GenerationApproval,
} from "../lib/capability-factory";
import {
  __resetOcmbrForTests,
  addCriterion,
  capabilityStatus,
  listCriteria,
  listEvidence,
} from "../lib/ocmbr-store";
import { mockExecutor, type Executor } from "../lib/orchestrator-engine";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as never);

const sampleProposal: CapabilityProposal = {
  code: "GEN-DEMO-1",
  title: "قدرة تجريبية مولّدة",
  program: "B2-γ",
  rationale:
    "مبرر: إثبات حلقة مصنع القدرات — اقتراح ثم توليد محكوم بموافقة A2 صريحة.",
  acceptance: [
    "المخرجات غير فارغة وتفي ببوابة التحقق المستقل.",
    "لا انحرافات ميثاق في المخرجات المولّدة.",
  ],
  owner: "capability-factory",
};

const founderApproval: GenerationApproval = {
  approver: "founder",
  grantedLevel: "A2",
};

beforeEach(() => {
  __resetOcmbrForTests();
});

// --- (a) proposal → DOCUMENTED -------------------------------------------

describe("proposeCapability — registers in OCMBR as DOCUMENTED (DOC only)", () => {
  it("registers the proposed capability with DOC evidence and DOCUMENTED state", () => {
    const result = proposeCapability(sampleProposal);
    expect(result.code).toBe("GEN-DEMO-1");
    expect(result.state).toBe("DOCUMENTED");

    const status = capabilityStatus("GEN-DEMO-1");
    expect(status).toBeDefined();
    expect(status!.state).toBe("DOCUMENTED");
    // acceptance criteria were registered for later verification
    expect(status!.criteriaCount).toBe(2);

    // the only evidence at proposal time is documentation — no runnable proof
    const evidence = listEvidence("GEN-DEMO-1");
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((e) => e.kind === "DOC")).toBe(true);
  });

  it("re-proposing the same code is idempotent (no duplicate DOC evidence)", () => {
    proposeCapability(sampleProposal);
    proposeCapability(sampleProposal);
    const evidence = listEvidence("GEN-DEMO-1");
    expect(evidence.filter((e) => e.kind === "DOC")).toHaveLength(1);
    expect(capabilityStatus("GEN-DEMO-1")!.state).toBe("DOCUMENTED");
  });
});

// --- (b) generation fail-closed without A2 -------------------------------

describe("authorizeGeneration — fail-closed without an explicit A2 approval", () => {
  it("generation authority is anchored at A2 (the autonomy ceiling)", () => {
    expect(GENERATION_AUTHORITY_LEVEL).toBe("A2");
  });

  it("DENIES generation when no owner approval is supplied (fail-closed)", () => {
    const decision = authorizeGeneration({ capabilityCode: "GEN-DEMO-1" });
    expect(decision.decision).toBe("DENIED");
  });

  it("DENIES generation when the approval is below A2 (does not reach the level)", () => {
    const decision = authorizeGeneration({
      capabilityCode: "GEN-DEMO-1",
      approval: { approver: "founder", grantedLevel: "A1" },
    });
    expect(decision.decision).toBe("DENIED");
  });

  it("DENIES generation when the approver identity is empty", () => {
    const decision = authorizeGeneration({
      capabilityCode: "GEN-DEMO-1",
      approval: { approver: "   ", grantedLevel: "A2" },
    });
    expect(decision.decision).toBe("DENIED");
  });

  it("GRANTS generation with an explicit founder approval reaching A2", () => {
    const decision = authorizeGeneration({
      capabilityCode: "GEN-DEMO-1",
      approval: founderApproval,
    });
    expect(decision.decision).toBe("GRANTED");
  });
});

describe("generateCapability — BLOCKED without A2, capability stays DOCUMENTED", () => {
  it("does not generate and leaves the capability DOCUMENTED when unapproved", async () => {
    proposeCapability(sampleProposal);
    const result = await generateCapability({ code: "GEN-DEMO-1" });

    expect(result.authorityDecision).toBe("DENIED");
    expect(result.generated).toBe(false);
    expect(result.promoted).toBe(false);
    expect(result.state).toBe("DOCUMENTED");

    // no runnable evidence was recorded — still only the DOC record
    const evidence = listEvidence("GEN-DEMO-1");
    expect(evidence.every((e) => e.kind === "DOC")).toBe(true);
  });
});

// --- (c) approved happy path → generate → guard → verify → promote -------

describe("generateCapability — approved path generates, verifies, promotes", () => {
  it("generates with the deterministic mock, passes the guard + independent verify, and promotes with evidence", async () => {
    proposeCapability(sampleProposal);
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
    });

    expect(result.authorityDecision).toBe("GRANTED");
    expect(result.generated).toBe(true);
    expect(result.guardClean).toBe(true);
    expect(result.verification?.verdict).toBe("VERIFIED");
    // the generator's self-report is recorded but the verdict is the
    // INDEPENDENT one — the claim is not overstated here
    expect(result.verification?.claimVerdict).toBe("CONFIRMED");
    expect(result.promoted).toBe(true);

    // promotion is by RECORDED EVIDENCE, not by hand
    const status = capabilityStatus("GEN-DEMO-1")!;
    expect(status.state).toBe("VERIFIED");
    const kinds = new Set(listEvidence("GEN-DEMO-1").map((e) => e.kind));
    expect(kinds.has("CODE")).toBe(true);
    expect(kinds.has("TEST")).toBe(true);
    expect(kinds.has("RUN")).toBe(true);
  });
});

// --- (d) generated deviation → Codex Guard rejects, no promotion ---------

describe("generateCapability — Codex Guard rejects a charter deviation", () => {
  it("rejects generated output carrying a forbidden label and does NOT promote", async () => {
    proposeCapability(sampleProposal);
    // A swappable executor that fabricates output with a forbidden anthropo-
    // morphic label — the guard (B1) must catch it.
    const deviantExecutor: Executor = {
      kind: "mock",
      execute: (req) => ({
        taskId: req.taskId,
        executor: "mock",
        output: "consciousness: an emergent self-aware core",
        claimedComplete: true,
        cost: 1,
      }),
    };
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
      executor: deviantExecutor,
    });

    expect(result.authorityDecision).toBe("GRANTED");
    expect(result.generated).toBe(true);
    expect(result.guardClean).toBe(false);
    expect(result.guardDeviations).toBeGreaterThan(0);
    expect(result.promoted).toBe(false);
    // stays DOCUMENTED — no runnable evidence recorded
    expect(capabilityStatus("GEN-DEMO-1")!.state).toBe("DOCUMENTED");
  });
});

// --- (e) lying generator caught by INDEPENDENT verification --------------

describe("generateCapability — independent verification catches a false self-certification", () => {
  it("rejects a generator that claims completion on failing output (OVERSTATED), no promotion", async () => {
    proposeCapability(sampleProposal);
    // Claims complete, but the actual output is empty → fails the check.
    const lyingExecutor: Executor = {
      kind: "mock",
      execute: (req) => ({
        taskId: req.taskId,
        executor: "mock",
        output: "",
        claimedComplete: true,
        cost: 1,
      }),
    };
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
      executor: lyingExecutor,
    });

    expect(result.generated).toBe(true);
    // the guard finds nothing wrong with empty output, but the INDEPENDENT
    // verifier does — the claim is not trusted
    expect(result.verification?.verdict).toBe("REJECTED");
    expect(result.verification?.claimVerdict).toBe("OVERSTATED");
    expect(result.promoted).toBe(false);
    expect(capabilityStatus("GEN-DEMO-1")!.state).toBe("DOCUMENTED");
  });
});

// --- (f) swappable executor + deterministic mock -------------------------

describe("executor is swappable and the default mock is deterministic", () => {
  it("the default mock executor produces identical output for identical input (no keys)", () => {
    const a = mockExecutor.execute({ taskId: "t", title: "x", input: "i" });
    const b = mockExecutor.execute({ taskId: "t", title: "x", input: "i" });
    expect(a).toEqual(b);
  });

  it("a custom executor is honoured over the default", async () => {
    proposeCapability(sampleProposal);
    let called = false;
    const customExecutor: Executor = {
      kind: "llm-gateway",
      execute: (req) => {
        called = true;
        return {
          taskId: req.taskId,
          executor: "llm-gateway",
          output: `custom:${req.title}`,
          claimedComplete: true,
          cost: 2,
        };
      },
    };
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
      executor: customExecutor,
    });
    expect(called).toBe(true);
    expect(result.executor).toBe("llm-gateway");
    expect(result.output).toContain("custom:");
  });
});

// --- (C1) evidence granularity: per-criterion independent verification ---

describe("generateCapability — per-criterion independent verification (C1)", () => {
  it("records a SEPARATE RUN evidence per criterion, each carrying its OWN run output (distinct content, not one shared output)", async () => {
    proposeCapability(sampleProposal); // two acceptance criteria
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
    });
    expect(result.promoted).toBe(true);

    const criteria = listCriteria("GEN-DEMO-1");
    expect(criteria).toHaveLength(2);

    const runs = listEvidence("GEN-DEMO-1").filter((e) => e.kind === "RUN");
    // one RUN per criterion — evidence is separated, never collective
    expect(runs).toHaveLength(2);
    // every criterion is covered by its OWN tagged evidence
    const covered = new Set(runs.map((e) => e.criterionId));
    expect(covered).toEqual(new Set(criteria.map((c) => c.id)));
    // the two runs carry DIFFERENT output content — each is its own run, not a
    // single generation output reused across criteria (the resolved constraint)
    const outputs = runs.map((e) => e.output);
    expect(outputs[0]).not.toBe(outputs[1]);
    expect(outputs.every((o) => typeof o === "string" && o!.length > 0)).toBe(
      true,
    );
    // the recorded command is the criterion's real, independent verify command
    for (const run of runs) {
      const crit = criteria.find((c) => c.id === run.criterionId)!;
      expect(run.command).toBe(crit.verifyCommand);
    }
  });

  it("BLOCKS promotion ENTIRELY when a single criterion's independent verification fails (fail-closed, atomic — nothing recorded)", async () => {
    proposeCapability(sampleProposal);
    const criteria = listCriteria("GEN-DEMO-1");
    const failingId = criteria[1].id;
    // An executor that yields valid output for the primary generation and the
    // first criterion, but EMPTY output for the SECOND criterion's run — its
    // independent verification must REJECT and block the whole promotion.
    const partlyFailingExecutor: Executor = {
      kind: "mock",
      execute: (req) => ({
        taskId: req.taskId,
        executor: "mock",
        output: req.title === `verify:${failingId}` ? "" : `ok:${req.title}`,
        claimedComplete: true,
        cost: 1,
      }),
    };
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
      executor: partlyFailingExecutor,
    });

    expect(result.promoted).toBe(false);
    // the reason names the exact criterion that broke
    expect(result.reason).toContain(failingId);
    // atomic fail-closed: NO runnable evidence recorded, stays DOCUMENTED
    expect(capabilityStatus("GEN-DEMO-1")!.state).toBe("DOCUMENTED");
    expect(listEvidence("GEN-DEMO-1").every((e) => e.kind === "DOC")).toBe(true);
  });

  it("BLOCKS promotion when a criterion has NO verifyCommand (unverifiable → fail-closed)", async () => {
    proposeCapability(sampleProposal);
    // an externally-added criterion with no verify command can never be
    // independently proven — so the capability must not graduate.
    addCriterion({
      capabilityCode: "GEN-DEMO-1",
      statement: "معيار بلا أمر تحقق مستقل",
      id: "ac-no-cmd",
    });
    const result = await generateCapability({
      code: "GEN-DEMO-1",
      approval: founderApproval,
    });

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain("ac-no-cmd");
    expect(capabilityStatus("GEN-DEMO-1")!.state).toBe("DOCUMENTED");
    expect(listEvidence("GEN-DEMO-1").every((e) => e.kind === "DOC")).toBe(true);
  });
});

// --- tRPC surface ---------------------------------------------------------

describe("capabilityFactory tRPC router", () => {
  it("propose registers a DOCUMENTED capability over tRPC", async () => {
    const res = await caller.capabilityFactory.propose(sampleProposal);
    expect(res.code).toBe("GEN-DEMO-1");
    expect(res.state).toBe("DOCUMENTED");
  });

  it("generate is fail-closed without approval over tRPC", async () => {
    await caller.capabilityFactory.propose(sampleProposal);
    const res = await caller.capabilityFactory.generate({ code: "GEN-DEMO-1" });
    expect(res.authorityDecision).toBe("DENIED");
    expect(res.promoted).toBe(false);
    expect(res.state).toBe("DOCUMENTED");
  });

  it("generate with explicit A2 approval promotes over tRPC", async () => {
    await caller.capabilityFactory.propose(sampleProposal);
    const res = await caller.capabilityFactory.generate({
      code: "GEN-DEMO-1",
      approval: founderApproval,
    });
    expect(res.authorityDecision).toBe("GRANTED");
    expect(res.promoted).toBe(true);
    expect(res.state).toBe("VERIFIED");
  });

  it("status reflects the OCMBR-computed state", async () => {
    await caller.capabilityFactory.propose(sampleProposal);
    const res = await caller.capabilityFactory.status({ code: "GEN-DEMO-1" });
    expect(res.found).toBe(true);
    if (res.found) expect(res.state).toBe("DOCUMENTED");
  });
});

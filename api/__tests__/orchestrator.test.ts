// ============================================================
// ORCHESTRATOR — UNIT + INTEGRATION TESTS (B2)
//
// Proves the founder mandate for the ONX Orchestrator:
//   • mandates decompose into a CLOSED wave map (every wave has an exit
//     gate; open maps are rejected)
//   • tasks distribute to swappable executors (deterministic mock, no keys)
//   • INDEPENDENT verification — an executor's self-certification is NEVER
//     trusted; a false claim is rejected and flagged OVERSTATED (reuses B1)
//   • a budget governor halts the mandate on breach
//   • stragglers are detected and reassigned
//   • the report separates PROVEN work from merely CLAIMED work
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  budgetGovernor,
  detectStragglers,
  evaluateCheck,
  independentlyVerify,
  humanExecutor,
  OrchestratorError,
  planMandate,
  reassignmentPolicy,
  runMockExecutor,
  selectExecutorKind,
  stableHash,
  type ExecutionResult,
  type Executor,
  type ExecutorKind,
  type MandateSpec,
  type TaskSnapshot,
} from "../lib/orchestrator-engine";
import {
  __resetOrchestratorForTests,
  createMandate,
  registerExecutor,
  reassignStragglers,
  report,
  runMandate,
} from "../lib/orchestrator-store";
import { __resetOcmbrForTests } from "../lib/ocmbr-store";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as never);

beforeEach(() => {
  __resetOrchestratorForTests();
  __resetOcmbrForTests();
});

// Small helper to build a mandate spec.
function mandate(over: Partial<MandateSpec> = {}): MandateSpec {
  return {
    id: "M1",
    goal: "prove the full coordinator cycle",
    budget: 100,
    waves: [
      {
        id: "W1",
        title: "wave one",
        exitGate: "all wave-one tasks independently verified",
        tasks: [
          {
            id: "T1",
            title: "task one",
            executor: "mock",
            estimatedCost: 2,
            verify: { mustInclude: "mock:" },
          },
        ],
      },
      {
        id: "W2",
        title: "wave two",
        exitGate: "all wave-two tasks independently verified",
        tasks: [
          {
            id: "T2",
            title: "task two",
            executor: "mock",
            estimatedCost: 2,
            verify: { mustInclude: "mock:" },
          },
        ],
      },
    ],
    ...over,
  };
}

// ---------------------------------------------------------------------------
describe("planMandate — CLOSED wave map (not open)", () => {
  it("plans a mandate whose every wave carries an exit gate", () => {
    const plan = planMandate(mandate());
    expect(plan.waves).toHaveLength(2);
    expect(plan.waves.map((w) => w.order)).toEqual([1, 2]);
    expect(plan.waves.every((w) => w.exitGate.length > 0)).toBe(true);
    expect(plan.totalTasks).toBe(2);
    expect(plan.estimatedCost).toBe(4);
  });

  it("REJECTS an open wave (missing exit gate)", () => {
    const spec = mandate();
    spec.waves[0].exitGate = "  ";
    expect(() => planMandate(spec)).toThrowError(OrchestratorError);
    try {
      planMandate(spec);
    } catch (e) {
      expect((e as OrchestratorError).code).toBe("OPEN_WAVE_MAP");
    }
  });

  it("rejects an empty mandate and an invalid budget and duplicate ids", () => {
    expect(() => planMandate(mandate({ waves: [] }))).toThrowError(
      /مغلقة/,
    );
    expect(() => planMandate(mandate({ budget: 0 }))).toThrowError(
      OrchestratorError,
    );
    const dup = mandate();
    dup.waves[1].tasks[0].id = "T1"; // duplicate task id
    expect(() => planMandate(dup)).toThrowError(/مكرر/);
  });

  it("flags a plan whose estimate already exceeds the cap", () => {
    const plan = planMandate(mandate({ budget: 3 }));
    expect(plan.overBudgetAtPlan).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("distribution policy + deterministic mock executor", () => {
  it("assigns to the requested executor when available", () => {
    const pick = selectExecutorKind("mock", new Set<ExecutorKind>(["mock"]));
    expect(pick.executor).toBe("mock");
  });

  it("falls back deterministically when the requested executor is absent", () => {
    const pick = selectExecutorKind(
      "llm-gateway",
      new Set<ExecutorKind>(["mock"]),
    );
    expect(pick.executor).toBe("mock");
  });

  it("mock executor is deterministic and keyless", () => {
    const a = runMockExecutor({ taskId: "x", title: "t" });
    const b = runMockExecutor({ taskId: "x", title: "t" });
    expect(a).toEqual(b);
    expect(a.claimedComplete).toBe(true);
    expect(stableHash("t")).toBe(stableHash("t"));
  });
});

// ---------------------------------------------------------------------------
describe("budget governor", () => {
  it("allows a task that stays within the cap", () => {
    const d = budgetGovernor(2, 3, 10);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(5);
  });

  it("halts a task that would breach the cap", () => {
    const d = budgetGovernor(8, 5, 10);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/إيقاف/);
  });
});

// ---------------------------------------------------------------------------
describe("independent verification — self-certification is never trusted", () => {
  it("evaluateCheck fails on empty output regardless of an empty check", () => {
    expect(evaluateCheck("", {}).passed).toBe(false);
    expect(evaluateCheck("x", {}).passed).toBe(true);
  });

  it("verifier independently re-scans output for charter deviations (B1)", () => {
    // The executor claims success but its output contains a forbidden
    // charter label — the INDEPENDENT verifier catches it via Codex Guard,
    // even though the substring check alone would have passed.
    const liar: ExecutionResult = {
      taskId: "T",
      executor: "mock",
      output: "achieved full consciousness — done",
      claimedComplete: true,
      cost: 1,
    };
    const v = independentlyVerify(liar, {
      mustInclude: "done",
      forbidCharterDeviations: true,
    });
    expect(v.verdict).toBe("REJECTED");
    expect(v.charterDeviations).toBeGreaterThan(0);
    expect(v.claimVerdict).toBe("OVERSTATED");
  });

  it("verifier independently recomputes the output hash (SHA analogue)", () => {
    const good = "the-real-artifact";
    const hash = stableHash(good);
    const ok = independentlyVerify(
      { taskId: "T", executor: "mock", output: good, claimedComplete: true, cost: 1 },
      { expectHash: hash },
    );
    expect(ok.verdict).toBe("VERIFIED");
    const tampered = independentlyVerify(
      { taskId: "T", executor: "mock", output: "tampered", claimedComplete: true, cost: 1 },
      { expectHash: hash },
    );
    expect(tampered.verdict).toBe("REJECTED");
  });

  it("VERIFIES when the actual output satisfies the check", () => {
    const result: ExecutionResult = {
      taskId: "T",
      executor: "mock",
      output: "the answer is 42",
      claimedComplete: true,
      cost: 1,
    };
    const v = independentlyVerify(result, { mustInclude: "42" });
    expect(v.verdict).toBe("VERIFIED");
    expect(v.actualState).toBe("VERIFIED");
    expect(v.claimVerdict).toBe("CONFIRMED");
  });

  it("REJECTS a FALSE self-certification and flags it OVERSTATED (B1)", () => {
    const liar: ExecutionResult = {
      taskId: "T",
      executor: "mock",
      output: "totally wrong",
      claimedComplete: true, // the executor LIES
      cost: 1,
    };
    const v = independentlyVerify(liar, { mustInclude: "correct" });
    expect(v.verdict).toBe("REJECTED");
    expect(v.passedCheck).toBe(false);
    expect(v.claimVerdict).toBe("OVERSTATED");
  });

  it("returns PENDING for a human hand-off with no output yet", () => {
    const pending = humanExecutor.execute({ taskId: "T", title: "t" });
    const v = independentlyVerify(pending as ExecutionResult, {});
    expect(v.verdict).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
describe("straggler detection + reassignment policy", () => {
  const base: TaskSnapshot = {
    id: "T",
    state: "running",
    executor: "mock",
    attempts: 1,
    maxAttempts: 2,
    startedAt: 0,
    timeoutMs: 1000,
  };

  it("detects a timed-out running task as a reassignable straggler", () => {
    const found = detectStragglers([base], 5000);
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe("timeout");
    expect(found[0].reassignable).toBe(true);
  });

  it("does not flag a running task still within its timeout", () => {
    expect(detectStragglers([base], 500)).toHaveLength(0);
  });

  it("a straggler that exhausted attempts is not reassignable", () => {
    const found = detectStragglers(
      [{ ...base, state: "failed", attempts: 2 }],
      0,
    );
    expect(found[0].reassignable).toBe(false);
  });

  it("policy escalates to human after repeated failures", () => {
    expect(reassignmentPolicy("mock", 2).executor).toBe("human");
    expect(reassignmentPolicy("mock", 0).executor).toBe("mock");
  });
});

// ---------------------------------------------------------------------------
describe("FULL CYCLE — mandate → closed waves → execute → verify → report", () => {
  it("runs the whole cycle with the deterministic mock and proves it", async () => {
    createMandate(mandate());
    const rep = await runMandate("M1", 1000);

    expect(rep.complete).toBe(true);
    expect(rep.waves.every((w) => w.passed)).toBe(true);
    // Everything is INDEPENDENTLY proven — nothing merely claimed.
    expect(rep.proven).toHaveLength(2);
    expect(rep.claimed).toHaveLength(0);
    expect(rep.budget.halted).toBe(false);
    // The OCMBR truth ledger (B0) computes the mandate as VERIFIED only
    // because independent verification wrote covering evidence.
    expect(rep.ledger?.state).toBe("VERIFIED");
    // The decision log recorded plan + assign + execute + verify.
    const kinds = new Set(rep.decisions.map((d) => d.kind));
    expect(kinds.has("plan")).toBe(true);
    expect(kinds.has("verify")).toBe(true);
  });

  it("REJECTS a lying executor: claimed-but-unverified, never proven", async () => {
    const liar: Executor = {
      kind: "mock",
      execute: (req) => ({
        taskId: req.taskId,
        executor: "mock",
        output: "junk", // never satisfies the check
        claimedComplete: true, // but claims success
        cost: 1,
      }),
    };
    registerExecutor(liar);

    createMandate(
      mandate({
        waves: [
          {
            id: "W1",
            title: "w",
            exitGate: "output must be independently verified",
            tasks: [
              {
                id: "T1",
                title: "t",
                executor: "mock",
                estimatedCost: 1,
                verify: { mustInclude: "GOLDEN" },
                maxAttempts: 1,
              },
            ],
          },
        ],
      }),
    );
    const rep = await runMandate("M1", 1000);

    expect(rep.complete).toBe(false);
    expect(rep.proven).toHaveLength(0);
    // The executor's self-certification is surfaced but NOT accepted.
    expect(rep.claimed).toHaveLength(1);
    expect(rep.claimed[0].claimedButUnverified).toBe(true);
    // The OCMBR ledger never marks a self-certified-but-unproven mandate
    // as VERIFIED.
    expect(rep.ledger?.state).not.toBe("VERIFIED");
    // A dedicated honesty decision was logged.
    expect(
      rep.decisions.some((d) => d.kind === "reject-false-cert"),
    ).toBe(true);
  });

  it("HALTS the mandate when the budget cap is breached", async () => {
    const fixedCost: Executor = {
      kind: "mock",
      execute: (req) => ({
        taskId: req.taskId,
        executor: "mock",
        output: "OK",
        claimedComplete: true,
        cost: 2,
      }),
    };
    registerExecutor(fixedCost);

    createMandate(
      mandate({
        budget: 3, // affords task one (cost 2) but not task two
        waves: [
          {
            id: "W1",
            title: "w1",
            exitGate: "t1 verified",
            tasks: [
              {
                id: "T1",
                title: "t1",
                executor: "mock",
                estimatedCost: 2,
                verify: { mustInclude: "OK" },
              },
            ],
          },
          {
            id: "W2",
            title: "w2",
            exitGate: "t2 verified",
            tasks: [
              {
                id: "T2",
                title: "t2",
                executor: "mock",
                estimatedCost: 2,
                verify: { mustInclude: "OK" },
              },
            ],
          },
        ],
      }),
    );
    const rep = await runMandate("M1", 1000);

    expect(rep.budget.halted).toBe(true);
    expect(rep.proven).toHaveLength(1); // only the first, affordable task
    expect(rep.decisions.some((d) => d.kind === "budget-halt")).toBe(true);
  });

  it("RESUMES a straggler: a first-attempt failure is reassigned then verified", async () => {
    let calls = 0;
    const flaky: Executor = {
      kind: "mock",
      execute: (req) => {
        calls += 1;
        const good = calls > 1; // fails the first time, succeeds after
        return {
          taskId: req.taskId,
          executor: "mock",
          output: good ? "GOOD-OUTPUT" : "bad",
          claimedComplete: true,
          cost: 1,
        };
      },
    };
    registerExecutor(flaky);

    createMandate(
      mandate({
        waves: [
          {
            id: "W1",
            title: "w",
            exitGate: "t verified",
            tasks: [
              {
                id: "T1",
                title: "t",
                executor: "mock",
                estimatedCost: 1,
                verify: { mustInclude: "GOOD" },
                maxAttempts: 2,
              },
            ],
          },
        ],
      }),
    );

    const first = await runMandate("M1", 1000);
    expect(first.complete).toBe(false);
    expect(first.waves[0].tasks[0].state).toBe("rejected");

    const findings = reassignStragglers("M1", 1000);
    expect(findings.some((f) => f.taskId === "T1" && f.reassignable)).toBe(
      true,
    );

    const second = await runMandate("M1", 2000);
    expect(second.complete).toBe(true);
    expect(second.proven).toHaveLength(1);
    expect(
      second.decisions.some((d) => d.kind === "reassign"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("tRPC surface", () => {
  it("createMandate → run → report exposes the full cycle over tRPC", async () => {
    await caller.orchestrator.createMandate(mandate());
    const rep = await caller.orchestrator.run({ mandateId: "M1", now: 1000 });
    expect(rep.complete).toBe(true);

    const fetched = await caller.orchestrator.report({ mandateId: "M1" });
    expect(fetched.found).toBe(true);
    if (fetched.found) {
      expect(fetched.report.proven.length).toBe(2);
    }
  });

  it("report returns found:false for an unknown mandate", async () => {
    const res = await caller.orchestrator.report({ mandateId: "NOPE" });
    expect(res.found).toBe(false);
  });

  it("createMandate rejects an open wave map over tRPC", async () => {
    const bad = mandate();
    bad.waves[0].exitGate = ""; // zod min(1) blocks it at the boundary
    await expect(
      caller.orchestrator.createMandate(bad),
    ).rejects.toThrow();
  });
});

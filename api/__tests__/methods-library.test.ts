// ============================================================
// METHODS LIBRARY — UNIT + INTEGRATION TESTS (B2-β)
//
// Proves the founder mandate for the governed Methods Library:
//   • the 5 approved methods are DATA records (id + declarative,
//     programmatically-checkable rules), not free prompts
//   • requireMethod attaches a method and yields the rules to satisfy;
//     an unknown method is REJECTED (fail-closed, never silently accepted)
//   • verifyMethodCompliance inspects the worker's ACTUAL outputs against
//     the declared method and returns {compliant, violations}:
//       - tdd-mandatory: code with no matching test → REJECT; test per code → accept
//       - subagent-driven: overlapping file ownership → REJECT; exclusive → accept
//       - root-cause-tracing: a fix with no documented root cause → REJECT
//       - adr: a decision with no/partial ADR → REJECT
//       - standard-git: oversized PR / missing Co-authored-by / self-merge → REJECT
//   • verifyMethodCompliance REUSES Codex Guard (B1) — a forbidden label /
//     charter deviation in the worker's files becomes a violation
//   • fail-closed: unknown method or missing input → safe REJECT, not accept
// ============================================================
import { describe, it, expect } from "vitest";
import {
  METHOD_IDS,
  listMethods,
  getMethod,
  requireMethod,
  verifyMethodCompliance,
  MethodError,
  type Method,
  type WorkerOutput,
} from "../lib/methods-library";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as never);

describe("methods registry — data records, not free prompts", () => {
  it("registers exactly the 10 approved methods", () => {
    expect([...METHOD_IDS].sort()).toEqual(
      [
        "adr",
        "code-review",
        "git-hygiene",
        "independent-bisect",
        "push-early-often",
        "root-cause-tracing",
        "standard-git",
        "subagent-driven",
        "tdd-mandatory",
        "test-fixing",
      ].sort(),
    );
    expect(listMethods()).toHaveLength(10);
  });

  it("every method is a record with an id, title, description and checkable rules", () => {
    for (const method of listMethods()) {
      expect(typeof method.id).toBe("string");
      expect(method.title.length).toBeGreaterThan(0);
      expect(method.description.length).toBeGreaterThan(0);
      expect(method.rules.length).toBeGreaterThan(0);
      for (const rule of method.rules) {
        // rules are declarative — a machine-evaluable kind, not prose only
        expect(typeof rule.kind).toBe("string");
        expect(rule.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("retrieves each method by id with its rules", () => {
    for (const id of METHOD_IDS) {
      const method = getMethod(id) as Method;
      expect(method).toBeDefined();
      expect(method.id).toBe(id);
    }
  });

  it("getMethod returns undefined for an unknown id (no silent invention)", () => {
    expect(getMethod("does-not-exist")).toBeUndefined();
  });
});

describe("requireMethod — attach method + yield rules to satisfy", () => {
  it("returns the method id and the concrete list of rules", () => {
    const req = requireMethod("tdd-mandatory");
    expect(req.methodId).toBe("tdd-mandatory");
    expect(req.rules.length).toBeGreaterThan(0);
    expect(req.rules.map((r) => r.kind)).toContain("test-file-per-code");
  });

  it("carries the optional target (task/worker) it is attached to", () => {
    const req = requireMethod("adr", "task-42");
    expect(req.target).toBe("task-42");
  });

  it("FAIL-CLOSED: throws MethodError on an unknown method", () => {
    expect(() => requireMethod("made-up-method")).toThrow(MethodError);
  });
});

describe("tdd-mandatory — test before/with code", () => {
  it("REJECTS code output with no corresponding test file", () => {
    const output: WorkerOutput = {
      files: [{ path: "api/lib/foo.ts", kind: "code" }],
      evidence: [{ type: "CODE", ref: "api/lib/foo.ts", date: "2026-01-01T00:00:00Z" }],
    };
    const result = verifyMethodCompliance("tdd-mandatory", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.map((v) => v.rule)).toContain("test-file-per-code");
  });

  it("REJECTS code committed before its test (test-after is not TDD)", () => {
    const output: WorkerOutput = {
      files: [
        { path: "api/lib/foo.ts", kind: "code" },
        { path: "api/__tests__/foo.test.ts", kind: "test" },
      ],
      evidence: [
        { type: "CODE", ref: "api/lib/foo.ts", date: "2026-01-01T09:00:00Z" },
        { type: "TEST", ref: "api/__tests__/foo.test.ts", date: "2026-01-01T10:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("tdd-mandatory", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("test-before-code");
  });

  it("ACCEPTS a test written before/with each code file", () => {
    const output: WorkerOutput = {
      files: [
        { path: "api/lib/foo.ts", kind: "code" },
        { path: "api/__tests__/foo.test.ts", kind: "test" },
      ],
      evidence: [
        { type: "TEST", ref: "api/__tests__/foo.test.ts", date: "2026-01-01T08:00:00Z" },
        { type: "CODE", ref: "api/lib/foo.ts", date: "2026-01-01T09:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("tdd-mandatory", output);
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe("subagent-driven — exclusive file ownership per scope", () => {
  it("REJECTS two scopes that own the same file", () => {
    const output: WorkerOutput = {
      scopes: [
        { id: "scope-a", files: ["api/lib/foo.ts", "api/lib/shared.ts"] },
        { id: "scope-b", files: ["api/lib/bar.ts", "api/lib/shared.ts"] },
      ],
    };
    const result = verifyMethodCompliance("subagent-driven", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain(
      "exclusive-file-ownership",
    );
    // the offending file is surfaced
    expect(result.violations.some((v) => v.message.includes("shared.ts"))).toBe(true);
  });

  it("ACCEPTS scopes with disjoint file ownership", () => {
    const output: WorkerOutput = {
      scopes: [
        { id: "scope-a", files: ["api/lib/foo.ts"] },
        { id: "scope-b", files: ["api/lib/bar.ts"] },
      ],
    };
    const result = verifyMethodCompliance("subagent-driven", output);
    expect(result.compliant).toBe(true);
  });
});

describe("root-cause-tracing — documented root cause before any fix", () => {
  it("REJECTS a fix with no documented root cause", () => {
    const output: WorkerOutput = {
      evidence: [{ type: "FIX", ref: "api/lib/foo.ts", date: "2026-01-02T00:00:00Z" }],
    };
    const result = verifyMethodCompliance("root-cause-tracing", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("root-cause-before-fix");
  });

  it("REJECTS a fix dated before its root-cause record", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "FIX", ref: "api/lib/foo.ts", date: "2026-01-02T08:00:00Z" },
        { type: "ROOT_CAUSE", ref: "diagnosis", date: "2026-01-02T09:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("root-cause-tracing", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("root-cause-before-fix");
  });

  it("ACCEPTS a fix that follows a documented root cause", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "ROOT_CAUSE", ref: "diagnosis", date: "2026-01-02T08:00:00Z" },
        { type: "FIX", ref: "api/lib/foo.ts", date: "2026-01-02T09:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("root-cause-tracing", output);
    expect(result.compliant).toBe(true);
  });
});

describe("adr — architectural decision carries a full ADR record", () => {
  it("REJECTS a decision with no ADR record", () => {
    const output: WorkerOutput = {
      evidence: [{ type: "DECISION", ref: "chose-postgres" }],
    };
    const result = verifyMethodCompliance("adr", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("adr-required");
  });

  it("REJECTS an ADR missing required fields (context/decision/consequences)", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "ADR", ref: "adr-001", context: "we need a db", decision: "", consequences: "" },
      ],
    };
    const result = verifyMethodCompliance("adr", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("adr-required");
  });

  it("ACCEPTS a complete ADR", () => {
    const output: WorkerOutput = {
      evidence: [
        {
          type: "ADR",
          ref: "adr-001",
          context: "we need durable storage",
          decision: "use postgres",
          consequences: "ops must run a db",
        },
      ],
    };
    const result = verifyMethodCompliance("adr", output);
    expect(result.compliant).toBe(true);
  });
});

describe("standard-git — disciplined worktrees + rebase + small PRs", () => {
  it("REJECTS an oversized PR", () => {
    const output: WorkerOutput = {
      pr: { changedLines: 5000, selfMerged: false },
      commitMessages: ["feat: x\n\nCo-authored-by: Copilot App <x@users.noreply.github.com>"],
    };
    const result = verifyMethodCompliance("standard-git", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("pr-size-limit");
  });

  it("REJECTS a commit missing Co-authored-by", () => {
    const output: WorkerOutput = {
      pr: { changedLines: 50, selfMerged: false },
      commitMessages: ["feat: x with no trailer"],
    };
    const result = verifyMethodCompliance("standard-git", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("commit-coauthor");
  });

  it("REJECTS a self-merge", () => {
    const output: WorkerOutput = {
      pr: { changedLines: 50, selfMerged: true },
      commitMessages: ["feat: x\n\nCo-authored-by: Copilot App <x@users.noreply.github.com>"],
    };
    const result = verifyMethodCompliance("standard-git", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("no-self-merge");
  });

  it("ACCEPTS a small, co-authored, non-self-merged PR", () => {
    const output: WorkerOutput = {
      pr: { changedLines: 120, selfMerged: false },
      commitMessages: ["feat: x\n\nCo-authored-by: Copilot App <x@users.noreply.github.com>"],
    };
    const result = verifyMethodCompliance("standard-git", output);
    expect(result.compliant).toBe(true);
  });
});

describe("verifyMethodCompliance REUSES Codex Guard (B1)", () => {
  it("turns a forbidden-label charter deviation in a worker file into a violation", () => {
    const output: WorkerOutput = {
      pr: { changedLines: 50, selfMerged: false },
      commitMessages: ["feat: x\n\nCo-authored-by: Copilot App <x@users.noreply.github.com>"],
      files: [
        {
          path: "api/lib/mind.ts",
          kind: "code",
          content: "export const engine = { consciousness: true };\n",
        },
      ],
    };
    const result = verifyMethodCompliance("standard-git", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("no-charter-deviations");
    expect(result.violations.some((v) => v.message.includes("mind.ts"))).toBe(true);
  });

  it("passes clean worker files through the guard without a violation", () => {
    const output: WorkerOutput = {
      pr: { changedLines: 50, selfMerged: false },
      commitMessages: ["feat: x\n\nCo-authored-by: Copilot App <x@users.noreply.github.com>"],
      files: [
        {
          path: "api/lib/clean.ts",
          kind: "code",
          content: "export const runtimeLoop = () => 42;\n",
        },
      ],
    };
    const result = verifyMethodCompliance("standard-git", output);
    expect(result.violations.map((v) => v.rule)).not.toContain("no-charter-deviations");
  });
});

describe("fail-closed — unknown method or missing input never silently accepted", () => {
  it("REJECTS an unknown method id", () => {
    const result = verifyMethodCompliance("totally-unknown", {});
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("unknown-method");
  });

  it("REJECTS a null/undefined output", () => {
    const result = verifyMethodCompliance(
      "tdd-mandatory",
      undefined as unknown as WorkerOutput,
    );
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("missing-input");
  });
});

describe("git-hygiene — clean up zombie git processes before worktree init", () => {
  it("ACCEPTS pending count within the safe limit (no remediation needed)", () => {
    const output: WorkerOutput = {
      gitOps: { pendingCount: 5 },
    };
    const result = verifyMethodCompliance("git-hygiene", output);
    expect(result.compliant).toBe(true);
  });

  it("REJECTS a pileup with no cleanup before init", () => {
    const output: WorkerOutput = {
      gitOps: { pendingCount: 30 },
    };
    const result = verifyMethodCompliance("git-hygiene", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("git-zombie-cleanup");
  });

  it("REJECTS name-based cleanup (must terminate by PID, not by name)", () => {
    const output: WorkerOutput = {
      gitOps: { pendingCount: 30, cleanup: { counted: true, byPid: false } },
    };
    const result = verifyMethodCompliance("git-hygiene", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("git-zombie-cleanup");
    expect(result.violations.some((v) => v.message.includes("PID"))).toBe(true);
  });

  it("REJECTS cleanup that did not count the pending processes first", () => {
    const output: WorkerOutput = {
      gitOps: { pendingCount: 30, cleanup: { counted: false, byPid: true } },
    };
    const result = verifyMethodCompliance("git-hygiene", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("git-zombie-cleanup");
  });

  it("ACCEPTS a pileup remediated by counting then killing by PID", () => {
    const output: WorkerOutput = {
      gitOps: { pendingCount: 30, cleanup: { counted: true, byPid: true } },
    };
    const result = verifyMethodCompliance("git-hygiene", output);
    expect(result.compliant).toBe(true);
  });
});

describe("push-early-often — push after every small work unit", () => {
  it("REJECTS a chain of unpushed local commits", () => {
    const output: WorkerOutput = {
      gitActivity: { unpushedCommits: 4, pushedAfterWorkUnit: false },
    };
    const result = verifyMethodCompliance("push-early-often", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain(
      "push-after-work-unit",
    );
  });

  it("REJECTS creating substantive files with no push after the work unit", () => {
    const output: WorkerOutput = {
      gitActivity: {
        unpushedCommits: 0,
        createdSubstantiveFiles: true,
        pushedAfterWorkUnit: false,
      },
    };
    const result = verifyMethodCompliance("push-early-often", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain(
      "push-after-work-unit",
    );
  });

  it("ACCEPTS work that is pushed after the unit with nothing unpushed", () => {
    const output: WorkerOutput = {
      gitActivity: {
        unpushedCommits: 0,
        createdSubstantiveFiles: true,
        pushedAfterWorkUnit: true,
      },
    };
    const result = verifyMethodCompliance("push-early-often", output);
    expect(result.compliant).toBe(true);
  });
});

describe("independent-bisect — isolate a silent break with git bisect on main", () => {
  it("REJECTS a diagnosis reached by guessing", () => {
    const output: WorkerOutput = {
      diagnosis: { method: "guess", culpritCommit: "abc123", ranOnMain: true },
    };
    const result = verifyMethodCompliance("independent-bisect", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain(
      "bisect-before-diagnosis",
    );
  });

  it("REJECTS a bisect that did not isolate a culprit commit", () => {
    const output: WorkerOutput = {
      diagnosis: { method: "bisect", culpritCommit: "", ranOnMain: true },
    };
    const result = verifyMethodCompliance("independent-bisect", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain(
      "bisect-before-diagnosis",
    );
  });

  it("REJECTS a bisect that was not run independently on main", () => {
    const output: WorkerOutput = {
      diagnosis: { method: "bisect", culpritCommit: "abc123", ranOnMain: false },
    };
    const result = verifyMethodCompliance("independent-bisect", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain(
      "bisect-before-diagnosis",
    );
  });

  it("ACCEPTS a bisect on main that isolated the breaking commit", () => {
    const output: WorkerOutput = {
      diagnosis: { method: "bisect", culpritCommit: "deadbeef", ranOnMain: true },
    };
    const result = verifyMethodCompliance("independent-bisect", output);
    expect(result.compliant).toBe(true);
  });
});

describe("fail-closed — the 3 operational methods reject on unknown/missing input", () => {
  it("rejects each new method under an unknown id typo (fail-closed)", () => {
    for (const bad of ["git-hygeine", "push-often", "bisect"]) {
      const result = verifyMethodCompliance(bad, {});
      expect(result.compliant).toBe(false);
      expect(result.violations.map((v) => v.rule)).toContain("unknown-method");
    }
  });

  it("rejects a null/undefined output for a new method", () => {
    const result = verifyMethodCompliance(
      "git-hygiene",
      undefined as unknown as WorkerOutput,
    );
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("missing-input");
  });
});

describe("methods-library tRPC router", () => {
  it("lists all methods over tRPC", async () => {
    const methods = await caller.methodsLibrary.list();
    expect(methods).toHaveLength(10);
    expect(methods.map((m) => m.id).sort()).toContain("tdd-mandatory");
  });

  it("gets one method with its rules over tRPC", async () => {
    const res = await caller.methodsLibrary.get({ id: "subagent-driven" });
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.method.rules.map((r) => r.kind)).toContain(
        "exclusive-file-ownership",
      );
    }
  });

  it("reports found:false for an unknown method (fail-closed)", async () => {
    const res = await caller.methodsLibrary.get({ id: "nope" });
    expect(res.found).toBe(false);
  });

  it("verifies compliance over tRPC and rejects a false TDD claim", async () => {
    const res = await caller.methodsLibrary.verify({
      method: "tdd-mandatory",
      output: {
        files: [{ path: "api/lib/foo.ts", kind: "code" }],
        evidence: [{ type: "CODE", ref: "api/lib/foo.ts", date: "2026-01-01T00:00:00Z" }],
      },
    });
    expect(res.compliant).toBe(false);
    expect(res.violations.length).toBeGreaterThan(0);
  });
});

describe("code-review — REVIEW evidence must precede MERGE (K4)", () => {
  it("REJECTS a merge with no review evidence at all", () => {
    const output: WorkerOutput = {
      evidence: [{ type: "MERGE", ref: "pr-9", date: "2026-07-12T10:00:00Z" }],
    };
    const result = verifyMethodCompliance("code-review", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("review-before-merge");
  });

  it("REJECTS a review dated AFTER the merge (retroactive rubber-stamp)", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "MERGE", ref: "pr-9", date: "2026-07-12T10:00:00Z" },
        { type: "REVIEW", ref: "pr-9", date: "2026-07-12T11:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("code-review", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("review-before-merge");
  });

  it("ACCEPTS a dated review at/before the merge", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "REVIEW", ref: "pr-9", date: "2026-07-12T09:00:00Z" },
        { type: "MERGE", ref: "pr-9", date: "2026-07-12T10:00:00Z" },
      ],
    };
    expect(verifyMethodCompliance("code-review", output).compliant).toBe(true);
  });

  it("ACCEPTS output with no merge at all (nothing to gate)", () => {
    const output: WorkerOutput = {
      evidence: [{ type: "CODE", ref: "api/x.ts", date: "2026-07-12T08:00:00Z" }],
    };
    expect(verifyMethodCompliance("code-review", output).compliant).toBe(true);
  });
});

describe("test-fixing — reproduce first, fix the code not the test (K4)", () => {
  it("REJECTS a fix with no failing-run reproduction evidence", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "TEST", ref: "api/__tests__/x.test.ts", date: "2026-07-12T09:00:00Z" },
        { type: "FIX", ref: "api/x.ts", date: "2026-07-12T10:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("test-fixing", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("repro-before-fix");
  });

  it("REJECTS a reproduction dated AFTER the fix", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "RUN", ref: "repro", date: "2026-07-12T11:00:00Z" },
        { type: "TEST", ref: "api/__tests__/x.test.ts", date: "2026-07-12T09:00:00Z" },
        { type: "FIX", ref: "api/x.ts", date: "2026-07-12T10:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("test-fixing", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("repro-before-fix");
  });

  it("REJECTS a fix carrying no regression test evidence", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "RUN", ref: "repro", date: "2026-07-12T09:00:00Z" },
        { type: "FIX", ref: "api/x.ts", date: "2026-07-12T10:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("test-fixing", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("regression-test-with-fix");
  });

  it("ACCEPTS repro run + regression test + fix in honest order", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "RUN", ref: "repro", date: "2026-07-12T08:00:00Z" },
        { type: "TEST", ref: "api/__tests__/x.test.ts", date: "2026-07-12T09:00:00Z" },
        { type: "FIX", ref: "api/x.ts", date: "2026-07-12T10:00:00Z" },
      ],
    };
    expect(verifyMethodCompliance("test-fixing", output).compliant).toBe(true);
  });

  it("ACCEPTS output with no fix at all (nothing to gate)", () => {
    const output: WorkerOutput = {
      evidence: [{ type: "CODE", ref: "api/x.ts", date: "2026-07-12T08:00:00Z" }],
    };
    expect(verifyMethodCompliance("test-fixing", output).compliant).toBe(true);
  });
});

describe("hollow evidence & per-ref matching — anti-self-certification (K4)", () => {
  it("REJECTS a hollow output ({}) — self-certification without proof", () => {
    const result = verifyMethodCompliance("code-review", {});
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("missing-input");
  });

  it("REJECTS an output whose collections are all empty (no substantive artifact)", () => {
    const result = verifyMethodCompliance("test-fixing", {
      evidence: [],
      files: [],
    });
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("missing-input");
  });

  it("REJECTS a review of ONE ref used to license merging ANOTHER (per-ref)", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "REVIEW", ref: "pr-1", date: "2026-07-12T09:00:00Z" },
        { type: "MERGE", ref: "pr-2", date: "2026-07-12T10:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("code-review", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("review-before-merge");
  });

  it("REJECTS when only SOME merged refs carry their own prior review", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "REVIEW", ref: "pr-1", date: "2026-07-12T09:00:00Z" },
        { type: "MERGE", ref: "pr-1", date: "2026-07-12T10:00:00Z" },
        { type: "MERGE", ref: "pr-2", date: "2026-07-12T10:30:00Z" },
      ],
    };
    expect(verifyMethodCompliance("code-review", output).compliant).toBe(false);
  });

  it("REJECTS an undated MERGE (ordering unprovable → fail-closed)", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "REVIEW", ref: "pr-1", date: "2026-07-12T09:00:00Z" },
        { type: "MERGE", ref: "pr-1" },
      ],
    };
    expect(verifyMethodCompliance("code-review", output).compliant).toBe(false);
  });

  it("REJECTS a FIX dated before ANY reproduction RUN even when another FIX is covered", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "FIX", ref: "api/a.ts", date: "2026-07-12T10:00:00Z" },
        { type: "RUN", ref: "repro", date: "2026-07-12T11:00:00Z" },
        { type: "TEST", ref: "api/__tests__/a.test.ts", date: "2026-07-12T09:00:00Z" },
        { type: "FIX", ref: "api/b.ts", date: "2026-07-12T12:00:00Z" },
      ],
    };
    const result = verifyMethodCompliance("test-fixing", output);
    expect(result.compliant).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("repro-before-fix");
  });

  it("ACCEPTS multiple merges when EACH ref has its own dated prior review", () => {
    const output: WorkerOutput = {
      evidence: [
        { type: "REVIEW", ref: "pr-1", date: "2026-07-12T09:00:00Z" },
        { type: "MERGE", ref: "pr-1", date: "2026-07-12T10:00:00Z" },
        { type: "REVIEW", ref: "pr-2", date: "2026-07-12T10:15:00Z" },
        { type: "MERGE", ref: "pr-2", date: "2026-07-12T10:30:00Z" },
      ],
    };
    expect(verifyMethodCompliance("code-review", output).compliant).toBe(true);
  });
});

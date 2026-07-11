// ============================================================
// B3 CONSTITUTION RUNTIME — UNIT TESTS
// Proves the three fail-closed services:
//   • Authority Gate: A0–A5 ladder, no auto-grant above A2, and a
//     tamper-evident hash-chain audit log (tampering IS detected).
//   • CCMR: deterministic classification into root/constitution/owner/
//     evidence with justification.
//   • CEvP: fail-closed power-preservation — uncertainty is rejected.
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import {
  AuthorityGate,
  GENESIS_HASH,
  authorityRank,
  decideAuthority,
  type AuthorityRecord,
} from "../lib/authority-gate";
import { classify, classifyMany } from "../lib/ccmr";
import { evaluateChange, type PowerMeasure } from "../lib/cevp-guard";
import { appRouter } from "../router";
import { authorityGate } from "../lib/authority-gate";

const caller = appRouter.createCaller({} as never);

// ---------------------------------------------------------------------------
// Authority Gate — ladder + fail-closed
// ---------------------------------------------------------------------------

describe("Authority Gate — ladder decisions (fail-closed)", () => {
  it("auto-grants at or below the A2 ceiling", () => {
    for (const level of ["A0", "A1", "A2"] as const) {
      const d = decideAuthority({ subject: "agent", action: "x", requested: level });
      expect(d.decision).toBe("GRANTED");
    }
  });

  it("DENIES A3+ without any owner approval", () => {
    for (const level of ["A3", "A4", "A5"] as const) {
      const d = decideAuthority({ subject: "agent", action: "x", requested: level });
      expect(d.decision).toBe("DENIED");
    }
  });

  it("GRANTS A3+ only with an explicit owner approval that reaches the level", () => {
    const ok = decideAuthority({
      subject: "agent",
      action: "wire funds",
      requested: "A3",
      ownerApproval: { approver: "founder", grantedLevel: "A3" },
    });
    expect(ok.decision).toBe("GRANTED");

    // Approval below the requested level is not enough → denied.
    const short = decideAuthority({
      subject: "agent",
      action: "amend charter",
      requested: "A5",
      ownerApproval: { approver: "founder", grantedLevel: "A3" },
    });
    expect(short.decision).toBe("DENIED");
  });

  it("fails CLOSED on malformed input (unknown level, empty subject, empty approver)", () => {
    // @ts-expect-error — intentionally invalid level
    expect(decideAuthority({ subject: "a", action: "x", requested: "A9" }).decision).toBe("DENIED");
    expect(decideAuthority({ subject: "", action: "x", requested: "A0" }).decision).toBe("DENIED");
    expect(
      decideAuthority({
        subject: "a",
        action: "x",
        requested: "A3",
        ownerApproval: { approver: "  ", grantedLevel: "A3" },
      }).decision,
    ).toBe("DENIED");
  });

  it("ranks levels strictly A0 < A1 < ... < A5", () => {
    expect(authorityRank("A0")).toBeLessThan(authorityRank("A1"));
    expect(authorityRank("A2")).toBeLessThan(authorityRank("A3"));
    expect(authorityRank("A4")).toBeLessThan(authorityRank("A5"));
  });
});

// ---------------------------------------------------------------------------
// Authority Gate — hash-chain audit log
// ---------------------------------------------------------------------------

describe("Authority Gate — tamper-evident hash-chain", () => {
  it("links every record to the previous hash, genesis first", () => {
    const gate = new AuthorityGate();
    gate.request({ subject: "a", action: "read", requested: "A0" });
    gate.request({ subject: "a", action: "act", requested: "A2" });
    gate.request({ subject: "a", action: "spend", requested: "A3" });

    const chain = gate.exportChain();
    expect(chain).toHaveLength(3);
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(chain[1].prevHash).toBe(chain[0].hash);
    expect(chain[2].prevHash).toBe(chain[1].hash);
  });

  it("verifyChain reports valid for an untouched chain", () => {
    const gate = new AuthorityGate();
    gate.request({ subject: "a", action: "read", requested: "A0" });
    gate.request({ subject: "a", action: "act", requested: "A1" });
    const v = gate.verifyChain();
    expect(v.valid).toBe(true);
    expect(v.brokenAt).toBeNull();
  });

  it("DETECTS tampering when a past record's field is edited", () => {
    const gate = new AuthorityGate();
    gate.request({ subject: "a", action: "read", requested: "A0" });
    gate.request({ subject: "a", action: "spend", requested: "A3" }); // DENIED

    const tampered: AuthorityRecord[] = gate.exportChain();
    // Attacker rewrites history: flip the denied escalation to GRANTED.
    tampered[1].decision = "GRANTED";
    tampered[1].requested = "A5";

    const v = gate.verifyChain(tampered);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(1);
  });

  it("DETECTS a broken prevHash link (record surgically removed)", () => {
    const gate = new AuthorityGate();
    gate.request({ subject: "a", action: "read", requested: "A0" });
    gate.request({ subject: "a", action: "act", requested: "A1" });
    gate.request({ subject: "a", action: "act2", requested: "A2" });

    const spliced = gate.exportChain().filter((r) => r.seq !== 1);
    const v = gate.verifyChain(spliced);
    expect(v.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CCMR — deterministic classification
// ---------------------------------------------------------------------------

describe("CCMR — classify into root/constitution/owner/evidence", () => {
  it("uses an explicit kind authoritatively", () => {
    expect(classify({ id: "1", kind: "mission", text: "our mission" }).class).toBe("ROOT");
    expect(classify({ id: "2", kind: "principle", text: "amanah" }).class).toBe("CONSTITUTION");
    expect(classify({ id: "3", kind: "role", text: "owner of X" }).class).toBe("OWNER");
    expect(classify({ id: "4", kind: "test", text: "vitest" }).class).toBe("EVIDENCE");
  });

  it("classifies by keyword signals when no kind is declared, with justification", () => {
    const c = classify({ id: "p", text: "This is a governance policy and charter clause." });
    expect(c.class).toBe("CONSTITUTION");
    expect(c.signals.length).toBeGreaterThan(0);
    expect(c.reason).toContain("دستور");
  });

  it("recognises Arabic signals", () => {
    expect(classify({ id: "ar1", text: "هذه رسالتنا وغايتنا الجذر" }).class).toBe("ROOT");
    expect(classify({ id: "ar2", text: "دليل واختبار وتشغيل بمخرجات" }).class).toBe("EVIDENCE");
  });

  it("falls back to EVIDENCE (least privilege) when there is no signal", () => {
    const c = classify({ id: "blank", text: "xyzzy 12345" });
    expect(c.class).toBe("EVIDENCE");
    expect(c.confidence).toBe(0);
  });

  it("is deterministic — same input yields identical output", () => {
    const asset = { id: "d", text: "constitutional charter principle rule" };
    expect(classify(asset)).toEqual(classify(asset));
  });

  it("classifyMany maps every asset", () => {
    const res = classifyMany([
      { id: "1", kind: "mission" },
      { id: "2", kind: "test" },
    ]);
    expect(res.map((r) => r.class)).toEqual(["ROOT", "EVIDENCE"]);
  });
});

// ---------------------------------------------------------------------------
// CEvP — fail-closed power preservation
// ---------------------------------------------------------------------------

const M = (m: Partial<PowerMeasure> = {}): PowerMeasure => ({
  capability: 0.5,
  coverage: 0.5,
  integrity: 0.5,
  reversibility: 0.5,
  ...m,
});

describe("CEvP — preserve power or reject (fail-closed)", () => {
  it("ACCEPTS a proven, non-contracting improvement", () => {
    const r = evaluateChange({
      id: "c1",
      before: M(),
      after: M({ capability: 0.7, coverage: 0.6 }),
      proof: [{ kind: "test", ref: "vitest run" }],
    });
    expect(r.decision).toBe("ACCEPT");
    expect(r.verdict).toBe("PRESERVES");
  });

  it("REJECTS when a critical dimension regresses, even with net gain", () => {
    const r = evaluateChange({
      id: "c2",
      before: M(),
      after: M({ capability: 0.99, integrity: 0.4 }), // integrity drops
      proof: [{ kind: "test", ref: "x" }],
    });
    expect(r.decision).toBe("REJECT");
    expect(r.verdict).toBe("CONTRACTS");
    expect(r.regressions).toContain("integrity");
  });

  it("REJECTS a net-negative change", () => {
    const r = evaluateChange({
      id: "c3",
      before: M(),
      after: M({ capability: 0.2, coverage: 0.2 }),
      proof: [{ kind: "test", ref: "x" }],
    });
    expect(r.decision).toBe("REJECT");
    expect(r.netDelta).toBeLessThan(0);
  });

  it("fails CLOSED when no proof is supplied", () => {
    const r = evaluateChange({ id: "c4", before: M(), after: M({ capability: 0.9 }) });
    expect(r.decision).toBe("REJECT");
    expect(r.verdict).toBe("INDETERMINATE");
  });

  it("fails CLOSED on malformed / out-of-range measures", () => {
    const r = evaluateChange({
      id: "c5",
      before: M({ integrity: 5 }),
      after: M(),
      proof: [{ kind: "test", ref: "x" }],
    });
    expect(r.decision).toBe("REJECT");
    expect(r.verdict).toBe("INDETERMINATE");
  });
});

// ---------------------------------------------------------------------------
// tRPC surface
// ---------------------------------------------------------------------------

describe("authority tRPC surface", () => {
  beforeEach(() => {
    authorityGate.reset();
  });

  it("ladder exposes A0–A5 with an A2 auto-grant ceiling", async () => {
    const l = await caller.authority.ladder();
    expect(l.levels).toEqual(["A0", "A1", "A2", "A3", "A4", "A5"]);
    expect(l.autoGrantCeiling).toBe("A2");
  });

  it("requestAuthority records to the chain and chain verifies", async () => {
    await caller.authority.requestAuthority({ subject: "s", action: "read", requested: "A0" });
    const denied = await caller.authority.requestAuthority({
      subject: "s",
      action: "spend",
      requested: "A3",
    });
    expect(denied.decision).toBe("DENIED");

    const chain = await caller.authority.chain();
    expect(chain.length).toBe(2);
    expect(chain.verification.valid).toBe(true);
  });

  it("classify + evaluateChange are reachable over tRPC", async () => {
    const c = await caller.authority.classify({ asset: { id: "1", kind: "principle" } });
    expect(c.class).toBe("CONSTITUTION");

    const e = await caller.authority.evaluateChange({
      change: { id: "x", before: M(), after: M({ capability: 0.6 }), proof: [{ kind: "test", ref: "r" }] },
    });
    expect(e.decision).toBe("ACCEPT");
  });

  it("govern composes CCMR + CEvP + gate; a contracting change is refused escalation", async () => {
    const res = await caller.authority.govern({
      asset: { id: "a", kind: "policy" },
      change: {
        id: "chg",
        before: M(),
        after: M({ integrity: 0.1 }), // contraction
        proof: [{ kind: "test", ref: "r" }],
      },
      request: { subject: "agent", action: "escalate", requested: "A5" },
    });
    expect(res.classification.class).toBe("CONSTITUTION");
    expect(res.evaluation.decision).toBe("REJECT");
    // Escalation refused: gated down to A0 and approved:false.
    expect(res.authority.requested).toBe("A0");
    expect(res.approved).toBe(false);
  });
});

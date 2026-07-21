// ============================================================
// SECH GATE — UNIT TESTS (C-1)
// Proves the governance gate is fail-closed / deny-by-default:
// non-compliant requests are rejected, not silently approved.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  evaluateSech,
  AMANAH_FLOOR,
  ESCALATION_CEILING,
} from "../lib/sech-gate";

describe("SECH gate — deny-by-default", () => {
  it("DENIES an anonymous request (no identity)", () => {
    const r = evaluateSech({ path: "x.op", amanahScore: 0.99, shadowTrusted: true });
    expect(r.decision).toBe("DENY");
    expect(r.allowed).toBe(false);
    expect(r.reasonCode).toBe("NO_IDENTITY");
  });

  it('DENIES the literal "anonymous" principal', () => {
    const r = evaluateSech({ path: "x.op", userId: "anonymous", amanahScore: 0.99, shadowTrusted: true });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("NO_IDENTITY");
  });

  it("DENIES when the audit score is missing (fail-closed)", () => {
    const r = evaluateSech({ path: "x.op", userId: "u1", shadowTrusted: true });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("NO_AUDIT");
  });

  it("DENIES when the audit score is NaN (fail-closed)", () => {
    const r = evaluateSech({ path: "x.op", userId: "u1", amanahScore: NaN, shadowTrusted: true });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("NO_AUDIT");
  });

  it("DENIES a request below the Amanah floor", () => {
    const r = evaluateSech({ path: "x.op", userId: "u1", amanahScore: AMANAH_FLOOR - 0.01, shadowTrusted: true });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("BELOW_AMANAH_FLOOR");
  });

  it("ESCALATES (does not allow) a score in the review band", () => {
    const mid = (AMANAH_FLOOR + ESCALATION_CEILING) / 2;
    const r = evaluateSech({ path: "x.op", userId: "u1", amanahScore: mid, shadowTrusted: true });
    expect(r.decision).toBe("ESCALATE");
    expect(r.allowed).toBe(false);
  });

  it("ESCALATES when provenance is unverified even above the ceiling", () => {
    const r = evaluateSech({ path: "x.op", userId: "u1", amanahScore: 0.95, shadowTrusted: false });
    expect(r.decision).toBe("ESCALATE");
    expect(r.reasonCode).toBe("UNVERIFIED_SHADOW");
    expect(r.allowed).toBe(false);
  });

  it("ALLOWS only a fully compliant, verified, high-trust request", () => {
    const r = evaluateSech({ path: "x.op", userId: "u1", role: "user", amanahScore: 0.85, shadowTrusted: true });
    expect(r.decision).toBe("ALLOW");
    expect(r.allowed).toBe(true);
    expect(r.level).toBe("GREEN");
  });

  it("ALLOWS a verified bridge machine above the floor", () => {
    const r = evaluateSech({ path: "x.op", bridgeMachine: true, amanahScore: 0.6 });
    expect(r.decision).toBe("ALLOW");
    expect(r.reasonCode).toBe("BRIDGE_TRUSTED");
  });

  it("DENIES a bridge machine below the floor", () => {
    const r = evaluateSech({ path: "x.op", bridgeMachine: true, amanahScore: 0.1 });
    expect(r.decision).toBe("DENY");
    expect(r.reasonCode).toBe("BELOW_AMANAH_FLOOR");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  ZeroInputEngine,
  ZeroInputError,
  SUGGESTION_CEILING,
  signalFromContradiction,
  signalFromJudgment,
  signalFromEventPattern,
  classifyStatus,
  type Signal,
  type Provenance,
} from "../lib/zero-input";
import { AuthorityGate } from "../lib/authority-gate";
import { runRealityPipeline, type RawInput } from "../lib/reality-engine";
import {
  createIntelligenceObject,
  setContext,
  addSource,
  addClaim,
  addEvidence,
  addHypothesis,
  assessUncertainty,
  renderJudgment,
} from "../lib/intelligence-object";

const prov = (confidence = 0.9, source = "zero-input-test"): Provenance => ({
  source,
  method: "deterministic",
  recordedAt: "2026-07-12T00:00:00.000Z",
  confidence,
});

const signal = (over: Partial<Signal> = {}): Signal => ({
  id: "sig-1",
  kind: "CONTRADICTION",
  summary: "تعارض تجريبي",
  salience: 0.8,
  proposedAction: "راجع التعارض",
  requiredAuthority: "A1",
  provenance: prov(),
  ...over,
});

describe("B7 Zero-Input — constrained autonomy ceiling", () => {
  it("caps the generator at A1 (proposal), never higher", () => {
    expect(SUGGESTION_CEILING).toBe("A1");
  });

  it("classifies A0/A1 as auto-eligible proposals", () => {
    expect(classifyStatus("A0")).toBe("AUTO_ELIGIBLE");
    expect(classifyStatus("A1")).toBe("AUTO_ELIGIBLE");
  });

  it("classifies anything above A1 as REQUIRES_APPROVAL (fail-closed, never auto)", () => {
    expect(classifyStatus("A2")).toBe("REQUIRES_APPROVAL");
    expect(classifyStatus("A3")).toBe("REQUIRES_APPROVAL");
    expect(classifyStatus("A5")).toBe("REQUIRES_APPROVAL");
  });
});

describe("B7 Zero-Input — suggestion generation via real AuthorityGate (B3)", () => {
  let eng: ZeroInputEngine;
  beforeEach(() => {
    eng = new ZeroInputEngine();
  });

  it("emits an A1 suggestion as GRANTED + AUTO_ELIGIBLE and persists it with provenance", async () => {
    const [s] = await eng.generate([signal({ requiredAuthority: "A1" })]);
    expect(s.status).toBe("AUTO_ELIGIBLE");
    expect(s.decision).toBe("GRANTED");
    expect(s.autoExecutable).toBe(false); // proposal only — B7 never executes
    const exp = await eng.export();
    expect(exp.records[0].provenance.source).toBe("zero-input-test");
  });

  it("marks an A2 suggestion REQUIRES_APPROVAL and blocks auto-execution", async () => {
    const [s] = await eng.generate([signal({ id: "sig-2", requiredAuthority: "A2" })]);
    expect(s.status).toBe("REQUIRES_APPROVAL");
    expect(s.autoExecutable).toBe(false);
  });

  it("denies an above-A2 suggestion at the gate (no owner approval) — still REQUIRES_APPROVAL", async () => {
    const [s] = await eng.generate([signal({ id: "sig-3", requiredAuthority: "A4" })]);
    expect(s.decision).toBe("DENIED");
    expect(s.status).toBe("REQUIRES_APPROVAL");
    expect(s.autoExecutable).toBe(false);
  });

  it("appends every decision to the tamper-evident authority chain", async () => {
    const gate = new AuthorityGate();
    const e2 = new ZeroInputEngine({ gate });
    await e2.generate([
      signal({ id: "a", requiredAuthority: "A1" }),
      signal({ id: "b", requiredAuthority: "A2" }),
    ]);
    expect(gate.length).toBe(2);
    expect(gate.verifyChain().valid).toBe(true);
  });

  it("derives confidence deterministically from salience × provenance confidence", async () => {
    const [s] = await eng.generate([
      signal({ id: "c1", salience: 0.5, provenance: prov(0.8) }),
    ]);
    expect(s.confidence).toBeCloseTo(0.4, 5);
  });

  it("is deterministic across runs", async () => {
    const a = new ZeroInputEngine();
    const b = new ZeroInputEngine();
    const sigs = [signal({ id: "x", requiredAuthority: "A1" })];
    const ra = await a.generate(sigs);
    const rb = await b.generate(sigs);
    expect(ra.map((s) => ({ ...s, provenance: null }))).toEqual(
      rb.map((s) => ({ ...s, provenance: null })),
    );
  });
});

describe("B7 Zero-Input — fail-closed validation", () => {
  let eng: ZeroInputEngine;
  beforeEach(() => {
    eng = new ZeroInputEngine();
  });

  it("rejects a non-array signal batch", async () => {
    // @ts-expect-error deliberate bad input
    await expect(eng.generate(null)).rejects.toThrow(/NOT_ARRAY/);
  });

  it("rejects a signal without an id", async () => {
    await expect(
      eng.generate([signal({ id: "" })]),
    ).rejects.toThrow(/MISSING_ID/);
  });

  it("rejects a signal without a proposed action", async () => {
    await expect(
      eng.generate([signal({ id: "s", proposedAction: "  " })]),
    ).rejects.toThrow(/MISSING_ACTION/);
  });

  it("rejects an unknown authority level", async () => {
    await expect(
      // @ts-expect-error deliberate bad level
      eng.generate([signal({ id: "s", requiredAuthority: "A9" })]),
    ).rejects.toThrow(/BAD_AUTHORITY/);
  });

  it("rejects a signal with missing provenance", async () => {
    await expect(
      // @ts-expect-error deliberate bad provenance
      eng.generate([signal({ id: "s", provenance: undefined })]),
    ).rejects.toThrow(/BAD_PROVENANCE/);
  });

  it("rejects salience out of [0,1]", async () => {
    await expect(
      eng.generate([signal({ id: "s", salience: 2 })]),
    ).rejects.toThrow(/BAD_SALIENCE/);
  });
});

describe("B7 Zero-Input — adapters over merged layers (integration, not duplication)", () => {
  it("turns a B5 UNRESOLVED contradiction into an approval-gated signal", () => {
    const inputs: RawInput[] = [
      { id: "s1", triple: { subject: "Paris", predicate: "capital-of", object: "France" }, provenance: prov(0.7) },
      { id: "s2", triple: { subject: "Paris", predicate: "capital-of", object: "Germany" }, provenance: prov(0.7) },
    ];
    const report = runRealityPipeline(inputs);
    const sig = signalFromContradiction(report.contradictions[0], prov());
    expect(sig.kind).toBe("CONTRADICTION");
    // unresolved conflict cannot be auto-adopted → needs human authority
    expect(sig.requiredAuthority).toBe("A2");
    expect(sig.summary).toContain("Paris");
  });

  it("turns a B5 confidence-resolved contradiction into an A1 adopt-preferred signal", () => {
    const inputs: RawInput[] = [
      { id: "s1", triple: { subject: "Paris", predicate: "capital-of", object: "France" }, provenance: prov(0.95) },
      { id: "s2", triple: { subject: "Paris", predicate: "capital-of", object: "Germany" }, provenance: prov(0.3) },
    ];
    const report = runRealityPipeline(inputs);
    const sig = signalFromContradiction(report.contradictions[0], prov());
    expect(sig.requiredAuthority).toBe("A1");
  });

  it("turns a B4 SUPPORTED judgment into an A1 act suggestion", () => {
    let io = createIntelligenceObject("io-1", "هل الادعاء صحيح؟");
    io = setContext(io, "سياق الاختبار");
    io = addSource(io, { id: "src-1", label: "مصدر", reliability: 1 });
    io = addClaim(io, { id: "cl-1", text: "الادعاء" });
    io = addEvidence(io, { id: "ev-1", claimId: "cl-1", stance: "SUPPORTING", weight: 0.9, sourceId: "src-1" });
    io = addHypothesis(io, { id: "hy-1", text: "الفرضية" });
    io = assessUncertainty(io);
    io = renderJudgment(io);
    expect(io.judgment?.verdict).toBe("SUPPORTED");
    const sig = signalFromJudgment(io, prov());
    expect(sig.kind).toBe("JUDGMENT");
    expect(sig.requiredAuthority).toBe("A1");
  });

  it("turns a low-frequency B8 event pattern into an A1 observation and a high-frequency one into A2", () => {
    const low = signalFromEventPattern({ eventType: "login", count: 2, threshold: 10 }, prov());
    expect(low.requiredAuthority).toBe("A1");
    const high = signalFromEventPattern({ eventType: "login", count: 50, threshold: 10 }, prov());
    expect(high.requiredAuthority).toBe("A2");
  });
});

describe("B7 Zero-Input — meta-metrics (deterministic, replayable)", () => {
  let eng: ZeroInputEngine;
  beforeEach(async () => {
    eng = new ZeroInputEngine();
    await eng.generate([
      signal({ id: "m1", salience: 0.9, requiredAuthority: "A1" }),
      signal({ id: "m2", salience: 0.8, requiredAuthority: "A1" }),
      signal({ id: "m3", salience: 0.3, requiredAuthority: "A1" }),
      signal({ id: "m4", salience: 0.2, requiredAuthority: "A1" }),
    ]);
  });

  it("computes accuracy from recorded accept/reject feedback", async () => {
    await eng.recordFeedback("sug-m1", true, prov());
    await eng.recordFeedback("sug-m2", true, prov());
    await eng.recordFeedback("sug-m3", false, prov());
    const m = eng.metrics();
    expect(m.total).toBe(4);
    expect(m.feedbackCount).toBe(3);
    expect(m.accuracy).toBeCloseTo(2 / 3, 5);
  });

  it("reports zero accuracy (not NaN) when there is no feedback yet", () => {
    const m = eng.metrics();
    expect(m.accuracy).toBe(0);
    expect(m.feedbackCount).toBe(0);
  });

  it("buckets confidence calibration (high-confidence accepted vs low rejected)", async () => {
    await eng.recordFeedback("sug-m1", true, prov()); // high conf, accepted
    await eng.recordFeedback("sug-m4", false, prov()); // low conf, rejected
    const m = eng.metrics();
    const high = m.calibration.find((c) => c.bucket === "HIGH");
    const low = m.calibration.find((c) => c.bucket === "LOW");
    expect(high?.acceptRate).toBe(1);
    expect(low?.acceptRate).toBe(0);
  });

  it("measures acceptance drift between first and second feedback halves", async () => {
    // first half accepted, second half rejected → negative drift
    await eng.recordFeedback("sug-m1", true, prov());
    await eng.recordFeedback("sug-m2", true, prov());
    await eng.recordFeedback("sug-m3", false, prov());
    await eng.recordFeedback("sug-m4", false, prov());
    const m = eng.metrics();
    expect(m.drift).toBeCloseTo(-1, 5);
  });

  it("fails closed on feedback for an unknown suggestion", async () => {
    await expect(eng.recordFeedback("nope", true, prov())).rejects.toThrow(
      /SUGGESTION_NOT_FOUND/,
    );
  });

  it("rejects duplicate feedback for the same suggestion", async () => {
    await eng.recordFeedback("sug-m1", true, prov());
    await expect(eng.recordFeedback("sug-m1", false, prov())).rejects.toThrow(
      /DUPLICATE_FEEDBACK/,
    );
  });

  it("exports a full audit (suggestions + feedback) via the B4 MemoryStore", async () => {
    await eng.recordFeedback("sug-m1", true, prov());
    const exp = await eng.export();
    // 4 suggestions + 1 feedback record
    expect(exp.count).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
// INTELLIGENCE OBJECT — lifecycle + router tests (B4)
//
// Proves the deterministic reasoning lifecycle:
//   • the full 11-stage walk QUESTION → … → LEARNING with explicit,
//     verified transitions and a reproducible history
//   • fail-closed refusal of every out-of-order transition and every
//     malformed input (no source, unknown claim/source, bad ranges)
//   • deterministic uncertainty + judgment from the evidence balance
//   • linking EXISTING insights (insight-*) to a reasoning object
//   • the tRPC surface (create → advance → get) and its BAD_REQUEST
//     fail-closed mapping, plus insight linking against the live feed
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LIFECYCLE_STAGES,
  createIntelligenceObject,
  setContext,
  addSource,
  addClaim,
  addEvidence,
  addHypothesis,
  assessUncertainty,
  renderJudgment,
  setPlan,
  recordOutcome,
  learn,
  linkInsight,
  tallyEvidence,
  isComplete,
  stageIndex,
  LifecycleError,
  type IntelligenceObject,
} from "../lib/intelligence-object";
import { appRouter } from "../router";
import { __resetIntelligenceObjectsForTests } from "../intelligence-object-router";
import {
  __setInsightsListFnForTests,
  __resetInsightsPortForTests,
} from "../lib/insights-port";

/** Drive an object all the way to a SUPPORTED judgment, deterministically. */
function walkToJudgment(): IntelligenceObject {
  let o = createIntelligenceObject("io-1", "هل المنهج فعّال؟");
  o = setContext(o, "تقييم منهجية جديدة");
  o = addSource(o, { id: "src-a", label: "دراسة أولى", reliability: 0.9 });
  o = addSource(o, { id: "src-b", label: "دراسة ثانية", reliability: 0.8 });
  o = addClaim(o, { id: "c1", text: "المنهج يرفع الإنتاجية" });
  o = addEvidence(o, { id: "e1", claimId: "c1", stance: "SUPPORTING", weight: 0.9, sourceId: "src-a" });
  o = addEvidence(o, { id: "e2", claimId: "c1", stance: "SUPPORTING", weight: 0.7, sourceId: "src-b" });
  o = addEvidence(o, { id: "e3", claimId: "c1", stance: "OPPOSING", weight: 0.2, sourceId: "src-b" });
  o = addHypothesis(o, { id: "h1", text: "المنهج يفوق الأساس" });
  o = assessUncertainty(o);
  o = renderJudgment(o);
  return o;
}

describe("intelligence object — full lifecycle transitions", () => {
  it("declares the 11 canonical stages in order", () => {
    expect([...LIFECYCLE_STAGES]).toEqual([
      "QUESTION", "CONTEXT", "SOURCES", "CLAIMS", "EVIDENCE",
      "HYPOTHESES", "UNCERTAINTY", "JUDGMENT", "PLAN", "OUTCOME", "LEARNING",
    ]);
    expect(stageIndex("QUESTION")).toBe(0);
    expect(stageIndex("LEARNING")).toBe(10);
  });

  it("walks every stage from QUESTION to LEARNING with a reproducible history", () => {
    let o = walkToJudgment();
    o = setPlan(o, ["اعتمد المنهج", "قِس النتائج بعد شهر"]);
    o = recordOutcome(o, { success: true, note: "ارتفعت الإنتاجية 12%" });
    o = learn(o, "المنهج فعّال في هذا السياق");

    expect(isComplete(o)).toBe(true);
    expect(o.stage).toBe("LEARNING");
    // Each advancing transition is recorded once, in order.
    const visited = ["QUESTION", ...o.history.map((h) => h.to)];
    expect(visited).toEqual([...LIFECYCLE_STAGES]);
    // Deterministic monotonic sequence.
    expect(o.history.map((h) => h.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("computes a deterministic SUPPORTED verdict from the evidence balance", () => {
    const o = walkToJudgment();
    const tally = tallyEvidence(o);
    // src-a 0.9*0.9 + src-b 0.7*0.8 = 0.81 + 0.56 = 1.37 supporting; 0.2*0.8 = 0.16 opposing
    expect(tally).toEqual({ supporting: 1.37, opposing: 0.16 });
    expect(o.uncertainty?.band).toBe("LOW");
    expect(o.judgment?.verdict).toBe("SUPPORTED");
    expect(o.judgment?.confidence).toBeGreaterThan(0.5);
  });

  it("is deterministic: identical inputs yield identical judgments", () => {
    const a = walkToJudgment();
    const b = walkToJudgment();
    expect(a.judgment).toEqual(b.judgment);
    expect(a.uncertainty).toEqual(b.uncertainty);
  });

  it("renders INCONCLUSIVE with high uncertainty when evidence is balanced", () => {
    let o = createIntelligenceObject("io-bal", "سؤال متوازن");
    o = setContext(o, "سياق");
    o = addSource(o, { id: "s", label: "مصدر", reliability: 1 });
    o = addClaim(o, { id: "c", text: "ادعاء" });
    o = addEvidence(o, { id: "e1", claimId: "c", stance: "SUPPORTING", weight: 0.5, sourceId: "s" });
    o = addEvidence(o, { id: "e2", claimId: "c", stance: "OPPOSING", weight: 0.5, sourceId: "s" });
    o = addHypothesis(o, { id: "h", text: "فرضية" });
    o = assessUncertainty(o);
    o = renderJudgment(o);
    expect(o.uncertainty?.score).toBe(1);
    expect(o.uncertainty?.band).toBe("HIGH");
    expect(o.judgment?.verdict).toBe("INCONCLUSIVE");
  });

  it("learns a signed confidence delta scaled by judgment confidence", () => {
    let win = walkToJudgment();
    win = setPlan(win, ["نفّذ"]);
    win = recordOutcome(win, { success: true, note: "نجح" });
    win = learn(win, "درس");
    expect(win.learning?.confidenceDelta).toBeGreaterThan(0);

    let lose = walkToJudgment();
    lose = setPlan(lose, ["نفّذ"]);
    lose = recordOutcome(lose, { success: false, note: "فشل" });
    lose = learn(lose, "درس");
    expect(lose.learning?.confidenceDelta).toBeLessThan(0);
  });
});

describe("intelligence object — fail-closed guards", () => {
  it("refuses to construct with empty id or question", () => {
    expect(() => createIntelligenceObject("", "q")).toThrow(LifecycleError);
    expect(() => createIntelligenceObject("id", "  ")).toThrow(LifecycleError);
  });

  it("refuses out-of-order transitions", () => {
    const o = createIntelligenceObject("io", "q");
    // Cannot add a source before context.
    expect(() => addSource(o, { id: "s", label: "l", reliability: 0.5 })).toThrow(/WRONG_STAGE/);
    // Cannot judge before assessing.
    expect(() => renderJudgment(o)).toThrow(/WRONG_STAGE/);
    // Cannot plan before judging.
    expect(() => setPlan(o, ["x"])).toThrow(/WRONG_STAGE/);
  });

  it("refuses a claim with no source and evidence referencing unknowns", () => {
    let o = createIntelligenceObject("io", "q");
    o = setContext(o, "ctx");
    // A source is required before a claim — but we are in CONTEXT with none.
    expect(() => addClaim({ ...o, stage: "SOURCES" }, { id: "c", text: "t" })).toThrow(/NO_SOURCES/);

    o = addSource(o, { id: "s", label: "l", reliability: 0.5 });
    o = addClaim(o, { id: "c", text: "t" });
    expect(() => addEvidence(o, { id: "e", claimId: "missing", stance: "SUPPORTING", weight: 0.5, sourceId: "s" })).toThrow(/UNKNOWN_CLAIM/);
    expect(() => addEvidence(o, { id: "e", claimId: "c", stance: "SUPPORTING", weight: 0.5, sourceId: "missing" })).toThrow(/UNKNOWN_SOURCE/);
  });

  it("refuses out-of-range and malformed inputs", () => {
    let o = createIntelligenceObject("io", "q");
    o = setContext(o, "ctx");
    expect(() => addSource(o, { id: "s", label: "l", reliability: 1.5 })).toThrow(/OUT_OF_RANGE/);
    expect(() => addSource(o, { id: "s", label: "l", reliability: -0.1 })).toThrow(/OUT_OF_RANGE/);
    o = addSource(o, { id: "s", label: "l", reliability: 0.5 });
    o = addClaim(o, { id: "c", text: "t" });
    // Bad stance is rejected.
    expect(() => addEvidence(o, { id: "e", claimId: "c", stance: "MAYBE" as never, weight: 0.5, sourceId: "s" })).toThrow(/BAD_STANCE/);
  });

  it("refuses an empty plan and a non-boolean outcome", () => {
    let o = walkToJudgment();
    expect(() => setPlan(o, [])).toThrow(/EMPTY_PLAN/);
    o = setPlan(o, ["step"]);
    expect(() => recordOutcome(o, { success: "yes" as never, note: "n" })).toThrow(/BAD_OUTCOME/);
  });
});

describe("intelligence object — insight linking", () => {
  it("links an existing insight id and rejects non-insight ids", () => {
    const o = createIntelligenceObject("io", "q");
    const linked = linkInsight(o, "insight-overdue-invoices");
    expect(linked.linkedInsightIds).toEqual(["insight-overdue-invoices"]);
    // Idempotent.
    expect(linkInsight(linked, "insight-overdue-invoices").linkedInsightIds).toEqual(["insight-overdue-invoices"]);
    // Fail-closed on a non-insight id.
    expect(() => linkInsight(o, "random-id")).toThrow(/NOT_AN_INSIGHT/);
  });
});

describe("intelligence object — tRPC surface", () => {
  const caller = appRouter.createCaller({} as never);

  beforeEach(() => {
    __resetIntelligenceObjectsForTests();
    __resetInsightsPortForTests();
  });

  afterEach(() => {
    __resetInsightsPortForTests();
  });

  it("drives the lifecycle end-to-end over tRPC", async () => {
    await caller.intelligenceObject.create({ id: "r1", question: "هل نطلق؟" });
    await caller.intelligenceObject.setContext({ id: "r1", context: "قرار إطلاق" });
    await caller.intelligenceObject.addSource({ id: "r1", source: { id: "s1", label: "سوق", reliability: 0.8 } });
    await caller.intelligenceObject.addClaim({ id: "r1", claim: { id: "c1", text: "الطلب مرتفع" } });
    await caller.intelligenceObject.addEvidence({ id: "r1", evidence: { id: "e1", claimId: "c1", stance: "SUPPORTING", weight: 0.9, sourceId: "s1" } });
    await caller.intelligenceObject.addHypothesis({ id: "r1", hypothesis: { id: "h1", text: "الإطلاق ناجح" } });
    await caller.intelligenceObject.assess({ id: "r1" });
    await caller.intelligenceObject.judge({ id: "r1" });
    await caller.intelligenceObject.plan({ id: "r1", steps: ["أطلق"] });
    await caller.intelligenceObject.outcome({ id: "r1", success: true, note: "تم" });
    const final = await caller.intelligenceObject.learn({ id: "r1", lesson: "الإطلاق كان صائباً" });

    expect(final.stage).toBe("LEARNING");
    expect(final.judgment?.verdict).toBe("SUPPORTED");
  });

  it("maps illegal transitions to a fail-closed BAD_REQUEST", async () => {
    await caller.intelligenceObject.create({ id: "r2", question: "q" });
    await expect(caller.intelligenceObject.judge({ id: "r2" })).rejects.toThrow(/WRONG_STAGE/);
  });

  it("rejects duplicate creation and unknown ids", async () => {
    await caller.intelligenceObject.create({ id: "r3", question: "q" });
    await expect(caller.intelligenceObject.create({ id: "r3", question: "q" })).rejects.toThrow(/موجود مسبقاً/);
    await expect(caller.intelligenceObject.get({ id: "nope" })).rejects.toThrow(/لا يوجد/);
  });

  it("links a live insight and refuses one absent from the feed", async () => {
    // Plant a single live insight in the feed the port reads.
    __setInsightsListFnForTests(() => [
      { id: "insight-demo", type: "PATTERN", rank: 2, verification: "PROBABLE", contentText: "نمط", ageDays: 0 },
    ]);
    await caller.intelligenceObject.create({ id: "r4", question: "q" });
    const linked = await caller.intelligenceObject.linkInsight({ id: "r4", insightId: "insight-demo" });
    expect(linked.linkedInsightIds).toEqual(["insight-demo"]);
    await expect(
      caller.intelligenceObject.linkInsight({ id: "r4", insightId: "insight-absent" }),
    ).rejects.toThrow(/غير موجودة/);
  });
});

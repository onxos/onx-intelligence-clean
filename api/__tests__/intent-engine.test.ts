// ============================================================
// INTENT ENGINE — STE-K-02 tests (deterministic, zero LLM)
// Decisive fixtures: Arabic emergency/pricing/booking, diacritics
// normalization, English parallels, honest low-confidence INFO
// fallback, decisive emergency priority, deterministic ordering,
// and the public no-key endpoint.
// ============================================================
import { describe, it, expect } from "vitest";
import { classifyIntent } from "../lib/intent-engine";
import { appRouter } from "../router";

describe("intent engine (STE-K-02)", () => {
  it("Arabic emergency: «كلبي ينزف بشدة الحقوه» → EMERGENCY first, high confidence, real trace", () => {
    const result = classifyIntent("كلبي ينزف بشدة الحقوه");
    expect(result.engine).toBe("RULE_BASED_SAFE");
    expect(result.mode).toBe("DETERMINISTIC_NO_KEY");
    const top = result.results[0];
    expect(top.intent).toBe("EMERGENCY");
    expect(top.confidence).toBeGreaterThanOrEqual(0.6);
    expect(top.fallback).toBe(false);
    const matched = top.trace.keywords.map((k) => k.term);
    expect(matched).toContain("ينزف");
    expect(matched).toContain("الحقوه");
  });

  it("Arabic pricing: «كم سعر تطعيم القطط؟» → PRICING with keyword + phrase trace", () => {
    const top = classifyIntent("كم سعر تطعيم القطط؟").results[0];
    expect(top.intent).toBe("PRICING");
    expect(top.trace.keywords.map((k) => k.term)).toContain("سعر");
    expect(top.trace.phrases.map((p) => p.phrase)).toContain("كم سعر");
  });

  it("Arabic booking: «ابغى موعد بكرة» → BOOKING (taa-marbuta + alef-maqsura normalized)", () => {
    const top = classifyIntent("ابغى موعد بكرة").results[0];
    expect(top.intent).toBe("BOOKING");
    expect(top.trace.keywords.map((k) => k.term)).toContain("موعد");
  });

  it("undiacritized rules match fully diacritized input", () => {
    const top = classifyIntent("كَلْبِي يَنْزِفُ مِنْ سَاقِهِ").results[0];
    expect(top.intent).toBe("EMERGENCY");
    expect(top.trace.keywords.map((k) => k.term)).toContain("ينزف");
  });

  it("English parallels: bleeding → EMERGENCY, vaccination cost → PRICING, appointment → BOOKING", () => {
    expect(classifyIntent("my dog is bleeding badly please help").results[0].intent).toBe("EMERGENCY");
    const pricing = classifyIntent("how much is the cat vaccination?").results[0];
    expect(pricing.intent).toBe("PRICING");
    expect(pricing.trace.phrases.map((p) => p.phrase)).toContain("how much");
    expect(classifyIntent("I want to book an appointment for my cat").results[0].intent).toBe("BOOKING");
  });

  it("ambiguous text → honest low-confidence INFO fallback with empty trace", () => {
    const result = classifyIntent("مرحبا كيف الحال اليوم");
    expect(result.results).toHaveLength(1);
    const top = result.results[0];
    expect(top.intent).toBe("INFO");
    expect(top.fallback).toBe(true);
    expect(top.confidence).toBeLessThanOrEqual(0.3);
    expect(top.score).toBe(0);
    expect(top.trace.keywords).toEqual([]);
    expect(top.trace.phrases).toEqual([]);
  });

  it("decisive emergency priority: emergency evidence outranks a stronger booking signal", () => {
    // Booking evidence is heavy here (keyword + phrase), emergency is a single keyword.
    const result = classifyIntent("ابغى موعد حجز عندي حالة تسمم");
    expect(result.results[0].intent).toBe("EMERGENCY");
    expect(result.results[1].intent).toBe("BOOKING");
  });

  it("deterministic ordering and topN: identical runs produce identical JSON, topN respected", () => {
    const text = "موعد سعر نتائج تحليل دواء شكوى";
    const a = classifyIntent(text, 7);
    const b = classifyIntent(text, 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.results.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < a.results.length; i++) {
      expect(a.results[i - 1].score).toBeGreaterThanOrEqual(a.results[i].score);
    }
    expect(classifyIntent(text, 2).results).toHaveLength(2);
  });

  it("intentEngine.classify is PUBLIC — works with no bridge key (analyze stays bridge-locked)", async () => {
    const caller = appRouter.createCaller({ req: { headers: new Headers() } } as never);
    const result = await caller.intentEngine.classify({ text: "كم سعر التطعيم؟" });
    expect(result.access).toBe("PUBLIC_READ");
    expect(result.bridge).toBe("intentEngine");
    expect(result.results[0].intent).toBe("PRICING");
    // The legacy LLM-path contract is untouched: analyze still fail-closed.
    await expect(
      caller.intentEngine.analyze({ content: "bridge intent dry-run" }),
    ).rejects.toThrow(/BRIDGE_DISABLED/);
  });
});

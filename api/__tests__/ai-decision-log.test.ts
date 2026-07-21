// ============================================================
// AI DECISION LOG — explainability tests (H-7)
// ============================================================
import { describe, it, expect } from "vitest";
import {
  deriveEvidenceTier,
  recordAiDecision,
  listAiDecisions,
  aiDecisionStats,
} from "../lib/ai-decision-log";

describe("AI explainability — evidence tier", () => {
  it("returns T4 when not grounded", () => {
    expect(deriveEvidenceTier({ contextItems: 9, grounded: false })).toBe("T4");
  });
  it("scales the tier with grounded context volume", () => {
    expect(deriveEvidenceTier({ contextItems: 5, grounded: true })).toBe("T1");
    expect(deriveEvidenceTier({ contextItems: 2, grounded: true })).toBe("T2");
    expect(deriveEvidenceTier({ contextItems: 1, grounded: true })).toBe("T3");
    expect(deriveEvidenceTier({ contextItems: 0, grounded: true })).toBe("T4");
  });
});

describe("AI explainability — decision record", () => {
  it("records model, temperature, tokens, evidence tier and reasoning", () => {
    const rec = recordAiDecision({
      operation: "test.ask",
      userId: "u1",
      model: "gpt-4o",
      temperature: 0.7,
      tokensUsed: 123,
      evidenceTier: "T2",
      reasoning: "grounded by 2 items",
    });
    expect(rec.id).toMatch(/^ai-/);
    expect(rec.model).toBe("gpt-4o");
    expect(rec.temperature).toBe(0.7);
    expect(rec.tokensUsed).toBe(123);
    expect(rec.evidenceTier).toBe("T2");

    const list = listAiDecisions(10);
    expect(list[0].id).toBe(rec.id);

    const stats = aiDecisionStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byTier.T2).toBeGreaterThan(0);
  });
});

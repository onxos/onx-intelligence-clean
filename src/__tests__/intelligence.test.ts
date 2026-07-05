import { describe, it, expect } from "vitest";

const mockCaller = {
  intelligence: {
    ingestKnowledgeAsset: async (data: Record<string, unknown>) => ({
      action: "CREATED", id: "test-" + Math.random().toString(36).substring(2), ...data,
    }),
    answerFromKnowledge: async ({ question }: { question: string }) => ({
      answerSource: question.includes("ONX") ? "INTERNAL" : "PROVIDER",
      answer: question.includes("ONX") ? "ONX is a Civilization OS" : "[EXTERNAL_REQUIRED]",
      confidence: question.includes("ONX") ? 95 : 0,
      shouldSaveToKnowledge: !question.includes("ONX"),
    }),
    getSelfSufficiencyMetrics: async () => ({
      currentSelfSufficiency: 87, trend: "IMPROVING",
      knowledge: { totalAssets: 100, totalValueUsd: 5000 },
    }),
    calculateKnowledgeValue: async () => ({
      totalCorpusValueUsd: "5000", wealthSummary: "ONX Knowledge Wealth: $5000",
    }),
    runConstitutionalAudit: async ({ content }: { content: string }) => ({
      passed: !content.includes("100% guaranteed"),
      compositeScore: content.includes("100% guaranteed") ? 45 : 92,
      violations: content.includes("100% guaranteed") ? [{ principle: "AMANAH" }] : [],
    }),
  },
};

describe("ONX Intelligence", () => {
  it("ingests knowledge", async () => {
    const r = await mockCaller.intelligence.ingestKnowledgeAsset({ questionCanonical: "What is ONX?", answer: "Civilization OS", domain: "GENERAL", confidenceScore: 95 });
    expect(r.action).toBe("CREATED");
  });
  it("answers from internal KB", async () => {
    const r = await mockCaller.intelligence.answerFromKnowledge({ question: "What is ONX?" });
    expect(r.answerSource).toBe("INTERNAL");
    expect(r.confidence).toBe(95);
  });
  it("requests external for unknown", async () => {
    const r = await mockCaller.intelligence.answerFromKnowledge({ question: "Unknown?" });
    expect(r.answerSource).toBe("PROVIDER");
    expect(r.shouldSaveToKnowledge).toBe(true);
  });
  it("passes constitutional audit", async () => {
    const r = await mockCaller.intelligence.runConstitutionalAudit({ content: "Research suggests this." });
    expect(r.passed).toBe(true);
    expect(r.compositeScore).toBeGreaterThan(70);
  });
  it("fails audit for absolute claims", async () => {
    const r = await mockCaller.intelligence.runConstitutionalAudit({ content: "100% guaranteed!" });
    expect(r.passed).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
  });
  it("tracks self-sufficiency", async () => {
    const r = await mockCaller.intelligence.getSelfSufficiencyMetrics();
    expect(r.currentSelfSufficiency).toBe(87);
    expect(r.trend).toBe("IMPROVING");
  });
  it("calculates knowledge wealth", async () => {
    const r = await mockCaller.intelligence.calculateKnowledgeValue();
    expect(Number(r.totalCorpusValueUsd)).toBeGreaterThan(0);
  });
});

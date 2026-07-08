// ============================================================
// CONSTITUTION ROUTER — UNIT TESTS
// Tests all 7 principles, validation, scoring
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as any);

describe("Constitution Router", () => {
  describe("validate", () => {
    it("should validate content against all 7 principles", async () => {
      const result = await caller.constitution.validate({
        content: "This is a truthful statement with references and sources.",
        minScore: 60,
      });

      expect(result).toBeDefined();
      expect(result.overallScore).toBeDefined();
      expect(typeof result.overallScore).toBe("number");
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.principleResults).toHaveLength(7);
      expect(result.summary.totalPrinciples).toBe(7);
    });

    it("should include all 7 principles in results", async () => {
      const result = await caller.constitution.validate({
        content: "Test content for validation.",
      });

      const principleIds = result.principleResults.map((p) => p.id);
      expect(principleIds).toContain("AMANAH");
      expect(principleIds).toContain("IHSAN");
      expect(principleIds).toContain("ADL");
      expect(principleIds).toContain("RAHMAH");
      expect(principleIds).toContain("HIKMAH");
      expect(principleIds).toContain("ITQAN");
      expect(principleIds).toContain("TAWAKKUL");
    });

    it("should respect custom minScore", async () => {
      const result = await caller.constitution.validate({
        content: "Short.",
        minScore: 95,
      });

      expect(result.passed).toBe(false);
      expect(result.minScore).toBe(95);
    });

    it("should validate with principle filter", async () => {
      const result = await caller.constitution.validate({
        content: "Testing with principles filter.",
        principles: ["AMANAH", "ADL"],
      });

      expect(result.principleResults).toHaveLength(2);
      expect(["AMANAH", "ADL"]).toContain(result.principleResults[0].id);
    });

    it("should return Amanah check status", async () => {
      const result = await caller.constitution.validate({
        content: "Content with sufficient quality and references.",
      });

      expect(result.amanahStatus).toBeDefined();
      expect(typeof result.amanahStatus.passed).toBe("boolean");
      expect(["GREEN", "RED"]).toContain(result.amanahStatus.level);
    });
  });

  describe("quickCheck", () => {
    it("should check single principle", async () => {
      const result = await caller.constitution.quickCheck({
        content: "This content is fair and just to all parties.",
        principle: "ADL",
      });

      expect(result.principle.id).toBe("ADL");
      expect(result.principle.nameAr).toBe("العدل");
      expect(result.score).toBeDefined();
      expect(typeof result.passed).toBe("boolean");
    });

    it("should check Amanah principle", async () => {
      const result = await caller.constitution.quickCheck({
        content: "This content has sources and references.",
        principle: "AMANAH",
      });

      expect(result.principle.id).toBe("AMANAH");
      expect(result.principle.nameAr).toBe("الأمانة");
    });
  });

  describe("principles", () => {
    it("should return all 7 principles", async () => {
      const result = await caller.constitution.principles();

      expect(result.principles).toHaveLength(7);
      expect(result.count).toBe(7);

      const amanah = result.principles.find((p) => p.id === "AMANAH");
      expect(amanah).toBeDefined();
      expect(amanah?.weight).toBe(0.20); // Highest weight
    });

    it("should have correct total weight", async () => {
      const result = await caller.constitution.principles();
      expect(result.totalWeight).toBe(1.0);
    });
  });

  describe("compare", () => {
    it("should compare two pieces of content", async () => {
      const result = await caller.constitution.compare({
        contentA: "This is well-referenced and thorough content with sources.",
        contentB: "Short. No sources.",
      });

      expect(result.comparison).toBeDefined();
      expect(["A", "B", "TIE"]).toContain(result.overallWinner);
    });

    it("should compare on specific principle", async () => {
      const result = await caller.constitution.compare({
        contentA: "Fair treatment for everyone involved.",
        contentB: "Biased approach favoring one side.",
        principle: "ADL",
      });

      expect(result.comparison).toHaveLength(1);
      expect(result.comparison[0].principle.id).toBe("ADL");
    });
  });

  describe("guardianCheck", () => {
    it("should pass high Amanah score", async () => {
      const result = await caller.constitution.guardianCheck({ score: 0.8 });
      expect(result.passed).toBe(true);
      expect(result.level).toBe("GREEN");
    });

    it("should fail low Amanah score", async () => {
      const result = await caller.constitution.guardianCheck({ score: 0.1 });
      expect(result.passed).toBe(false);
      expect(result.level).toBe("RED");
    });

    it("should handle borderline score", async () => {
      const result = await caller.constitution.guardianCheck({ score: 0.4 });
      expect(result.passed).toBe(false);
      expect(result.level).toBe("RED");
    });
  });

  describe("stats", () => {
    it("should return validation statistics", async () => {
      // Run a validation first to generate stats
      await caller.constitution.validate({ content: "Test for stats." });

      const result = await caller.constitution.stats();
      expect(result.totalValidations).toBeGreaterThanOrEqual(1);
      expect(result.recentValidations).toBeDefined();
    });
  });
});

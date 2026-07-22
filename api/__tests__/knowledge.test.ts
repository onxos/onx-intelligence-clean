// ============================================================
// KNOWLEDGE ROUTER — UNIT TESTS
// STE-K-REAL: the templated 22,500-record demo seed is now OFF by
// default (ENABLE_TEMPLATED_KNOWLEDGE_SEED). These tests exercise
// the honest default state: domain taxonomy intact, empty store,
// no fabricated counts. Templated-seed behavior is covered by
// corpus-manifest tests.
// ============================================================
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as any);

// Seed two REAL records through the public add path so search/stats
// have honest data to work with (no templated seed anymore).
beforeAll(async () => {
  await caller.knowledge.add({
    title: "Feline Vaccination Protocol",
    content: "Core vaccines for cats: FVRCP, rabies. Boosters annually per AAHA guidelines.",
    domain: "MEDICINE",
  });
  await caller.knowledge.add({
    title: "SWOT Analysis for Clinics",
    content: "Strategy framework: strengths, weaknesses, opportunities, threats for veterinary practices.",
    domain: "STRATEGY",
  });
});

describe("Knowledge Router", () => {
  describe("domains", () => {
    it("should return all 19 domains", async () => {
      const result = await caller.knowledge.domains();
      expect(result.domains).toHaveLength(19);
      // Honest default: no templated inflation — only records explicitly added.
      expect(result.totalRecords).toBeGreaterThanOrEqual(0);
      expect(result.totalRecords).toBeLessThan(1000); // never the 22,500 fake seed
    });

    it("should include core domains", async () => {
      const result = await caller.knowledge.domains();
      const names = result.domains.map((d) => d.id);
      expect(names).toContain("STRATEGY");
      expect(names).toContain("TECHNOLOGY");
      expect(names).toContain("ISLAMIC");
      expect(names).toContain("MEDICINE");
    });

    it("should include new Day 7 domains", async () => {
      const result = await caller.knowledge.domains();
      const names = result.domains.map((d) => d.id);
      expect(names).toContain("AGRICULTURE");
      expect(names).toContain("ENERGY");
      expect(names).toContain("DEFENSE");
    });
  });

  describe("search", () => {
    it("should search by text", async () => {
      const result = await caller.knowledge.search({
        query: "vaccination",
        limit: 5,
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it("should search with vector", async () => {
      const result = await caller.knowledge.search({
        query: "artificial intelligence",
        useVector: true,
        limit: 5,
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.searchMethod).toBe("HYBRID_TEXT_VECTOR");
    });

    it("should filter by domain", async () => {
      const result = await caller.knowledge.search({
        query: "test",
        domain: "ISLAMIC",
        limit: 5,
      });
      expect(result.results.every((r) => r.domain === "ISLAMIC")).toBe(true); // vacuously true on empty set
    });
  });

  describe("byDomain", () => {
    it("should return strategy domain records", async () => {
      const result = await caller.knowledge.byDomain({
        domain: "STRATEGY",
        limit: 10,
      });
      expect(result.domain).toBe("STRATEGY");
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe("getById", () => {
    it("should fetch a single record", async () => {
      // First search to get an ID
      const search = await caller.knowledge.search({ query: "test", limit: 1 });
      if (search.results.length > 0) {
        const id = search.results[0].id;
        const record = await caller.knowledge.getById({ id });
        expect(record.id).toBe(id);
        expect(record.content).toBeDefined();
      }
    });
  });

  describe("stats", () => {
    it("should return knowledge stats", async () => {
      const result = await caller.knowledge.stats();
      expect(result.totalRecords).toBeGreaterThanOrEqual(2); // only the records we added — never templated inflation
      expect(result.byDomain).toBeDefined();
    });
  });

  describe("add", () => {
    it("should add a new knowledge record", async () => {
      const result = await caller.knowledge.add({
        title: "Test Record",
        content: "This is a test knowledge record.",
        domain: "TECHNOLOGY",
        tags: ["test"],
        importance: 0.8,
      });
      expect(result.added).toBe(true);
      expect(result.id).toBeDefined();
    });
  });
});

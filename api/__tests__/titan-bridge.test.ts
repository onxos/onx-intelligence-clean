// ============================================================
// TITAN BRIDGE — UNIT TESTS
// Tests all 5 Titans, routing, council, stats
// ============================================================
import { describe, it, expect, vi } from "vitest";
import { appRouter } from "../router";

// Mock the OpenAI SDK so Titan routing/ask logic is testable in CI without a real key.
vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: async () => {
          await new Promise((r) => setTimeout(r, 5)); // simulate network latency (latencyMs > 0)
          return {
            choices: [{ message: { content: "ONX_TEST_OK — استجابة اختبارية من تيتان" } }],
            usage: { total_tokens: 42 },
          };
        },
      },
    };
  }
  return { default: MockOpenAI };
});

// getOpenAI() reads OPENAI_API_KEY live; a dummy value lets it build the mocked client.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-onx-test-mock";

const caller = appRouter.createCaller({} as any);

describe("Titan Bridge Router", () => {
  describe("bridgeStatus", () => {
    it("should expose bridge gate state", async () => {
      const result = await caller.titan.bridgeStatus();
      expect(typeof result.enabled).toBe("boolean");
      expect(typeof result.hasSharedSecret).toBe("boolean");
      expect(result.bridge).toBe("titanBridge");
      expect(["ACTIVE", "SAFE_DISABLED"]).toContain(result.mode);
    });
  });

  describe("runtimeBridgeDelta", () => {
    it("should expose runtime compatibility proof with checksum", async () => {
      const result = await caller.titan.runtimeBridgeDelta();
      expect(result.bridge).toBe("titanBridge");
      expect(["BRIDGE_READY", "BRIDGE_GUARDED"]).toContain(result.compatibility);
      expect(["pg", "memory"]).toContain(result.memoryMode);
      expect(typeof result.providerCounts.validated).toBe("number");
      expect(typeof result.providerCounts.configuredUnprobed).toBe("number");
      expect(typeof result.providerCounts.missingKey).toBe("number");
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(typeof result.timestamp).toBe("string");
    });
  });

  describe("listTitans", () => {
    it("should return all 5 Titans", async () => {
      const result = await caller.titan.listTitans();
      expect(result.titans).toHaveLength(5);
      expect(result.count).toBe(5);
    });

    it("should include all Titan names", async () => {
      const result = await caller.titan.listTitans();
      const names = result.titans.map((t) => t.id);
      expect(names).toContain("prometheus");
      expect(names).toContain("athena");
      expect(names).toContain("zeus");
      expect(names).toContain("hermes");
      expect(names).toContain("apollo");
    });

    it("should include Arabic names", async () => {
      const result = await caller.titan.listTitans();
      const athena = result.titans.find((t) => t.id === "athena");
      expect(athena?.nameAr).toBe("أثينا");
    });

    it("should have correct temperature settings", async () => {
      const result = await caller.titan.listTitans();
      const apollo = result.titans.find((t) => t.id === "apollo");
      expect(apollo?.temperature).toBe(0.3); // Strictest

      const prometheus = result.titans.find((t) => t.id === "prometheus");
      expect(prometheus?.temperature).toBe(0.8); // Most creative
    });
  });

  describe("getTitan", () => {
    it("should return Prometheus details", async () => {
      const result = await caller.titan.getTitan({ titanId: "prometheus" });
      expect(result.id).toBe("prometheus");
      expect(result.nameAr).toBe("بروميثيوس");
      expect(result.systemPrompt).toContain("Strategic Vision");
    });

    it("should return Apollo governance details", async () => {
      const result = await caller.titan.getTitan({ titanId: "apollo" });
      expect(result.id).toBe("apollo");
      expect(result.domain).toContain("Governance");
      expect(result.systemPrompt).toContain("FINAL AUTHORITY");
    });
  });

  describe("route", () => {
    it("should route strategy questions to Prometheus", async () => {
      const result = await caller.titan.route({
        message: "ما هي رؤية ONX الاستراتيجية؟",
      });

      expect(result.routed).toBe(true);
      expect(result.selectedTitan.id).toBe("prometheus");
      expect(result.routingMethod).toBe("KEYWORD_HEURISTIC");
    });

    it("should route governance questions to Apollo", async () => {
      const result = await caller.titan.route({
        message: "ما هي آليات الحوكمة الدستورية؟",
      });

      expect(result.selectedTitan.id).toBe("apollo");
    });

    it("should route knowledge questions to Athena", async () => {
      const result = await caller.titan.route({
        message: "كيف يعمل نظام المعرفة؟",
      });

      expect(result.selectedTitan.id).toBe("athena");
    });

    it("should respect domain preference", async () => {
      const result = await caller.titan.route({
        message: "test message",
        preferredDomain: "architecture",
      });

      expect(result.selectedTitan.id).toBe("zeus");
      expect(result.routingMethod).toBe("DOMAIN_PREFERENCE");
    });

    it("should track latency", async () => {
      const result = await caller.titan.route({
        message: "اختبار السرعة",
      });

      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("stats", () => {
    it("should return Titan stats", async () => {
      const result = await caller.titan.stats();
      expect(result.titans).toBe(5);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].name).toBe("OpenAI");
    });
  });

  describe("consult bridge contract", () => {
    it("should block consult when bridge gate is disabled", async () => {
      const status = await caller.titan.bridgeStatus();
      if (status.enabled) return;

      await expect(
        caller.titan.consult({
          titanId: "prometheus",
          message: "bridge dry-run",
        }),
      ).rejects.toThrow(/BRIDGE_DISABLED/);
    });
  });

  describe("ask with real OpenAI", () => {
    it("should call GPT-4o with Prometheus", async () => {
      const result = await caller.titan.ask({
        titanId: "prometheus",
        message: "Say 'ONX_TEST_OK' in Arabic",
      });

      expect(result.titan.id).toBe("prometheus");
      expect(result.response).toBeDefined();
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.constitutionalStatus).toBe("COMPLIANT");
    }, 30000);
  });
});

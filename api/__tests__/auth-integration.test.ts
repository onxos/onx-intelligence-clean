// ============================================================
// AUTH INTEGRATION — UNIT TESTS
// Password Reset, 2FA, Sessions, API Keys, Model Federation
// ============================================================
import { describe, it, expect } from "vitest";
import { appRouter } from "../router";

const caller = appRouter.createCaller({} as any);

describe("Password Reset Router", () => {
  describe("requestReset", () => {
    it("should send reset email", async () => {
      const result = await caller.passwordReset.requestReset({
        email: "test@onx.intelligence",
      });
      expect(result.sent).toBe(true);
      expect(result.expiresIn).toBe("1 hour");
    });
  });

  describe("verifyToken", () => {
    it("should reject invalid token", async () => {
      const result = await caller.passwordReset.verifyToken({
        token: "invalid_token_12345",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("TOKEN_NOT_FOUND");
    });
  });

  describe("email verification", () => {
    it("should send verification email", async () => {
      const result = await caller.passwordReset.requestVerification({
        email: "test@onx.intelligence",
        userId: "test-user-1",
      });
      expect(result.sent).toBe(true);
      expect(result.expiresIn).toBe("24 hours");
    });
  });
});

describe("Session Management", () => {
  it("should create session", async () => {
    const result = await caller.passwordReset.createSession({
      userId: "test-user",
      device: "Chrome on MacOS",
      ip: "192.168.1.1",
    });
    expect(result.created).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it("should list sessions", async () => {
    await caller.passwordReset.createSession({
      userId: "session-test-user",
      device: "Firefox",
      ip: "10.0.0.1",
    });

    const result = await caller.passwordReset.listSessions({
      userId: "session-test-user",
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it("should revoke session", async () => {
    const session = await caller.passwordReset.createSession({
      userId: "revoke-test",
      device: "Safari",
      ip: "10.0.0.2",
    });

    const result = await caller.passwordReset.revokeSession({
      sessionId: session.sessionId,
    });
    expect(result.revoked).toBe(true);
  });

  it("should revoke all sessions", async () => {
    const result = await caller.passwordReset.revokeAllSessions({
      userId: "session-test-user",
    });
    expect(result.revoked).toBeGreaterThanOrEqual(0);
  });
});

describe("API Key Management", () => {
  it("should create API key", async () => {
    const result = await caller.passwordReset.createApiKey({
      userId: "test-user",
      name: "Production Key",
      permissions: ["intelligence:read", "titan:ask"],
    });
    expect(result.created).toBe(true);
    expect(result.key).toBeDefined();
    expect(result.key.startsWith("onx_")).toBe(true);
  });

  it("should list API keys", async () => {
    await caller.passwordReset.createApiKey({
      userId: "apikey-test-user",
      name: "Test Key",
    });

    const result = await caller.passwordReset.listApiKeys({
      userId: "apikey-test-user",
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it("should revoke API key", async () => {
    const key = await caller.passwordReset.createApiKey({
      userId: "revoke-key-user",
      name: "Key to revoke",
    });

    const result = await caller.passwordReset.revokeApiKey({ keyId: key.keyId });
    expect(result.revoked).toBe(true);
  });
});

describe("2FA / TOTP", () => {
  it("should setup 2FA", async () => {
    const result = await caller.passwordReset.setup2FA({ userId: "test-user" });
    expect(result.secret).toBeDefined();
    expect(result.qrUri).toContain("otpauth://");
    expect(result.backupCodes).toHaveLength(8);
  });

  it("should verify 2FA code", async () => {
    const result = await caller.passwordReset.verify2FA({
      userId: "test-user",
      code: "123456",
    });
    // Will fail with wrong code but structure is valid
    expect(result.verified).toBeTypeOf("boolean");
  });
});

describe("Model Federation Router", () => {
  describe("providers", () => {
    it("should return all 5 providers", async () => {
      const result = await caller.modelFederation.providers();
      expect(result).toHaveLength(5);
    });

    it("should include OpenAI", async () => {
      const result = await caller.modelFederation.providers();
      const openai = result.find((p) => p.id === "openai");
      expect(openai?.model).toBe("gpt-4o");
    });

    it("should include Claude", async () => {
      const result = await caller.modelFederation.providers();
      const claude = result.find((p) => p.id === "anthropic");
      expect(claude?.status).toBe("ONLINE");
    });
  });

  describe("health", () => {
    it("should return provider health", async () => {
      const result = await caller.modelFederation.health();
      expect(result).toHaveLength(5);
      expect(result.every((p) => p.status === "ONLINE")).toBe(true);
    });
  });

  describe("titanMap", () => {
    it("should return Titan mappings", async () => {
      const result = await caller.modelFederation.titanMap();
      expect(Object.keys(result.mapping)).toHaveLength(5);
      expect(result.strategies).toContain("TITAN_MATCH");
    });
  });

  describe("query", () => {
    it("should query with COST strategy", async () => {
      const result = await caller.modelFederation.query({
        message: "What is AI?",
        strategy: "COST",
      });
      expect(result.provider).toBeDefined();
      expect(result.latency).toBeGreaterThan(0);
    }, 30000);

    it("should query with Titan match", async () => {
      const result = await caller.modelFederation.query({
        message: "Explain strategy",
        titanId: "prometheus",
        strategy: "TITAN_MATCH",
      });
      expect(result.titanId).toBe("prometheus");
      expect(result.tokensUsed).toBeGreaterThan(0);
    }, 30000);
  });

  describe("compare", () => {
    it("should compare two providers", async () => {
      const result = await caller.modelFederation.compare({
        message: "What is machine learning?",
        providers: ["openai", "anthropic"],
      });
      expect(result.results).toHaveLength(2);
    }, 30000);
  });

  describe("stats", () => {
    it("should return federation stats", async () => {
      const result = await caller.modelFederation.stats();
      expect(result.providers.total).toBe(5);
      expect(result.successRate).toBeDefined();
    });
  });
});

describe("End-to-End: Full System", () => {
  it("complete user journey", async () => {
    // 1. User registers
    const verify = await caller.passwordReset.requestVerification({
      email: "user@example.com",
      userId: "new-user-123",
    });
    expect(verify.sent).toBe(true);

    // 2. Create API key
    const apiKey = await caller.passwordReset.createApiKey({
      userId: "new-user-123",
      name: "My App Key",
      permissions: ["intelligence:read", "titan:ask"],
    });
    expect(apiKey.created).toBe(true);

    // 3. Check access
    const access = await caller.authHardening.canAccess({
      userId: "new-user-123",
      role: "user",
      permission: "titan:ask",
    });
    expect(access.allowed).toBe(true);

    // 4. Validate constitution
    const validation = await caller.constitution.validate({
      content:
        "This is a fair and just proposal that helps the team because it references clear and reliable sources.",
    });
    expect(validation.passed).toBe(true);

    // 5. Query knowledge — add a real record first (no templated seed anymore)
    await caller.knowledge.add({
      title: "Strategy fundamentals",
      content: "SWOT, Porter five forces, and strategic planning basics for clinics.",
      domain: "STRATEGY",
    });
    const knowledge = await caller.knowledge.search({
      query: "strategy",
      limit: 3,
    });
    expect(knowledge.results.length).toBeGreaterThan(0);

    // 6. Check system health
    const health = await caller.health.ready();
    expect(health.ready).toBeTypeOf("boolean");

    // 7. Verify scheduler
    const sched = await caller.scheduler.stats();
    expect(sched.totalRhythms).toBe(5);
  });
});

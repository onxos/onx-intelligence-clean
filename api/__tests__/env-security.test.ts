// ============================================================
// ENV SECURITY — data residency (C-4) + fail-closed secrets (H-5)
// + structured logger (L-17)
// ============================================================
import { describe, it, expect, afterEach } from "vitest";
import {
  validateDataResidency,
  collectProductionSecretProblems,
  APPROVED_DATA_REGIONS,
} from "../lib/env";
import { StructuredLogger } from "../lib/structured-logger";

describe("Data residency (C-4)", () => {
  it("accepts an in-Kingdom region", () => {
    const r = validateDataResidency("ksa-central");
    expect(r.ok).toBe(true);
  });

  it("rejects an unapproved region", () => {
    const r = validateDataResidency("us-east-1");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("NOT approved");
  });

  it("defaults the primary region to in-Kingdom", () => {
    expect(APPROVED_DATA_REGIONS[0]).toBe("ksa-central");
  });
});

describe("Fail-closed production secrets (H-5)", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "NODE_ENV", "APP_SECRET", "BRIDGE_ENABLED", "BRIDGE_SHARED_SECRET",
    "TWILIO_ENABLED", "TWILIO_AUTH_TOKEN",
    "STRIPE_ENABLED", "STRIPE_WEBHOOK_SECRET",
    "SQUARE_ENABLED", "SQUARE_WEBHOOK_SIGNATURE_KEY",
  ];
  function snapshot() { for (const k of keys) saved[k] = process.env[k]; }
  function clearAll() { for (const k of keys) delete process.env[k]; }

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("no-ops outside production", () => {
    snapshot(); clearAll();
    process.env.NODE_ENV = "development";
    expect(collectProductionSecretProblems()).toEqual([]);
  });

  it("flags a missing/weak APP_SECRET in production", () => {
    snapshot(); clearAll();
    process.env.NODE_ENV = "production";
    process.env.APP_SECRET = "change-me-min-32-chars-xxxxxxxxxxxxx";
    const problems = collectProductionSecretProblems();
    expect(problems.some((p) => p.includes("APP_SECRET"))).toBe(true);
  });

  it("requires the bridge secret when the bridge is enabled", () => {
    snapshot(); clearAll();
    process.env.NODE_ENV = "production";
    process.env.APP_SECRET = "a".repeat(40);
    process.env.BRIDGE_ENABLED = "true";
    const problems = collectProductionSecretProblems();
    expect(problems.some((p) => p.includes("BRIDGE_SHARED_SECRET"))).toBe(true);
  });

  it("fails closed for an enabled webhook integration missing its secret", () => {
    snapshot(); clearAll();
    process.env.NODE_ENV = "production";
    process.env.APP_SECRET = "a".repeat(40);
    process.env.STRIPE_ENABLED = "true";
    const problems = collectProductionSecretProblems();
    expect(problems.some((p) => p.includes("STRIPE_WEBHOOK_SECRET"))).toBe(true);
  });

  it("passes when all required secrets are strong and present", () => {
    snapshot(); clearAll();
    process.env.NODE_ENV = "production";
    process.env.APP_SECRET = "b".repeat(40);
    expect(collectProductionSecretProblems()).toEqual([]);
  });
});

describe("Structured logger (L-17)", () => {
  const originalWrite = process.stdout.write.bind(process.stdout);
  afterEach(() => { process.stdout.write = originalWrite; });

  it("emits a single JSON line with level/msg/ts/service", () => {
    let captured = "";
    process.stdout.write = ((chunk: string) => { captured += chunk; return true; }) as typeof process.stdout.write;
    StructuredLogger.emit("info", "test.event", { foo: "bar" });
    process.stdout.write = originalWrite;
    const parsed = JSON.parse(captured.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test.event");
    expect(parsed.service).toBe("onx-intelligence");
    expect(parsed.foo).toBe("bar");
    expect(typeof parsed.ts).toBe("string");
  });
});

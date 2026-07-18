// ============================================================
// PROVIDER REGISTRY + ROUTER — STE-Q-01 tests (no live LLM calls)
// Proves the honest tri-state (MISSING_KEY / CONFIGURED_UNPROBED /
// VALIDATED), fail-closed liveValidate, mocked probes only, and
// that no response ever leaks a full key value.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Enable the bridge so liveValidate is exercisable; the disabled
// path is asserted separately below by mocking a bad key header.
vi.mock("../lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      bridgeEnabled: true,
      bridgeSharedSecret: "test-bridge-secret",
    },
  };
});

import { appRouter } from "../router";
import {
  PROVIDERS,
  __resetProviderRegistryForTests,
  getProviderStates,
  liveValidateProviders,
} from "../lib/provider-registry";

const SECRET_KEY = "sk-secret-full-value-should-never-leak-0123456789";
const ALL_ENV_KEYS = PROVIDERS.flatMap((p) => p.envKeys);

function bridgeCtx() {
  return {
    req: { headers: new Headers({ "x-onx-bridge-key": "test-bridge-secret" }) },
  } as never;
}

function clearProviderEnv() {
  for (const key of ALL_ENV_KEYS) delete process.env[key];
}

describe("Provider registry (STE-Q-01)", () => {
  beforeEach(() => {
    __resetProviderRegistryForTests();
    clearProviderEnv();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearProviderEnv();
  });

  it("registers 8 providers with env keys and base URLs", () => {
    expect(PROVIDERS.length).toBe(8);
    const ids = PROVIDERS.map((p) => p.id);
    for (const id of ["openai", "anthropic", "google", "groq", "deepseek", "qwen", "llama", "kimi"]) {
      expect(ids).toContain(id);
    }
    for (const p of PROVIDERS) {
      expect(p.envKeys.length).toBeGreaterThan(0);
      expect(p.baseUrl).toMatch(/^https:\/\//);
    }
  });

  it("reports MISSING_KEY when no key is configured", () => {
    const states = getProviderStates();
    expect(states).toHaveLength(8);
    for (const state of states) {
      expect(state.status).toBe("MISSING_KEY");
      expect(state.keyPrefix).toBeNull();
      expect(state.validation).toBeNull();
    }
  });

  it("reports CONFIGURED_UNPROBED (never 'connected') when a key exists without a probe", () => {
    process.env.OPENAI_API_KEY = SECRET_KEY;
    const state = getProviderStates().find((s) => s.id === "openai")!;
    expect(state.status).toBe("CONFIGURED_UNPROBED");
    expect(state.keyPrefix).toBe(SECRET_KEY.slice(0, 4));
    expect(state.validation).toBeNull();
  });

  it("upgrades to VALIDATED only after a successful mocked probe", async () => {
    process.env.GROQ_API_KEY = SECRET_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] }),
    })) as never);

    const results = await liveValidateProviders();
    const groq = results.find((r) => r.id === "groq")!;
    expect(groq.status).toBe("VALIDATED");
    expect(groq.modelCount).toBe(3);
    expect(groq.latencyMs).toBeGreaterThanOrEqual(0);

    const state = getProviderStates().find((s) => s.id === "groq")!;
    expect(state.status).toBe("VALIDATED");
    expect(state.validation?.modelCount).toBe(3);
    expect(state.validation?.validatedAt).toBeTruthy();

    // Providers without keys stay MISSING_KEY — honestly.
    expect(results.find((r) => r.id === "anthropic")!.status).toBe("MISSING_KEY");
    vi.unstubAllGlobals();
  });

  it("keeps CONFIGURED_UNPROBED (with error) when the probe fails", async () => {
    process.env.DEEPSEEK_API_KEY = SECRET_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as never);

    const results = await liveValidateProviders();
    const deepseek = results.find((r) => r.id === "deepseek")!;
    expect(deepseek.status).toBe("CONFIGURED_UNPROBED");
    expect(deepseek.error).toBe("HTTP 401");
    expect(getProviderStates().find((s) => s.id === "deepseek")!.status).toBe("CONFIGURED_UNPROBED");
    vi.unstubAllGlobals();
  });

  it("providers.status is public and never leaks a key value", async () => {
    process.env.OPENAI_API_KEY = SECRET_KEY;
    process.env.ANTHROPIC_API_KEY = SECRET_KEY;
    const caller = appRouter.createCaller({} as never);
    const result = await caller.providers.status();
    expect(result.providers).toHaveLength(8);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET_KEY);
    expect(serialized).not.toContain(SECRET_KEY.slice(0, 12));
    const openai = result.providers.find((p) => p.id === "openai")!;
    expect(openai.keyPrefix).toBe(SECRET_KEY.slice(0, 4));
    expect(openai.keyPrefix!.length).toBe(4);
  });

  it("providers.liveValidate is fail-closed behind the bridge guard", async () => {
    const badCaller = appRouter.createCaller({
      req: { headers: new Headers({ "x-onx-bridge-key": "wrong-key" }) },
    } as never);
    await expect(badCaller.providers.liveValidate()).rejects.toThrow(/BRIDGE_UNAUTHORIZED/);
  });

  it("providers.liveValidate with no keys returns an honest MISSING_KEY list without leaking", async () => {
    const caller = appRouter.createCaller(bridgeCtx());
    const result = await caller.providers.liveValidate();
    expect(result.results).toHaveLength(8);
    for (const entry of result.results) {
      expect(entry.status).toBe("MISSING_KEY");
    }
    expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
  });
});

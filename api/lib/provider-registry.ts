// ============================================================
// PROVIDER REGISTRY — STE-Q-01 "Honest provider union" (D-8)
// Single source of truth for every AI provider the system can
// use. Status is strictly three-state and NEVER lies:
//   MISSING_KEY          — no API key in the environment
//   CONFIGURED_UNPROBED  — key present, but no live check yet
//   VALIDATED            — a real live probe succeeded (dated)
// A provider is never reported "connected" without an actual
// probe (lesson from the old cosmetic health-router constants).
// ============================================================

export type ProviderStatus = "MISSING_KEY" | "CONFIGURED_UNPROBED" | "VALIDATED";

export interface ProviderDefinition {
  id: string;
  nameEn: string;
  envKeys: string[];
  baseUrl: string;
  // API style used for the cheap live probe (models list).
  kind: "openai-compatible" | "anthropic" | "google";
}

export interface ProviderValidation {
  validatedAt: string;
  latencyMs: number;
  modelCount: number | null;
}

export interface ProviderState {
  id: string;
  nameEn: string;
  kind: ProviderDefinition["kind"];
  baseUrl: string;
  envKeys: string[];
  status: ProviderStatus;
  // First 4 characters of the configured key only — never the value.
  keyPrefix: string | null;
  validation: ProviderValidation | null;
}

export const PROVIDERS: ProviderDefinition[] = [
  { id: "openai", nameEn: "OpenAI", envKeys: ["OPENAI_API_KEY"], baseUrl: "https://api.openai.com/v1", kind: "openai-compatible" },
  { id: "anthropic", nameEn: "Anthropic", envKeys: ["ANTHROPIC_API_KEY"], baseUrl: "https://api.anthropic.com/v1", kind: "anthropic" },
  { id: "google", nameEn: "Google Gemini", envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], baseUrl: "https://generativelanguage.googleapis.com/v1beta", kind: "google" },
  { id: "groq", nameEn: "Groq", envKeys: ["GROQ_API_KEY"], baseUrl: "https://api.groq.com/openai/v1", kind: "openai-compatible" },
  { id: "deepseek", nameEn: "DeepSeek", envKeys: ["DEEPSEEK_API_KEY"], baseUrl: "https://api.deepseek.com/v1", kind: "openai-compatible" },
  { id: "qwen", nameEn: "Qwen (DashScope)", envKeys: ["QWEN_API_KEY", "DASHSCOPE_API_KEY"], baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", kind: "openai-compatible" },
  { id: "llama", nameEn: "Llama (Together)", envKeys: ["TOGETHER_API_KEY", "LLAMA_API_KEY"], baseUrl: "https://api.together.xyz/v1", kind: "openai-compatible" },
  { id: "kimi", nameEn: "Kimi (Moonshot)", envKeys: ["KIMI_API_KEY", "MOONSHOT_API_KEY"], baseUrl: "https://api.moonshot.ai/v1", kind: "openai-compatible" },
];

// In-memory validation results — VALIDATED only lives as long as
// the process that actually probed; restarts honestly reset it.
const validations = new Map<string, ProviderValidation>();

export function __resetProviderRegistryForTests(): void {
  validations.clear();
}

function readKey(def: ProviderDefinition): string | null {
  for (const envKey of def.envKeys) {
    const value = process.env[envKey];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function getProviderState(def: ProviderDefinition): ProviderState {
  const key = readKey(def);
  const validation = validations.get(def.id) ?? null;
  const status: ProviderStatus = !key
    ? "MISSING_KEY"
    : validation
      ? "VALIDATED"
      : "CONFIGURED_UNPROBED";
  return {
    id: def.id,
    nameEn: def.nameEn,
    kind: def.kind,
    baseUrl: def.baseUrl,
    envKeys: def.envKeys,
    status,
    keyPrefix: key ? key.slice(0, 4) : null,
    validation: status === "VALIDATED" ? validation : null,
  };
}

export function getProviderStates(): ProviderState[] {
  return PROVIDERS.map(getProviderState);
}

// ── Live probe (cheap models-list request) ────────────────────
// Only called from providers.liveValidate behind the bridge guard.
async function probeProvider(def: ProviderDefinition, key: string): Promise<{ ok: boolean; latencyMs: number; modelCount: number | null; error?: string }> {
  const started = Date.now();
  try {
    let url: string;
    let headers: Record<string, string>;
    if (def.kind === "anthropic") {
      url = `${def.baseUrl}/models`;
      headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };
    } else if (def.kind === "google") {
      url = `${def.baseUrl}/models?key=${encodeURIComponent(key)}`;
      headers = {};
    } else {
      url = `${def.baseUrl}/models`;
      headers = { Authorization: `Bearer ${key}` };
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { ok: false, latencyMs, modelCount: null, error: `HTTP ${response.status}` };
    }
    const payload = (await response.json()) as { data?: unknown[]; models?: unknown[] };
    const modelCount = Array.isArray(payload.data)
      ? payload.data.length
      : Array.isArray(payload.models)
        ? payload.models.length
        : null;
    return { ok: true, latencyMs, modelCount };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      modelCount: null,
      error: error instanceof Error ? error.message : "probe failed",
    };
  }
}

export interface LiveValidateEntry {
  id: string;
  status: ProviderStatus;
  latencyMs: number | null;
  modelCount: number | null;
  error: string | null;
}

// Probes every provider that has a key; providers without keys are
// reported as MISSING_KEY honestly (no fake connectivity ever).
export async function liveValidateProviders(): Promise<LiveValidateEntry[]> {
  const results: LiveValidateEntry[] = [];
  for (const def of PROVIDERS) {
    const key = readKey(def);
    if (!key) {
      results.push({ id: def.id, status: "MISSING_KEY", latencyMs: null, modelCount: null, error: null });
      continue;
    }
    const probe = await probeProvider(def, key);
    if (probe.ok) {
      validations.set(def.id, {
        validatedAt: new Date().toISOString(),
        latencyMs: probe.latencyMs,
        modelCount: probe.modelCount,
      });
      results.push({ id: def.id, status: "VALIDATED", latencyMs: probe.latencyMs, modelCount: probe.modelCount, error: null });
    } else {
      // Failed probe: key exists but is NOT validated — stay honest.
      validations.delete(def.id);
      results.push({ id: def.id, status: "CONFIGURED_UNPROBED", latencyMs: probe.latencyMs, modelCount: null, error: probe.error ?? "probe failed" });
    }
  }
  return results;
}

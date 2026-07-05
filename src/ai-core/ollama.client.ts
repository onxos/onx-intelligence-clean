/**
 * Local LLM connector (Ollama-compatible /api/generate + /api/tags).
 * Real HTTP calls via global fetch (Node 18+) — no simulated responses.
 * Used for privacy-forced routing of sensitive queries (PII/PHI/medical).
 */

export interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaHealth {
  healthy: boolean;
  models: string[];
}

const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export async function callOllama(
  endpoint: string,
  model: string,
  prompt: string,
  options?: { temperature?: number; numPredict?: number; timeoutMs?: number },
): Promise<OllamaGenerateResponse> {
  const { signal, cancel } = withTimeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.numPredict ?? 512,
        },
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as OllamaGenerateResponse;
  } finally {
    cancel();
  }
}

export async function checkOllamaHealth(endpoint: string, timeoutMs = 2000): Promise<OllamaHealth> {
  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const response = await fetch(`${endpoint}/api/tags`, { signal });
    if (!response.ok) return { healthy: false, models: [] };
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    return { healthy: true, models: data.models?.map((m) => m.name) ?? [] };
  } catch {
    return { healthy: false, models: [] };
  } finally {
    cancel();
  }
}

/**
 * ONX Agentic Loop — the brain acting as an agent, not a text box.
 *
 * goal → plan → tool calls → observe → iterate → grounded answer.
 *
 * Provider-agnostic by env:
 *   - default: OPENAI_API_KEY (OpenAI)
 *   - override: AGENTIC_BASE_URL + AGENTIC_API_KEY + AGENTIC_MODEL
 *     (any OpenAI-compatible endpoint — e.g. Kimi/Moonshot — plugged without code change)
 *
 * Every run and step is persisted to Postgres (onx_agentic_runs) and every
 * run records a governance decision — no invisible autonomy.
 */
import { semanticSearchCorpus, corpusRealCounts } from "./corpus-vector-search";
import { agentLiveness, taskStats, submitTask } from "./agent-runtime-store";
import { recordGovernanceDecision } from "./governance-log-store";
import { recordUsage } from "./provider-usage-store";
import { Pool } from "pg";

// ---------- persistence ----------
let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL ?? "";
    const isExternalHost = connectionString.includes("render.com");
    pool = new Pool({
      connectionString,
      max: 3,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    void ensureSchema().catch(() => undefined);
  }
  return pool;
}

let schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS onx_agentic_runs (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      answer TEXT,
      model TEXT,
      provider TEXT,
      steps JSONB NOT NULL DEFAULT '[]',
      tool_calls INT NOT NULL DEFAULT 0,
      duration_ms INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  schemaReady = true;
}

export interface AgenticStep {
  step: number;
  kind: "tool_call" | "final";
  tool?: string;
  args?: unknown;
  resultSummary?: string;
  durationMs?: number;
}

export interface AgenticRun {
  id: string;
  goal: string;
  status: "running" | "completed" | "failed";
  answer: string | null;
  model: string;
  provider: string;
  steps: AgenticStep[];
  toolCalls: number;
  durationMs: number;
}

// ---------- tools ----------
/** Common Arabic→Latin veterinary/brand aliases for cross-language retrieval. */
const ARABIC_ALIASES: Record<string, string> = {
  "بارفو": "parvovirus", "البارفو": "parvovirus", "بارفو الكلاب": "canine parvovirus",
  "تطعيم": "vaccination", "تطعيمات": "vaccination", "لقاح": "vaccine",
  "كلاب": "dog canine", "الكلاب": "dog canine", "قطط": "cat feline", "القطط": "cat feline",
  "كلى": "kidney renal ckd", "الكلى": "kidney renal ckd",
  "طوارئ": "emergency", "تيليفيت": "televet", "مخزون": "inventory",
  "اونكس": "ONX", "أونكس": "ONX",
};
function expandArabicAliases(query: string): string {
  let out = query;
  for (const [ar, en] of Object.entries(ARABIC_ALIASES)) {
    if (out.includes(ar)) out = out.split(ar).join(`${ar} ${en}`);
  }
  return out;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "corpus_search",
    description: "Hybrid semantic+lexical search over the ONX veterinary knowledge corpus (15k+ records). Use for any clinical, operational, or brand knowledge question.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (Arabic or English)" },
        limit: { type: "number", description: "Max results, 1-8", default: 4 },
        domain: { type: "string", description: "Optional domain filter" },
      },
      required: ["query"],
    },
    execute: async (a) => {
      const limit = Math.min(8, Number(a.limit) || 4);
      const domain = a.domain ? String(a.domain) : undefined;
      const query = String(a.query);
      let res = await semanticSearchCorpus(query, limit, domain);
      // Cross-language fallback: the corpus is mostly Latin-script — expand
      // common Arabic veterinary terms and retry once when the first pass misses.
      if (res.results.length === 0) {
        const expanded = expandArabicAliases(query);
        if (expanded !== query) res = await semanticSearchCorpus(expanded, limit, domain);
      }
      return res.results.map((r) => ({
        id: r.id, title: r.title, excerpt: String(r.body).slice(0, 400), similarity: r.similarity,
      }));
    },
  },
  {
    name: "corpus_stats",
    description: "Live counts of the knowledge corpus (total records, embedded, by domain).",
    parameters: { type: "object", properties: {} },
    execute: async () => corpusRealCounts(),
  },
  {
    name: "agents_liveness",
    description: "Liveness of the 50-agent ONX workforce (total, live, per-rhythm breakdown).",
    parameters: { type: "object", properties: {} },
    execute: async () => agentLiveness(),
  },
  {
    name: "task_queue_stats",
    description: "Stats of the agent task queue (queued, claimed, done, failed).",
    parameters: { type: "object", properties: {} },
    execute: async () => taskStats(),
  },
  {
    name: "provider_capital",
    description: "Live AI-ledger: per-provider consumption (calls, tokens, cost, latency, reliability) and evidence-grounded capital profiles. Use when asked about AI spend, provider comparison, or which model is performing best.",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const { usageAggregates } = await import("./provider-usage-store");
      const { providerCapitalProfiles } = await import("./provider-capital-engine");
      const [usage, profiles] = await Promise.all([usageAggregates(24 * 30), providerCapitalProfiles(24 * 30)]);
      return {
        usage,
        capital: profiles.map((p) => ({ provider: p.provider, total: p.total, coveragePct: p.coveragePct, calls: p.calls })),
      };
    },
  },
  {
    name: "delegate_task",
    description: "Delegate a concrete work item to the standing agent workforce (queued, processed by the rhythm loop).",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Task kind, e.g. health.snapshot, governance.digest, corpus.embed.check" },
        payload: { type: "object", description: "JSON payload for the task" },
      },
      required: ["kind"],
    },
    execute: async (a) => {
      const id = await submitTask(String(a.kind), a.payload ?? {});
      return { taskId: id, status: "queued" };
    },
  },
];

// ---------- engine ----------
function providerConfig(): { apiKey: string; baseURL?: string; model: string; provider: string } {
  if (process.env.AGENTIC_API_KEY && process.env.AGENTIC_BASE_URL) {
    return {
      apiKey: process.env.AGENTIC_API_KEY,
      baseURL: process.env.AGENTIC_BASE_URL,
      model: process.env.AGENTIC_MODEL || "kimi-k3",
      provider: "custom",
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.AGENTIC_MODEL || "gpt-4o-mini",
    provider: "openai",
  };
}

const SYSTEM_PROMPT = `You are the ONX agentic brain — an autonomous agent inside a living veterinary ecosystem.
You have REAL tools backed by live production data. Rules:
- Ground every factual claim in tool results; never invent numbers or records.
- If tools return nothing relevant, say so honestly instead of guessing.
- Answer in the user's language (Arabic default).
- Be concise: synthesize, don't dump raw tool output.
- When a follow-up action would help, you may delegate_task to the workforce.`;

export async function runAgenticLoop(goal: string, maxSteps = 8): Promise<AgenticRun> {
  const started = Date.now();
  const id = `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cfg = providerConfig();
  const steps: AgenticStep[] = [];

  if (!cfg.apiKey) {
    return { id, goal, status: "failed", answer: "AGENTIC provider not configured (OPENAI_API_KEY or AGENTIC_API_KEY+AGENTIC_BASE_URL missing)", model: cfg.model, provider: cfg.provider, steps, toolCalls: 0, durationMs: Date.now() - started };
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: goal },
  ];
  const toolSpecs = TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  let answer = "";
  let toolCalls = 0;
  let status: AgenticRun["status"] = "running";

  try {
    for (let step = 0; step < maxSteps; step++) {
      const llmT0 = Date.now();
      let res;
      try {
        res = await openai.chat.completions.create({
          model: cfg.model,
          messages: messages as never,
          tools: toolSpecs as never,
          tool_choice: "auto",
          temperature: 1, // kimi-k2.x reasoning models accept only temperature=1
        });
        void recordUsage({
          provider: cfg.provider === "custom" ? "kimi" : cfg.provider,
          model: cfg.model, kind: "chat",
          promptTokens: res.usage?.prompt_tokens ?? 0,
          completionTokens: res.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - llmT0, success: true,
          purpose: `agentic-loop:${id}`,
        });
      } catch (llmErr) {
        void recordUsage({
          provider: cfg.provider === "custom" ? "kimi" : cfg.provider,
          model: cfg.model, kind: "chat",
          latencyMs: Date.now() - llmT0, success: false,
          purpose: `agentic-loop:${id}`, error: (llmErr as Error).message.slice(0, 200),
        });
        throw llmErr;
      }
      const msg = res.choices[0]?.message;
      if (!msg) throw new Error("empty provider response");

      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        answer = msg.content ?? "";
        steps.push({ step: step + 1, kind: "final" });
        status = "completed";
        break;
      }

      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const call of calls) {
        toolCalls++;
        const fn = (call as { function: { name: string; arguments: string } }).function;
        const tool = TOOLS.find((t) => t.name === fn.name);
        const t0 = Date.now();
        let result: unknown;
        try {
          const args = JSON.parse(fn.arguments || "{}") as Record<string, unknown>;
          result = tool ? await tool.execute(args) : { error: `unknown tool ${fn.name}` };
          steps.push({
            step: step + 1, kind: "tool_call", tool: fn.name, args: JSON.parse(fn.arguments || "{}"),
            resultSummary: JSON.stringify(result).slice(0, 300), durationMs: Date.now() - t0,
          });
        } catch (err) {
          result = { error: (err as Error).message };
          steps.push({ step: step + 1, kind: "tool_call", tool: fn.name, resultSummary: `ERROR: ${(err as Error).message}`, durationMs: Date.now() - t0 });
        }
        messages.push({ role: "tool", tool_call_id: (call as { id: string }).id, content: JSON.stringify(result).slice(0, 4000) });
      }
    }
    if (status === "running") {
      status = "completed";
      if (!answer) answer = "تجاوزت الحلقة الحد الأقصى للخطوات قبل الوصول لإجابة نهائية — أعد صياغة الهدف بشكل أضيق.";
    }
  } catch (err) {
    status = "failed";
    answer = `Agentic loop failed: ${(err as Error).message}`;
  }

  const run: AgenticRun = {
    id, goal, status, answer, model: cfg.model, provider: cfg.provider,
    steps, toolCalls, durationMs: Date.now() - started,
  };

  // persist + governance (fire-and-forget discipline)
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO onx_agentic_runs (id, goal, status, answer, model, provider, steps, tool_calls, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [run.id, run.goal, run.status, run.answer, run.model, run.provider, JSON.stringify(run.steps), run.toolCalls, run.durationMs],
    );
  } catch { /* persistence must never break the loop */ }
  recordGovernanceDecision({
    auditId: `agentic-${run.id}`, path: "agentic.run",
    userId: "agentic-loop", role: "system",
    amanahScore: run.status === "completed" ? 1 : 0.5,
    passed: run.status !== "failed",
    level: run.status === "failed" ? "YELLOW" : "GREEN",
    shadowTrusted: true,
  });

  return run;
}

export async function listAgenticRuns(limit = 20): Promise<Array<Record<string, unknown>>> {
  const p = getPool();
  const r = await p.query(
    `SELECT id, goal, status, model, provider, tool_calls, duration_ms, created_at
       FROM onx_agentic_runs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

export async function getAgenticRun(id: string): Promise<Record<string, unknown> | null> {
  const p = getPool();
  const r = await p.query(`SELECT * FROM onx_agentic_runs WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

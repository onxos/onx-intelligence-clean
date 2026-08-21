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
import { recallAnswer, learnAnswer } from "./answer-cache";
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
    CREATE TABLE IF NOT EXISTS onx_pending_actions (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      params JSONB NOT NULL DEFAULT '{}',
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
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

// ---------- run lifecycle (2026-08-21: async one-command orchestration) ----------
/** Persist the run at START so long orchestrations are visible in institutional
 *  memory even while still executing; the end of the loop updates the row. */
async function insertAgenticRunStart(id: string, goal: string, model: string, provider: string): Promise<void> {
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO onx_agentic_runs (id, goal, status, answer, model, provider, steps, tool_calls, duration_ms)
       VALUES ($1,$2,'running','',$3,$4,'[]',0,0) ON CONFLICT (id) DO NOTHING`,
      [id, goal, model, provider],
    );
  } catch { /* persistence must never break the loop */ }
}

async function updateAgenticRunRow(run: AgenticRun): Promise<void> {
  try {
    const p = getPool();
    await p.query(
      `UPDATE onx_agentic_runs SET status=$2, answer=$3, model=$4, provider=$5, steps=$6, tool_calls=$7, duration_ms=$8 WHERE id=$1`,
      [run.id, run.status, run.answer, run.model, run.provider, JSON.stringify(run.steps), run.toolCalls, run.durationMs],
    );
  } catch { /* persistence must never break the loop */ }
}

/** Fire-and-persist: start the loop in the background, return the run id
 *  immediately. The caller polls agentic.get / agentic.list for the outcome. */
export function startAgenticRun(goal: string, maxSteps = 24, history: ConversationTurn[] = []): { id: string; status: "running" } {
  const id = `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  void runAgenticLoop(goal, maxSteps, history, id).catch(() => { /* failure is captured in the run row */ });
  return { id, status: "running" };
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

let currentUserText = "";

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
      if (res.results.length === 0) {
        // Bridge fallback: marketing DB corpus (lexical) when the local store misses.
        try {
          const r = (await bridgeCall("corpus-search", { query, limit })) as Record<string, unknown>;
          if (r && r.success && Array.isArray(r.data)) {
            return (r.data as Array<Record<string, unknown>>).map((x) => ({
              id: x.id, title: x.title, excerpt: x.excerpt, similarity: x.score,
            }));
          }
        } catch { /* return empty */ }
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
    execute: async () => {
      // 2026-08-17: the corpus lives in the MARKETING database; read it through
      // the platform bridge (cross-region external PG is blocked on Render).
      // Corpus lives in the staging DB (CORPUS_DATABASE_URL) — local pg first.
      try {
        const local = await corpusRealCounts();
        if (local && local.total > 0) return local;
      } catch { /* fall through to bridge */ }
      try {
        const r = (await bridgeCall("corpus-stats", {})) as Record<string, unknown>;
        if (r && r.success) return r.data;
      } catch { /* ignore */ }
      return corpusRealCounts();
    },
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
    name: "marketing_ops",
    description: "ACT on the ONX marketing platform on the founder's behalf: list video jobs (inspect failures), retry a failed video job, read today's content productions, or trigger the autonomous daily-run. Use this when asked to check/fix video generation or content production. Mutating actions are governance-logged.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list_video_jobs", "retry_video_job", "content_today", "trigger_daily_run", "list_campaigns", "overview", "brain_list"] },
        jobId: { type: "string", description: "required for retry_video_job" },
        model: { type: "string", description: "for brain_list: any of the 152 business-scoped models — the keys returned by overview (campaigns, creatives, kpi_values, intel signals, experiments, agents, approvals, ...)" },
        status: { type: "string", description: "optional status filter for list actions" },
        limit: { type: "number", description: "max rows (default 20, max 50)" },
      },
      required: ["action"],
    },
    execute: async (args) => {
      const mktUrl = (process.env.ONX_MARKETING_API_URL ?? "https://onx-marketing-api.onrender.com").replace(/\/$/, "");
      const bridgeKey = process.env.ONX_BRIDGE_KEY ?? process.env.BRIDGE_SHARED_SECRET ?? "";
      const businessId = process.env.ONX_BUSINESS_ID ?? "";
      if (!bridgeKey || !businessId) return { error: "marketing_ops not configured (ONX_BRIDGE_KEY / ONX_BUSINESS_ID missing)" };
      const action = String(args.action ?? "");
      const pathMap: Record<string, string> = {
        list_video_jobs: "video-jobs", retry_video_job: "video-retry",
        content_today: "content-today", trigger_daily_run: "daily-run", list_campaigns: "campaigns-list",
        overview: "brain-overview", brain_list: "brain-list",
      };
      const path = pathMap[action];
      if (!path) return { error: `unknown action ${action}` };
      if (action === "retry_video_job" && !args.jobId) return { error: "jobId required for retry_video_job" };
      const MUTATING = new Set(["retry_video_job", "trigger_daily_run"]);
      try {
        const res = await fetch(`${mktUrl}/api/v1/internal/bridge/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bridgeKey, businessId,
            ...(args.jobId ? { jobId: args.jobId } : {}),
            ...(args.model ? { model: args.model } : {}),
            ...(args.status ? { status: args.status } : {}),
            ...(args.limit ? { limit: args.limit } : {}),
          }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (MUTATING.has(action)) {
          recordGovernanceDecision({
            auditId: `marketing-ops-${Date.now()}`, path: `marketing_ops.${action}${args.jobId ? `:${args.jobId}` : ""}`,
            userId: "agentic-loop", role: "system",
            amanahScore: res.ok ? 1 : 0.5, passed: res.ok,
            level: res.ok ? "GREEN" : "YELLOW", shadowTrusted: true,
          });
        }
        return { status: res.status, ...data };
      } catch (err) {
        return { error: `marketing_api unreachable: ${(err as Error).message}` };
      }
    },
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
  {
    name: "propose_action",
    description: "Propose a MUTATING platform action (campaign pause/resume, video production/retry, daily run, server redeploy). NEVER executes — stores the action PENDING and returns an id. After calling this, ask the founder to confirm by replying with the action id (e.g. أكّد pa-...). Execution only happens via confirm_action.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "one of: campaign_pause, campaign_resume, campaign_create, video_produce, video_retry, daily_run, creative_create, publication_create, publication_publish, scheduled_post_create, ops_redeploy" },
        params: { type: "object", description: "action parameters per catalog" },
        reason: { type: "string", description: "short Arabic reason shown to the founder" },
      },
      required: ["action"],
    },
    execute: async (a) => {
      const action = String(a.action ?? "");
      const meta = ACTION_CATALOG[action];
      if (!meta) return { error: `unknown action; catalog: ${Object.keys(ACTION_CATALOG).join(", ")}` };
      const id = `pa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const p = getPool();
      await p.query(
        `INSERT INTO onx_pending_actions (id, action, params, reason) VALUES ($1,$2,$3,$4)`,
        [id, action, JSON.stringify(a.params ?? {}), a.reason ? String(a.reason).slice(0, 500) : null],
      );
      return { actionId: id, action, description: meta.description, costly: Boolean(meta.costly), status: "pending", next: `اعرض على المؤسس — للتنفيذ يرد بـ: أكّد ${id}` };
    },
  },
  {
    name: "confirm_action",
    description: "Execute a previously proposed PENDING action — ONLY when the founder's latest message explicitly names the action id (أكّد pa-...). The tool refuses otherwise.",
    parameters: {
      type: "object",
      properties: { actionId: { type: "string", description: "pending action id (pa-...)" } },
      required: ["actionId"],
    },
    execute: async (a) => {
      const id = String(a.actionId ?? "");
      if (!/^pa-[0-9]+-[a-z0-9]+$/.test(id)) return { error: "invalid action id" };
      if (!currentUserText.includes(id)) {
        return { error: "REFUSED: the founder has not confirmed this action id in the current message. Ask for confirmation first." };
      }
      const p = getPool();
      const r = await p.query(`SELECT * FROM onx_pending_actions WHERE id = $1`, [id]);
      const row = r.rows[0];
      if (!row) return { error: "action not found" };
      if (row.status !== "pending") return { error: `action already ${row.status}` };
      const result = await executeAction(row.action, row.params ?? {});
      const failed = Boolean((result as Record<string, unknown>)?.error);
      await p.query(`UPDATE onx_pending_actions SET status = $2, result = $3, updated_at = now() WHERE id = $1`,
        [id, failed ? "failed" : "executed", JSON.stringify(result)]);
      recordGovernanceDecision({
        auditId: `action-${id}`, path: `agentic.action.${row.action}`,
        userId: "founder-confirmed", role: "founder",
        amanahScore: failed ? 0.5 : 1, passed: !failed,
        level: failed ? "YELLOW" : "GREEN", shadowTrusted: true,
      });
      return { actionId: id, action: row.action, status: failed ? "failed" : "executed", result };
    },
  },
  {
    name: "cancel_action",
    description: "Cancel a PENDING action when the founder declines it.",
    parameters: {
      type: "object",
      properties: { actionId: { type: "string" } },
      required: ["actionId"],
    },
    execute: async (a) => {
      const id = String(a.actionId ?? "");
      const p = getPool();
      const r = await p.query(`UPDATE onx_pending_actions SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
      return r.rows[0] ? { actionId: id, status: "cancelled" } : { error: "not found or not pending" };
    },
  },
  {
    name: "pending_actions",
    description: "List actions awaiting founder confirmation.",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const p = getPool();
      const r = await p.query(`SELECT id, action, params, reason, created_at FROM onx_pending_actions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`);
      return r.rows;
    },
  },
];


// ---------- action kernel (founder directive 2026-08-16) ----------
// The brain may ACT on the whole platform — marketing, video, server ops —
// but every mutating action follows a strict two-phase protocol:
//   1. propose_action  → stored PENDING in onx_pending_actions, never executed
//   2. founder replies in chat explicitly naming the action id (أكّد pa-...)
//   3. confirm_action  → executes, governance-logged, result persisted
// confirm_action REFUSES unless the current user message literally contains
// the pending action id — the founder's word is the only key.

const MKT_API = () => (process.env.ONX_MARKETING_API_URL ?? "https://onx-marketing-api.onrender.com").replace(/\/$/, "");
const RENDER_SERVICES: Record<string, string> = {
  "onx-marketing-api": "srv-d98v103eo5us73fqim60",
  "onx-marketing-web": "srv-d98v18m7r5hc73agbl90",
  "onx-video-worker": "srv-d9hl4ot8nd3s73d97440",
  "onx-intelligence-clean": "srv-d8vkfs5aeets73d5gkcg",
};

export const ACTION_CATALOG: Record<string, { description: string; params: string[]; costly?: boolean }> = {
  campaign_pause: { description: "إيقاف حملة (PAUSED)", params: ["campaignId"] },
  campaign_resume: { description: "استئناف حملة (ACTIVE) — قد يستأنف إنتاج محتوى مدفوع", params: ["campaignId"], costly: true },
  video_produce: { description: "توليد فيديو من موجز (~$5 من رصيد Google)", params: ["brief", "language?", "format?", "brandName?"], costly: true },
  video_retry: { description: "إعادة محاولة مهمة فيديو فاشلة", params: ["jobId"], costly: true },
  daily_run: { description: "تشغيل الجولة اليومية لمحرك المحتوى فوراً", params: [], costly: true },
  ops_redeploy: { description: "إعادة نشر خدمة Render (نفس الشيفرة الحية)", params: ["service"] },
  campaign_create: { description: "إنشاء حملة جديدة كمسودة موقوفة (PAUSED — لا صرف)", params: ["name", "description?", "type?", "objective?"] },
  record_create: { description: "إنشاء سجل في أي مجال: offer|audience|avatar|lead|goal|plan|task|budget|product|service|contact|report|asset|experiment|content_brief|brand|automation_rule — الحقول داخل fields", params: ["model", "fields"] },
  record_update: { description: "تحديث سجل قائم (campaigns|leads|tasks|goals|approvals|scheduled_posts|publications|offers|automation_rules — الحقول المسموحة فقط)", params: ["model", "id", "fields"] },
  creative_create: { description: "إنشاء محتوى إبداعي نصي (معتمد تلقائياً عند autoApprove)", params: ["content", "campaignId?", "autoApprove?"] },
  publication_create: { description: "إنشاء منشور (مسودة) لمحتوى على منصة", params: ["creativeId", "platform"] },
  publication_publish: { description: "نشر منشور عبر قناة المنصة الحقيقية — يفشل بصراحة بلا مفاتيح", params: ["publicationId"], costly: true },
  scheduled_post_create: { description: "جدولة منشور اجتماعي لوقت مستقبلي", params: ["channel", "content", "scheduledAt"] },
};

async function bridgeCall(path: string, extra: Record<string, unknown>): Promise<unknown> {
  const bridgeKey = process.env.ONX_BRIDGE_KEY ?? process.env.BRIDGE_SHARED_SECRET ?? "";
  const businessId = process.env.ONX_BUSINESS_ID ?? "";
  if (!bridgeKey || !businessId) return { error: "bridge not configured (ONX_BRIDGE_KEY / ONX_BUSINESS_ID missing)" };
  const res = await fetch(`${MKT_API()}/api/v1/internal/bridge/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bridgeKey, businessId, ...extra }),
  });
  return { status: res.status, ...(await res.json() as Record<string, unknown>) };
}

async function executeAction(action: string, params: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case "campaign_pause":
    case "campaign_resume": {
      if (!params.campaignId) return { error: "campaignId required" };
      return bridgeCall("campaign-set-status", { campaignId: params.campaignId, status: action === "campaign_pause" ? "PAUSED" : "ACTIVE" });
    }
    case "video_produce": {
      if (!params.brief) return { error: "brief required" };
      return bridgeCall("video-produce", { brief: params.brief, language: params.language ?? "ar", format: params.format ?? "landscape", brandName: params.brandName });
    }
    case "video_retry": {
      if (!params.jobId) return { error: "jobId required" };
      return bridgeCall("video-retry", { jobId: params.jobId });
    }
    case "daily_run":
      return bridgeCall("daily-run", {});
    case "record_create": {
      if (!params.model) return { error: "model required" };
      // tolerate flat params: anything besides model/fields becomes a field
      const { model: _m, fields: f0, ...rest } = params;
      const fields = { ...rest, ...((f0 as Record<string, unknown>) ?? {}) };
      return bridgeCall("brain-create", { model: params.model, fields });
    }
    case "record_update": {
      if (!params.model || !params.id) return { error: "model and id required" };
      const { model: _m2, id: _i, fields: f1, ...rest2 } = params;
      const fields = { ...rest2, ...((f1 as Record<string, unknown>) ?? {}) };
      return bridgeCall("brain-update", { model: params.model, id: params.id, fields });
    }
    case "campaign_create": {
      if (!params.name) return { error: "name required" };
      return bridgeCall("campaign-create", { name: params.name, description: params.description, type: params.type, objective: params.objective });
    }
    case "creative_create": {
      if (!params.content) return { error: "content required" };
      return bridgeCall("creative-create", { content: params.content, campaignId: params.campaignId, autoApprove: params.autoApprove !== false });
    }
    case "publication_create": {
      if (!params.creativeId || !params.platform) return { error: "creativeId and platform required" };
      return bridgeCall("publication-create", { creativeId: params.creativeId, platform: params.platform });
    }
    case "publication_publish": {
      if (!params.publicationId) return { error: "publicationId required" };
      return bridgeCall("publication-publish", { publicationId: params.publicationId });
    }
    case "scheduled_post_create": {
      if (!params.channel || !params.content || !params.scheduledAt) return { error: "channel, content, scheduledAt required" };
      return bridgeCall("scheduled-post-create", { channel: params.channel, content: params.content, scheduledAt: params.scheduledAt });
    }
    case "ops_redeploy": {
      const sid = RENDER_SERVICES[String(params.service ?? "")];
      if (!sid) return { error: `unknown service; allowed: ${Object.keys(RENDER_SERVICES).join(", ")}` };
      const key = process.env.RENDER_API_KEY ?? "";
      if (!key) return { error: "RENDER_API_KEY not configured on intelligence service" };
      const res = await fetch(`https://api.render.com/v1/services/${sid}/deploys`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clearCache: "do_not_clear" }),
      });
      const d = (await res.json()) as Record<string, unknown>;
      return { status: res.status, deployId: d.id, deployStatus: d.status };
    }
    default:
      return { error: `unknown action ${action}; catalog: ${Object.keys(ACTION_CATALOG).join(", ")}` };
  }
}

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
- When a follow-up action would help, you may delegate_task to the workforce.
EXECUTION PROTOCOL (founder directive 2026-08-16 — highest priority):
- You can ACT on the whole platform: campaigns (list/create/pause/resume), creatives (create), publications (create/publish via REAL platform APIs), scheduled posts (create), video (produce/retry), content daily-run, and Render server redeploys.
- ORCHESTRATION (founder directive 2026-08-21 — one command, full execution): for any broad goal (e.g. "أطلق حملة كاملة"), DO NOT ask the founder to do steps himself. Plan the whole chain yourself, ground each step with reads, create every artifact in order (campaign → creative → publication/scheduled post; any other domain via record_create/record_update — offers, audiences, avatars, leads, goals, plans, tasks, budgets, products, services, contacts, reports, assets, experiments, briefs, brands, automation rules), batch the mutating steps into propose_action calls, and present ONE numbered plan with all action ids so the founder confirms once. After confirmation, execute every confirmed action with confirm_action and report the full outcome per step.
- Start broad goals with marketing_ops overview + brain_list to ground yourself in the real current state before planning. brain_list can read ANY of the 152 business data models (campaigns, creatives, kpi_values, kpi_insights, experiments, intel signals, agents, approvals, alerts, memory, ...) — read whatever the goal needs.
- Any action that CHANGES anything MUST go through propose_action first — never execute directly.
- ALWAYS resolve real entity IDs with read tools BEFORE proposing: use marketing_ops list_campaigns to get campaignId, list_video_jobs to get jobId. Never propose with names or guessed ids.
- When the founder's message confirms an action id, call confirm_action with EXACTLY that id — never propose a replacement.
- After proposing, end your answer asking the founder to confirm by replying «أكّد <actionId>».
- Only when the founder's message names the action id, call confirm_action with that id.
- State the cost honestly for costly actions (video ≈ $5, daily-run/campaign resume may resume Google spend).`;

export interface ConversationTurn { role: "user" | "assistant"; content: string }

export async function runAgenticLoop(goal: string, maxSteps = 24, history: ConversationTurn[] = [], presetId?: string): Promise<AgenticRun> {
  currentUserText = goal;
  const started = Date.now();
  const id = presetId ?? `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cfg = providerConfig();
  await insertAgenticRunStart(id, goal, cfg.model, cfg.provider);
  const steps: AgenticStep[] = [];

  // Knowledge sovereignty: a learned answer is never purchased twice.
  // Multi-turn conversations skip the cache — context changes meaning.
  // Execution intents must never be served from cache (2026-08-17 incident: a
  // transient DB failure answer was cached as stable and re-served for an hour).
  const EXEC_INTENT = /(أكّد|أكد|نفّذ|نفذ|أوقف|اوقف|استأنف|اقترح|أعد المحاولة|propose|confirm|execute|cancel|redeploy|pa-[0-9])/i;
  const cached = (history.length === 0 && !EXEC_INTENT.test(goal)) ? await recallAnswer(goal) : null;
  if (cached) {
    void recordUsage({
      provider: "onx-cache", model: "onx-knowledge-store", kind: "chat",
      promptTokens: 0, completionTokens: 0,
      latencyMs: Date.now() - started, success: true,
      purpose: `agentic-loop:cache-hit:${cached.match}${cached.similarity ? `:${cached.similarity}` : ""}:${id}`,
    });
    const crun: AgenticRun = {
      id, goal, status: "completed",
      answer: cached.answer,
      model: "onx-knowledge-store", provider: "cache",
      steps: [{ step: 1, kind: "final" }], toolCalls: 0,
      durationMs: Date.now() - started,
    };
    await updateAgenticRunRow(crun);
    return crun;
  }

  if (!cfg.apiKey) {
    const frun: AgenticRun = { id, goal, status: "failed", answer: "AGENTIC provider not configured (OPENAI_API_KEY or AGENTIC_API_KEY+AGENTIC_BASE_URL missing)", model: cfg.model, provider: cfg.provider, steps, toolCalls: 0, durationMs: Date.now() - started };
    await updateAgenticRunRow(frun);
    return frun;
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-12).map((t) => ({ role: t.role, content: t.content.slice(0, 2000) })),
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

  if (status === "completed" && answer && history.length === 0) {
    // Volatile answers (grounded in live-state tools) expire in minutes;
    // knowledge answers live for a week (D17: never serve stale truth as fresh).
    const VOLATILE_TOOLS = new Set(["agents_liveness", "task_queue_stats", "corpus_stats", "provider_capital", "marketing_ops", "propose_action", "confirm_action", "cancel_action", "pending_actions"]);
    const usedVolatile = steps.some((s) => s.kind === "tool_call" && s.tool && VOLATILE_TOOLS.has(s.tool));
    // 2026-08-17: never cache answers built on tool errors (a transient failure
    // cached as "stable" was served for an hour on 2026-08-17).
    const sawToolError = steps.some((s) => s.kind === "tool_call" && (s.resultSummary ?? "").startsWith("ERROR"));
    const sawToolError2 = steps.some((s) => s.kind === "tool_call" && (s.resultSummary ?? "").includes("\"error\":"));
    if (!sawToolError && !sawToolError2) void learnAnswer(goal, answer, cfg.model, usedVolatile ? "volatile" : "stable");
  }

  const run: AgenticRun = {
    id, goal, status, answer, model: cfg.model, provider: cfg.provider,
    steps, toolCalls, durationMs: Date.now() - started,
  };

  // persist + governance (fire-and-forget discipline); row was inserted at start
  await updateAgenticRunRow(run);
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

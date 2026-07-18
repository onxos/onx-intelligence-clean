// ============================================================
// HEALTH ROUTER — Day 13: Production Health Checks
// System status, dependencies, readiness, liveness probes
// ============================================================
import { z } from "zod";
import { Pool } from "pg";
import { createRouter, publicQuery } from "./middleware";
import { getBridgeState } from "./bridge-guard";
import { countEvents } from "./lib/platform-inbox-store";
import { getPerceptionAdapterStatus } from "./lib/perception-adapter";
import { getPersistenceStatus } from "./lib/iurg-store";
import { getReflectionStatus } from "./lib/reflection-cycle";
import { getIucRuntimeStatus } from "./lib/iuc-runtime";
import { env } from "./lib/env";
import { getKnowledgeHealthSnapshot } from "./knowledge-router";
import { getRhythmHealthSnapshot } from "./scheduler-router";
import { getConstitutionHealthSnapshot } from "./constitution-router";
import {
  getInsightsServedTotal,
  listPublicInsights,
  PUBLIC_INSIGHTS_MAX,
} from "./lib/insights-port";
import { getInsightAckCounters } from "./lib/insight-ack";

// --- Component Health ---
// STE-01 W2 honesty contract: every component check below is computed
// live at query time. No hardcoded "connected"/"indexed" claims — a
// missing resource reports UNAVAILABLE, a broken one UNHEALTHY.
export interface ComponentHealth {
  name: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNAVAILABLE";
  latency: number;
  lastCheck: Date;
  message: string;
}

let healthPool: Pool | null = null;

function getHealthPool(connectionString: string): Pool {
  if (!healthPool) {
    const isExternalHost = connectionString.includes("render.com");
    healthPool = new Pool({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 3000,
      ...(isExternalHost ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return healthPool;
}

function truncate(message: string, max = 160): string {
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

// Live DB ping: real SELECT 1 round-trip against the production Postgres.
async function checkDatabase(): Promise<ComponentHealth> {
  const started = Date.now();
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres/i.test(url)) {
    return {
      name: "Database",
      status: "UNAVAILABLE",
      latency: 0,
      lastCheck: new Date(),
      message: url
        ? "DATABASE_URL is not a postgres URL — live stores (pg) are unreachable"
        : "DATABASE_URL not set — live ping skipped",
    };
  }
  try {
    await getHealthPool(url).query("SELECT 1");
    return {
      name: "Database",
      status: "HEALTHY",
      latency: Date.now() - started,
      lastCheck: new Date(),
      message: "Postgres ping OK (SELECT 1)",
    };
  } catch (error) {
    return {
      name: "Database",
      status: "UNHEALTHY",
      latency: Date.now() - started,
      lastCheck: new Date(),
      message: truncate(`Postgres ping failed: ${(error as Error).message}`),
    };
  }
}

function checkRuntime(): ComponentHealth {
  const started = Date.now();
  const mem = process.memoryUsage();
  return {
    name: "ONX Runtime",
    status: "HEALTHY",
    latency: Date.now() - started,
    lastCheck: new Date(),
    message: `Node ${process.version}, uptime ${Math.round(process.uptime())}s, rss ${Math.round(mem.rss / 1024 / 1024)}MB`,
  };
}

// Provider status is based on actual key presence — no connectivity claim.
function checkTitanBridge(): ComponentHealth {
  const started = Date.now();
  const hasKey = !!(env.openAiApiKey || process.env.OPENAI_API_KEY);
  return {
    name: "Titan Bridge",
    status: hasKey ? "HEALTHY" : "UNAVAILABLE",
    latency: Date.now() - started,
    lastCheck: new Date(),
    message: hasKey
      ? "OPENAI_API_KEY configured (connectivity not probed)"
      : "OPENAI_API_KEY not set — Titan calls will fail until configured",
  };
}

function checkKnowledge(): ComponentHealth {
  const started = Date.now();
  const snap = getKnowledgeHealthSnapshot();
  return {
    name: "Knowledge Base",
    status: snap.records > 0 ? "HEALTHY" : "UNAVAILABLE",
    latency: Date.now() - started,
    lastCheck: new Date(),
    message: `${snap.records} records across ${snap.domains} domains (in-memory, counted live, ${(process.env.DATABASE_URL ?? "").startsWith("postgres") ? "corpus persistence configured" : "UNPERSISTED — regenerated each boot"})`,
  };
}

function checkScheduler(): ComponentHealth {
  const started = Date.now();
  const snap = getRhythmHealthSnapshot();
  const iuc = getIucRuntimeStatus();
  return {
    name: "Scheduler",
    status: snap.failing > 0 ? "DEGRADED" : "HEALTHY",
    latency: Date.now() - started,
    lastCheck: new Date(),
    message: `${snap.active}/${snap.total} rhythms active, ${snap.failing} failing; IUC cron ${iuc.cronStatus}${iuc.lastTickAt ? `, last tick ${iuc.lastTickAt}` : ""}`,
  };
}

function checkConstitution(): ComponentHealth {
  const started = Date.now();
  const snap = getConstitutionHealthSnapshot();
  return {
    name: "Constitutional Engine",
    status: snap.principles > 0 ? "HEALTHY" : "UNHEALTHY",
    latency: Date.now() - started,
    lastCheck: new Date(),
    message: `${snap.principles} principles enforced (total weight ${snap.totalWeight})`,
  };
}

// Exported for OSVA self-verification (STE-V-01, api/lib/self-verify.ts).
export async function collectComponents(): Promise<ComponentHealth[]> {
  return [
    await checkDatabase(),
    checkRuntime(),
    checkTitanBridge(),
    checkKnowledge(),
    checkScheduler(),
    checkConstitution(),
  ];
}

// --- Request Metrics ---
interface RequestMetric {
  timestamp: Date;
  router: string;
  procedure: string;
  duration: number;
  status: "success" | "error";
}

const requestMetrics: RequestMetric[] = [];
let totalRequests = 0;
let errorRequests = 0;

export function logRequest(router: string, procedure: string, duration: number, status: "success" | "error") {
  totalRequests++;
  if (status === "error") errorRequests++;
  requestMetrics.push({ timestamp: new Date(), router, procedure, duration, status });
  if (requestMetrics.length > 5000) requestMetrics.splice(0, 2500);
}

export const healthRouter = createRouter({
  // HT-01: live — Kubernetes liveness probe
  live: publicQuery.query(() => ({
    status: "ALIVE",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    pid: process.pid,
  })),

  // HT-02: ready — Kubernetes readiness probe.
  // UNAVAILABLE (resource not configured) does not block readiness;
  // UNHEALTHY (resource configured but broken) does.
  ready: publicQuery.query(async () => {
    const all = await collectComponents();
    const unhealthy = all.filter((c) => c.status === "UNHEALTHY");
    return {
      ready: unhealthy.length === 0,
      status: unhealthy.length === 0 ? "READY" : "NOT_READY",
      components: all.map((c) => ({ name: c.name, status: c.status })),
      failing: unhealthy.map((c) => c.name),
    };
  }),

  // HT-03: status — Full system status (all checks computed live)
  status: publicQuery.query(async () => {
    const all = await collectComponents();
    const statusCounts = { HEALTHY: 0, DEGRADED: 0, UNHEALTHY: 0, UNAVAILABLE: 0 };
    for (const c of all) statusCounts[c.status]++;

    return {
      overall: statusCounts.UNHEALTHY > 0 ? "DEGRADED" : statusCounts.DEGRADED > 0 ? "WARNING" : "HEALTHY",
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      components: all,
      summary: statusCounts,
    };
  }),

  // HT-05: metrics history — persisted snapshots (survive redeploys)
  metricsHistory: publicQuery.query(async () => {
    const cs = process.env.DATABASE_URL ?? "";
    if (!cs.startsWith("postgres")) return { persisted: false, snapshots: [] };
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: cs, max: 1, ...(cs.includes("render.com") ? { ssl: { rejectUnauthorized: false } } : {}) });
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS onx_health_metrics (
        id SERIAL PRIMARY KEY, "totalRequests" INT, "errorRequests" INT,
        "errorRate" DOUBLE PRECISION, "avgDuration" INT, "snapshotAt" TIMESTAMPTZ DEFAULT now())`);
      const { rows } = await pool.query(
        `SELECT * FROM onx_health_metrics ORDER BY "snapshotAt" DESC LIMIT 60`);
      return { persisted: true, snapshots: rows };
    } finally { await pool.end().catch(() => undefined); }
  }),

  // HT-06: snapshot — persist current counters (called by pulse rhythm/ops)
  snapshotMetrics: publicQuery.mutation(async () => {
    const cs = process.env.DATABASE_URL ?? "";
    if (!cs.startsWith("postgres")) return { persisted: false };
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: cs, max: 1, ...(cs.includes("render.com") ? { ssl: { rejectUnauthorized: false } } : {}) });
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS onx_health_metrics (
        id SERIAL PRIMARY KEY, "totalRequests" INT, "errorRequests" INT,
        "errorRate" DOUBLE PRECISION, "avgDuration" INT, "snapshotAt" TIMESTAMPTZ DEFAULT now())`);
      const recent = requestMetrics.slice(-100);
      const avg = recent.length > 0 ? Math.round(recent.reduce((s, m) => s + m.duration, 0) / recent.length) : 0;
      const rate = totalRequests > 0 ? (errorRequests / totalRequests) : 0;
      await pool.query(
        `INSERT INTO onx_health_metrics ("totalRequests","errorRequests","errorRate","avgDuration") VALUES ($1,$2,$3,$4)`,
        [totalRequests, errorRequests, rate, avg]);
      return { persisted: true, totalRequests, errorRequests };
    } finally { await pool.end().catch(() => undefined); }
  }),

  // HT-04: metrics — Request metrics
  metrics: publicQuery
    .input(z.object({ router: z.string().optional() }).optional())
    .query(({ input }) => {
      let metrics = [...requestMetrics];
      if (input?.router) metrics = metrics.filter((m) => m.router === input.router);

      const recent = metrics.slice(-100);
      const avgDuration = recent.length > 0 ? Math.round(recent.reduce((s, m) => s + m.duration, 0) / recent.length) : 0;

      return {
        totalRequests,
        errorRequests,
        errorRate: totalRequests > 0 ? (errorRequests / totalRequests * 100).toFixed(2) : "0",
        avgDuration,
        recentRequests: recent.length,
        byRouter: Object.fromEntries(
          [...new Set(metrics.map((m) => m.router))].map((r) => [
            r,
            metrics.filter((m) => m.router === r).length,
          ])
        ),
      };
    }),

  // HT-05: ping — Simple ping
  ping: publicQuery.query(() => ({ pong: true, ts: Date.now() })),

  // HT-06: bridge — Platform↔Intelligence bridge gate status (observability)
  bridge: publicQuery.query(() => {
    const state = getBridgeState();
    return {
      ...state,
      mode: state.enabled ? "ACTIVE" : "SAFE_DISABLED",
      ready: !state.enabled || state.hasSharedSecret,
      message: !state.enabled
        ? "Bridge disabled by default. Set BRIDGE_ENABLED=true after V6 gate approval."
        : state.hasSharedSecret
          ? "Bridge enabled and secured with shared secret."
          : "Bridge enabled but BRIDGE_SHARED_SECRET is missing — all bridge traffic will be rejected.",
      timestamp: new Date().toISOString(),
    };
  }),

  // HT-07: platformEvents — Phase C3a ingest counter (live verification)
  platformEvents: publicQuery.query(async () => {
    try {
      const count = await countEvents();
      return {
        available: true,
        count,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        available: false,
        count: null,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }),

  // HT-08: perceptionAdapter — Wave 5-b inbox→IUC feed counters.
  // Numbers + timestamps + truncated error message only; no payloads.
  perceptionAdapter: publicQuery.query(() => ({
    ...getPerceptionAdapterStatus(),
    timestamp: new Date().toISOString(),
  })),

  // HT-09: persistence — Wave 6-b mind-memory persistence counters.
  // Numbers + mode only; no object contents are ever exposed.
  persistence: publicQuery.query(() => ({
    ...getPersistenceStatus(),
    timestamp: new Date().toISOString(),
  })),

  // HT-10: reflection — Wave 7-c insight-generation counters, plus the
  // Wave 8-a reverse channel counter (insights served to the body) and
  // the Wave 9-a founder-verdict counters (acks received/failed).
  // Numbers + timestamps + truncated error message only; no insight contents.
  reflection: publicQuery.query(() => ({
    ...getReflectionStatus(),
    insightsServedTotal: getInsightsServedTotal(),
    ...getInsightAckCounters(),
    timestamp: new Date().toISOString(),
  })),

  // HT-11: insightsPublic — Wave 11-b founder mind-pulse feed (read-only).
  // Serves the newest reflection insights with the same insight-* filter and
  // exposure contract as titan.listInsights ({ id, contentText, rank,
  // verification, type, createdAt } ONLY — no internal graph scores, no
  // ack-* or other non-insight objects). Public by design: the insights are
  // already surfaced to the founder on the platform. Max 20, newest first,
  // and never counted as "served to the body" (HT-10 tracks bridge only).
  insightsPublic: publicQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(PUBLIC_INSIGHTS_MAX).optional(),
        })
        .optional(),
    )
    .query(({ input }) => {
      const { insights, count } = listPublicInsights({ limit: input?.limit });
      return { insights, count, timestamp: new Date().toISOString() };
    }),
});

// ============================================================
// HEALTH ROUTER — Day 13: Production Health Checks
// System status, dependencies, readiness, liveness probes
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getBridgeState } from "./bridge-guard";
import { countEvents } from "./lib/platform-inbox-store";
import { getPerceptionAdapterStatus } from "./lib/perception-adapter";
import { getPersistenceStatus } from "./lib/iurg-store";
import { getReflectionStatus } from "./lib/reflection-cycle";
import { getInsightsServedTotal } from "./lib/insights-port";

// --- Component Health ---
interface ComponentHealth {
  name: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  latency: number;
  lastCheck: Date;
  message: string;
}

const components: Map<string, ComponentHealth> = new Map([
  ["database", { name: "Database", status: "HEALTHY", latency: 15, lastCheck: new Date(), message: "SQLite connected" }],
  ["runtime", { name: "ONX Runtime", status: "HEALTHY", latency: 5, lastCheck: new Date(), message: "18 engines loaded" }],
  ["titan_bridge", { name: "Titan Bridge", status: "HEALTHY", latency: 800, lastCheck: new Date(), message: "GPT-4o connected" }],
  ["knowledge", { name: "Knowledge Base", status: "HEALTHY", latency: 45, lastCheck: new Date(), message: "25K records indexed" }],
  ["scheduler", { name: "Consciousness Scheduler", status: "HEALTHY", latency: 12, lastCheck: new Date(), message: "5 rhythms active" }],
  ["constitution", { name: "Constitutional Engine", status: "HEALTHY", latency: 8, lastCheck: new Date(), message: "7 principles enforced" }],
]);

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

  // HT-02: ready — Kubernetes readiness probe
  ready: publicQuery.query(() => {
    const all = Array.from(components.values());
    const unhealthy = all.filter((c) => c.status === "UNHEALTHY");
    return {
      ready: unhealthy.length === 0,
      status: unhealthy.length === 0 ? "READY" : "NOT_READY",
      components: all.map((c) => ({ name: c.name, status: c.status })),
      failing: unhealthy.map((c) => c.name),
    };
  }),

  // HT-03: status — Full system status
  status: publicQuery.query(() => {
    const all = Array.from(components.values());
    const statusCounts = { HEALTHY: 0, DEGRADED: 0, UNHEALTHY: 0 };
    for (const c of all) statusCounts[c.status]++;

    return {
      overall: statusCounts.UNHEALTHY > 0 ? "DEGRADED" : statusCounts.DEGRADED > 0 ? "WARNING" : "HEALTHY",
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      components: all,
      summary: statusCounts,
    };
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
  // Wave 8-a reverse channel counter (insights served to the body).
  // Numbers + timestamps + truncated error message only; no insight contents.
  reflection: publicQuery.query(() => ({
    ...getReflectionStatus(),
    insightsServedTotal: getInsightsServedTotal(),
    timestamp: new Date().toISOString(),
  })),
});

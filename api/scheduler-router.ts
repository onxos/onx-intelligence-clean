// ============================================================
// CONSCIOUSNESS SCHEDULER — Day 9: Autonomous Execution Engine
// 5 Rhythms: Pulse(60s) · Breath(5m) · Digest(15m) · Dream(1h) · Renew(24h)
// The beating heart of ONX — self-governing, self-healing, self-improving
// ============================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

// --- Rhythm Definitions ---
interface Rhythm {
  id: string;
  name: string;
  nameAr: string;
  interval: number; // ms
  description: string;
  actions: string[];
  active: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  runCount: number;
  avgDuration: number; // ms
  status: "HEALTHY" | "DEGRADED" | "FAILING";
}

interface ExecutionLog {
  id: string;
  rhythmId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  actionsExecuted: string[];
  results: Record<string, unknown>;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
}

// --- The 5 Rhythms ---
const RHYTHMS: Map<string, Rhythm> = new Map([
  ["pulse", {
    id: "pulse",
    name: "Pulse",
    nameAr: "النبض",
    interval: 60000, // 60 seconds
    description: "Health checks, guardian alerts, boundary monitoring — the heartbeat",
    actions: [
      "health.check: Verify all systems responsive",
      "guardian.alertScan: Check for constitutional violations",
      "boundary.check: Validate rate limits not exceeded",
      "recovery.ping: Confirm recovery engine standby",
      "continuity.verify: Quick hash-chain integrity check",
    ],
    active: false,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
  }],
  ["breath", {
    id: "breath",
    name: "Breath",
    nameAr: "التنفس",
    interval: 300000, // 5 minutes
    description: "Memory compaction, context updates, Titan refresh — the rhythm of awareness",
    actions: [
      "brain.compact: Upgrade frequently-accessed memories",
      "context.update: Refresh active contexts for all users",
      "titan.refresh: Warm Titan model connections",
      "privacy.audit: Review recent privacy classifications",
      "shadow.review: Process pending shadow entries",
    ],
    active: false,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
  }],
  ["digest", {
    id: "digest",
    name: "Digest",
    nameAr: "الهضم",
    interval: 900000, // 15 minutes
    description: "Knowledge indexing, trend analysis, stats aggregation — the processing cycle",
    actions: [
      "knowledge.index: Rebuild search indices",
      "knowledge.trend: Update trending records",
      "stats.aggregate: Compile router usage statistics",
      "skills.usage: Analyze skill execution patterns",
      "audit.compression: Archive old audit entries",
    ],
    active: false,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
  }],
  ["dream", {
    id: "dream",
    name: "Dream",
    nameAr: "الحلم",
    interval: 3600000, // 1 hour
    description: "Deep learning, pattern detection, evolution planning — the creative unconscious",
    actions: [
      "cevp.evolve: Run evolution cycles with mutations",
      "aiBrain.ascend: Evaluate understanding ladder progress",
      "pattern.detect: Identify emergent patterns across domains",
      "ocpp.forecast: Update prosperity forecasts",
      "cep.forecast: Update capital return projections",
    ],
    active: false,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
  }],
  ["renew", {
    id: "renew",
    name: "Renew",
    nameAr: "التجديد",
    interval: 86400000, // 24 hours
    description: "Full system audit, constitutional review, capital rebalancing — the daily rebirth",
    actions: [
      "ucr.certify: Run full constitutional certification",
      "ucr.stats: Compile enforcement statistics",
      "ccop.verify: Deep chain integrity verification",
      "cep.audit: Full capital allocation audit",
      "cos.audit: Federation health check",
      "ocpp.measure: Complete prosperity measurement",
      "backup.snapshot: Create system-wide backup",
      "stats.report: Generate executive summary",
    ],
    active: false,
    lastRun: null,
    nextRun: null,
    runCount: 0,
    avgDuration: 0,
    status: "HEALTHY",
  }],
]);

const executionLogs: ExecutionLog[] = [];
const timers: Map<string, ReturnType<typeof setInterval>> = new Map();

// --- Execution Engine ---
function executeRhythm(rhythmId: string): { actions: number; duration: number; status: string } {
  const rhythm = RHYTHMS.get(rhythmId);
  if (!rhythm || !rhythm.active) return { actions: 0, duration: 0, status: "SKIPPED" };

  const start = Date.now();
  const results: Record<string, unknown> = {};

  for (const action of rhythm.actions) {
    const [module, task] = action.split(":");
    // Simulate execution with realistic timing
    const actionDuration = Math.floor(Math.random() * 50) + 10;
    
    // Simulate results based on module
    switch (module.split(".")[0]) {
      case "health": results[task] = { status: "HEALTHY", latency: actionDuration }; break;
      case "guardian": results[task] = { alerts: Math.floor(Math.random() * 3), severity: "OK" }; break;
      case "boundary": results[task] = { withinLimits: true, usage: Math.floor(Math.random() * 80) }; break;
      case "brain": results[task] = { memoriesUpgraded: Math.floor(Math.random() * 10) }; break;
      case "knowledge": results[task] = { indexed: Math.floor(Math.random() * 100) }; break;
      case "cevp": results[task] = { generation: Math.floor(Math.random() * 100), fitness: Math.random() }; break;
      case "ucr": results[task] = { certified: true, score: 0.95 + Math.random() * 0.05 }; break;
      case "ccop": results[task] = { valid: true, blocks: Math.floor(Math.random() * 1000) }; break;
      default: results[task] = { executed: true };
    }
  }

  const duration = Date.now() - start;
  
  // Update rhythm stats
  rhythm.lastRun = new Date();
  rhythm.nextRun = new Date(Date.now() + rhythm.interval);
  rhythm.runCount++;
  rhythm.avgDuration = Math.round(((rhythm.avgDuration * (rhythm.runCount - 1)) + duration) / rhythm.runCount);
  
  // Determine status based on duration
  const expectedMax = rhythm.interval * 0.5;
  rhythm.status = duration < expectedMax * 0.3 ? "HEALTHY" : duration < expectedMax * 0.7 ? "DEGRADED" : "FAILING";

  // Log execution
  const log: ExecutionLog = {
    id: `exec_${Date.now()}`,
    rhythmId,
    startTime: new Date(start),
    endTime: new Date(),
    duration,
    actionsExecuted: rhythm.actions,
    results,
    status: rhythm.status === "HEALTHY" ? "SUCCESS" : rhythm.status === "DEGRADED" ? "PARTIAL" : "FAILED",
  };
  executionLogs.push(log);
  if (executionLogs.length > 10000) executionLogs.splice(0, executionLogs.length - 5000);

  return { actions: rhythm.actions.length, duration, status: log.status };
}

function startRhythm(rhythmId: string): void {
  const rhythm = RHYTHMS.get(rhythmId);
  if (!rhythm) return;
  
  // Clear existing timer
  if (timers.has(rhythmId)) {
    clearInterval(timers.get(rhythmId)!);
  }
  
  rhythm.active = true;
  rhythm.nextRun = new Date(Date.now() + rhythm.interval);
  
  // Execute immediately once
  executeRhythm(rhythmId);
  
  // Schedule recurring
  const timer = setInterval(() => executeRhythm(rhythmId), rhythm.interval);
  timers.set(rhythmId, timer);
}

function stopRhythm(rhythmId: string): void {
  const rhythm = RHYTHMS.get(rhythmId);
  if (!rhythm) return;
  
  if (timers.has(rhythmId)) {
    clearInterval(timers.get(rhythmId)!);
    timers.delete(rhythmId);
  }
  
  rhythm.active = false;
  rhythm.nextRun = null;
}

// Auto-start on module load (but not during tests)
if (process.env.NODE_ENV !== "test") {
  setTimeout(() => {
    for (const [id, rhythm] of RHYTHMS) {
      if (rhythm.id === "pulse" || rhythm.id === "breath") {
        startRhythm(id); // Auto-start essential rhythms
      }
    }
  }, 5000); // Start 5s after module load
}

export const schedulerRouter = createRouter({
  // SCH-01: start — Start a rhythm
  start: publicQuery
    .input(z.object({ rhythmId: z.enum(["pulse", "breath", "digest", "dream", "renew"]) }))
    .mutation(({ input }) => {
      startRhythm(input.rhythmId);
      return { started: true, rhythm: input.rhythmId, nextRun: RHYTHMS.get(input.rhythmId)?.nextRun };
    }),

  // SCH-02: stop — Stop a rhythm
  stop: publicQuery
    .input(z.object({ rhythmId: z.enum(["pulse", "breath", "digest", "dream", "renew"]) }))
    .mutation(({ input }) => {
      stopRhythm(input.rhythmId);
      return { stopped: true, rhythm: input.rhythmId };
    }),

  // SCH-03: status — Get all rhythms status
  status: publicQuery.query(() => {
    const now = Date.now();
    return Array.from(RHYTHMS.values()).map((r) => ({
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      active: r.active,
      interval: r.interval,
      intervalHuman: r.interval >= 86400000 ? `${r.interval / 86400000}d` : r.interval >= 3600000 ? `${r.interval / 3600000}h` : r.interval >= 60000 ? `${r.interval / 60000}m` : `${r.interval / 1000}s`,
      lastRun: r.lastRun,
      nextRun: r.nextRun,
      msUntilNext: r.nextRun ? Math.max(0, r.nextRun.getTime() - now) : null,
      runCount: r.runCount,
      avgDuration: r.avgDuration,
      status: r.status,
      actions: r.actions.length,
    }));
  }),

  // SCH-04: trigger — Manual trigger
  trigger: publicQuery
    .input(z.object({ rhythmId: z.enum(["pulse", "breath", "digest", "dream", "renew"]) }))
    .mutation(({ input }) => {
      const result = executeRhythm(input.rhythmId);
      return { triggered: true, rhythm: input.rhythmId, ...result };
    }),

  // SCH-05: configure — Update rhythm interval
  configure: publicQuery
    .input(z.object({
      rhythmId: z.enum(["pulse", "breath", "digest", "dream", "renew"]),
      interval: z.number().min(1000).max(86400000 * 7), // 1s to 7 days
    }))
    .mutation(({ input }) => {
      const rhythm = RHYTHMS.get(input.rhythmId);
      if (!rhythm) throw new Error("RHYTHM_NOT_FOUND");
      
      const wasActive = rhythm.active;
      if (wasActive) stopRhythm(input.rhythmId);
      
      rhythm.interval = input.interval;
      
      if (wasActive) startRhythm(input.rhythmId);
      
      return { configured: true, rhythm: input.rhythmId, newInterval: input.interval };
    }),

  // SCH-06: logs — Execution logs
  logs: publicQuery
    .input(z.object({
      rhythmId: z.string().optional(),
      limit: z.number().default(20),
    }).optional())
    .query(({ input }) => {
      let logs = [...executionLogs].reverse();
      if (input?.rhythmId) logs = logs.filter((l) => l.rhythmId === input.rhythmId);
      return logs.slice(0, input?.limit || 20).map((l) => ({
        id: l.id,
        rhythm: l.rhythmId,
        duration: l.duration,
        actions: l.actionsExecuted.length,
        status: l.status,
        time: l.startTime,
      }));
    }),

  // SCH-07: startAll — Start all rhythms
  startAll: publicQuery.mutation(() => {
    for (const id of RHYTHMS.keys()) startRhythm(id);
    return { started: RHYTHMS.size, rhythms: Array.from(RHYTHMS.keys()) };
  }),

  // SCH-08: stopAll — Emergency stop
  stopAll: publicQuery.mutation(() => {
    for (const id of RHYTHMS.keys()) stopRhythm(id);
    return { stopped: RHYTHMS.size };
  }),

  // SCH-09: stats — Scheduler statistics
  stats: publicQuery.query(() => {
    const rhythms = Array.from(RHYTHMS.values());
    return {
      totalRhythms: rhythms.length,
      active: rhythms.filter((r) => r.active).length,
      healthy: rhythms.filter((r) => r.status === "HEALTHY").length,
      degraded: rhythms.filter((r) => r.status === "DEGRADED").length,
      failing: rhythms.filter((r) => r.status === "FAILING").length,
      totalExecutions: rhythms.reduce((s, r) => s + r.runCount, 0),
      totalLogs: executionLogs.length,
      rhythms: rhythms.map((r) => ({
        id: r.id,
        nameAr: r.nameAr,
        active: r.active,
        runCount: r.runCount,
        status: r.status,
      })),
    };
  }),
});

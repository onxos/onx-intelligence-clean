// ============================================================
// ONX TOOL GATEWAY
// The only authorized interface between ONX Intelligence and external tools
// Founder Alpha — Sovereign-First Edition
// ============================================================

import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
// Tool Gateway - no crypto needed currently

// --- Tool Registry — one source of truth for all external tools ---
interface ToolDef {
  id: string;
  name: string;
  category: "MEDIA" | "SEARCH" | "KNOWLEDGE" | "AUTOMATION" | "ANALYTICS" | "COMMUNICATION";
  status: "ACTIVE" | "DEGRADED" | "OFFLINE" | "EXPERIMENTAL";
  version: string;
  capabilities: string[];
  healthEndpoint: string;
  avgLatencyMs: number;
  successRate: number;
  lastHealthCheck: string;
  replacementCompatible: string[]; // tool IDs that can replace this tool
}

const TOOL_REGISTRY: Record<string, ToolDef> = {
  runway_media: {
    id: "runway_media",
    name: "Runway Media",
    category: "MEDIA",
    status: "ACTIVE",
    version: "1.0.0",
    capabilities: ["video_generation", "image_editing", "motion_capture"],
    healthEndpoint: "/health",
    avgLatencyMs: 2500,
    successRate: 0.97,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["alternative_media"],
  },
  search_system: {
    id: "search_system",
    name: "Search System",
    category: "SEARCH",
    status: "ACTIVE",
    version: "1.0.0",
    capabilities: ["web_search", "semantic_search", "knowledge_retrieval"],
    healthEndpoint: "/health",
    avgLatencyMs: 800,
    successRate: 0.99,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["alternative_search"],
  },
  knowledge_base: {
    id: "knowledge_base",
    name: "Knowledge Base",
    category: "KNOWLEDGE",
    status: "ACTIVE",
    version: "1.0.0",
    capabilities: ["document_store", "semantic_query", "entity_extraction"],
    healthEndpoint: "/health",
    avgLatencyMs: 400,
    successRate: 0.995,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["alternative_knowledge"],
  },
  automation_engine: {
    id: "automation_engine",
    name: "Automation Engine",
    category: "AUTOMATION",
    status: "ACTIVE",
    version: "1.0.0",
    capabilities: ["workflow_orchestration", "task_scheduling", "trigger_management"],
    healthEndpoint: "/health",
    avgLatencyMs: 600,
    successRate: 0.98,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["alternative_automation"],
  },
  analytics_dashboard: {
    id: "analytics_dashboard",
    name: "Analytics Dashboard",
    category: "ANALYTICS",
    status: "ACTIVE",
    version: "1.0.0",
    capabilities: ["metrics_collection", "reporting", "alerting"],
    healthEndpoint: "/health",
    avgLatencyMs: 300,
    successRate: 0.99,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["alternative_analytics"],
  },
  communication_hub: {
    id: "communication_hub",
    name: "Communication Hub",
    category: "COMMUNICATION",
    status: "ACTIVE",
    version: "1.0.0",
    capabilities: ["messaging", "notification", "collaboration"],
    healthEndpoint: "/health",
    avgLatencyMs: 150,
    successRate: 0.995,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["alternative_communication"],
  },
  // Alternative tools (for replacement validation)
  alternative_media: {
    id: "alternative_media",
    name: "Alternative Media Tool",
    category: "MEDIA",
    status: "EXPERIMENTAL",
    version: "0.9.0",
    capabilities: ["video_generation", "image_editing"],
    healthEndpoint: "/health",
    avgLatencyMs: 3000,
    successRate: 0.92,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["runway_media"],
  },
  alternative_search: {
    id: "alternative_search",
    name: "Alternative Search Tool",
    category: "SEARCH",
    status: "EXPERIMENTAL",
    version: "0.9.0",
    capabilities: ["web_search", "semantic_search"],
    healthEndpoint: "/health",
    avgLatencyMs: 1000,
    successRate: 0.94,
    lastHealthCheck: new Date().toISOString(),
    replacementCompatible: ["search_system"],
  },
};

// In-memory runtime state
const toolCallLog: Array<{
  timestamp: string;
  toolId: string;
  action: string;
  params: Record<string, unknown>;
  status: "SUCCESS" | "FAILURE" | "FALLBACK";
  latencyMs: number;
}> = [];

let toolMetrics: Record<string, { calls: number; failures: number; totalLatency: number }> = {};

// --- Helper: record tool audit ---
function recordToolAudit(
  action: string,
  toolId: string,
  params: Record<string, unknown> = {},
  status: "SUCCESS" | "FAILURE" | "FALLBACK" = "SUCCESS",
  latencyMs: number = 0
) {
  const entry = {
    timestamp: new Date().toISOString(),
    toolId,
    action,
    params,
    status,
    latencyMs,
  };
  toolCallLog.push(entry);
  if (toolCallLog.length > 10000) toolCallLog.splice(0, toolCallLog.length - 10000);

  if (!toolMetrics[toolId]) {
    toolMetrics[toolId] = { calls: 0, failures: 0, totalLatency: 0 };
  }
  toolMetrics[toolId].calls++;
  toolMetrics[toolId].totalLatency += latencyMs;
  if (status === "FAILURE") toolMetrics[toolId].failures++;

  return entry;
}

export const toolGatewayRouter = createRouter({
  // TG-01: listTools — Tool Registry
  listTools: publicQuery
    .input(
      z.object({
        category: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(({ input }) => {
      let tools = Object.values(TOOL_REGISTRY);
      if (input.category) {
        tools = tools.filter((t) => t.category === input.category);
      }
      if (input.status) {
        tools = tools.filter((t) => t.status === input.status);
      }
      return {
        tools: tools.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          status: t.status,
          version: t.version,
          capabilities: t.capabilities,
        })),
        count: tools.length,
        categories: [...new Set(Object.values(TOOL_REGISTRY).map((t) => t.category))],
      };
    }),

  // TG-02: discoverTools — Tool Discovery (find tools by capability)
  discoverTools: publicQuery
    .input(
      z.object({
        capability: z.string(),
        category: z.string().optional(),
      })
    )
    .query(({ input }) => {
      const matches = Object.values(TOOL_REGISTRY).filter(
        (t) =>
          t.capabilities.some((c) =>
            c.toLowerCase().includes(input.capability.toLowerCase())
          ) &&
          (!input.category || t.category === input.category) &&
          t.status !== "OFFLINE"
      );
      return {
        capability: input.capability,
        matches: matches.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          capabilities: t.capabilities,
          status: t.status,
        })),
        count: matches.length,
      };
    }),

  // TG-03: routeTool — Tool Routing
  routeTool: publicQuery
    .input(
      z.object({
        toolId: z.string(),
        action: z.string(),
        params: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(({ input }) => {
      const startTime = Date.now();
      const tool = TOOL_REGISTRY[input.toolId];
      if (!tool) throw new Error("TOOL_NOT_FOUND");
      if (tool.status === "OFFLINE") throw new Error("TOOL_OFFLINE");

      const latency = Date.now() - startTime;
      const status = tool.successRate > 0.95 ? "SUCCESS" : "FAILURE";

      recordToolAudit(input.action, input.toolId, input.params, status, latency);

      return {
        routed: true,
        toolId: tool.id,
        toolName: tool.name,
        category: tool.category,
        action: input.action,
        status,
        latencyMs: latency,
        gateway: "TOOL_GATEWAY",
        noDirectIntegration: true, // Confirms no direct tool integration
      };
    }),

  // TG-04: invokeTool — Tool Invocation
  invokeTool: publicQuery
    .input(
      z.object({
        toolId: z.string(),
        method: z.string(),
        params: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(({ input }) => {
      const startTime = Date.now();
      const tool = TOOL_REGISTRY[input.toolId];
      if (!tool) throw new Error("TOOL_NOT_FOUND");
      if (tool.status === "OFFLINE") throw new Error("TOOL_OFFLINE");

      const latency = Date.now() - startTime;
      const success = Math.random() < tool.successRate;

      recordToolAudit(
        `INVOKE:${input.method}`,
        input.toolId,
        input.params,
        success ? "SUCCESS" : "FAILURE",
        latency
      );

      return {
        invoked: true,
        toolId: tool.id,
        toolName: tool.name,
        method: input.method,
        status: success ? "SUCCESS" : "FAILURE",
        latencyMs: latency,
        result: success
          ? { data: `Result from ${tool.name}.${input.method}`, processed: true }
          : { error: `Invocation failed on ${tool.name}`, retryable: true },
        gateway: "TOOL_GATEWAY",
      };
    }),

  // TG-05: checkToolHealth — Tool Health Monitoring
  checkToolHealth: publicQuery
    .input(z.object({ toolId: z.string().optional() }))
    .query(({ input }) => {
      const tools = input.toolId
        ? [TOOL_REGISTRY[input.toolId]].filter(Boolean)
        : Object.values(TOOL_REGISTRY);

      return tools.map((t) => {
        const healthy = t.successRate > 0.95;
        return {
          toolId: t.id,
          name: t.name,
          category: t.category,
          healthy,
          successRate: t.successRate,
          avgLatencyMs: t.avgLatencyMs,
          status: healthy ? "ONLINE" : "DEGRADED",
          version: t.version,
          checkedAt: new Date().toISOString(),
        };
      });
    }),

  // TG-06: toolAuditLog — Tool Audit Logging
  toolAuditLog: publicQuery
    .input(
      z.object({
        limit: z.number().default(50),
        toolId: z.string().optional(),
        action: z.string().optional(),
      })
    )
    .query(({ input }) => {
      let entries = [...toolCallLog].reverse();
      if (input.toolId) {
        entries = entries.filter((e) => e.toolId === input.toolId);
      }
      if (input.action) {
        entries = entries.filter((e) => e.action === input.action);
      }
      return {
        entries: entries.slice(0, input.limit),
        total: toolCallLog.length,
        filtered: entries.length,
      };
    }),

  // TG-07: toolMetrics — Tool Metrics
  toolMetrics: publicQuery.query(() => {
    const enriched: Record<string, unknown> = {};
    for (const [toolId, metrics] of Object.entries(toolMetrics)) {
      const tool = TOOL_REGISTRY[toolId];
      enriched[toolId] = {
        toolName: tool?.name || toolId,
        category: tool?.category || "UNKNOWN",
        ...metrics,
        avgLatencyMs:
          metrics.calls > 0
            ? Math.round(metrics.totalLatency / metrics.calls)
            : 0,
        failureRate:
          metrics.calls > 0
            ? ((metrics.failures / metrics.calls) * 100).toFixed(2)
            : "0",
      };
    }
    return {
      totalCalls: Object.values(toolMetrics).reduce(
        (s, m) => s + m.calls,
        0
      ),
      totalFailures: Object.values(toolMetrics).reduce(
        (s, m) => s + m.failures,
        0
      ),
      byTool: enriched,
    };
  }),

  // TG-08: validateReplacement — Tool Replacement Validation
  validateReplacement: publicQuery
    .input(
      z.object({
        currentToolId: z.string(),
        proposedToolId: z.string(),
      })
    )
    .query(({ input }) => {
      const current = TOOL_REGISTRY[input.currentToolId];
      const proposed = TOOL_REGISTRY[input.proposedToolId];

      if (!current) throw new Error("CURRENT_TOOL_NOT_FOUND");
      if (!proposed) throw new Error("PROPOSED_TOOL_NOT_FOUND");

      // Check compatibility
      const compatible =
        current.replacementCompatible.includes(input.proposedToolId) ||
        proposed.replacementCompatible.includes(input.currentToolId) ||
        current.category === proposed.category;

      // Check capability overlap
      const currentCaps = new Set(current.capabilities);
      const proposedCaps = new Set(proposed.capabilities);
      const overlap = [...currentCaps].filter((c) => proposedCaps.has(c));
      const missing = [...currentCaps].filter((c) => !proposedCaps.has(c));

      recordToolAudit("VALIDATE_REPLACEMENT", input.currentToolId, {
        proposed: input.proposedToolId,
        compatible,
      });

      return {
        currentToolId: current.id,
        currentToolName: current.name,
        proposedToolId: proposed.id,
        proposedToolName: proposed.name,
        compatible,
        categoryMatch: current.category === proposed.category,
        capabilityOverlap: overlap,
        capabilityOverlapCount: overlap.length,
        capabilitiesMissing: missing,
        capabilitiesMissingCount: missing.length,
        canReplace: compatible && missing.length <= 1,
        noIntelligenceRedesign: true,
        noMemoryRedesign: true,
        noCapitalRedesign: true,
        noCompanionRedesign: true,
        noAtlasRedesign: true,
      };
    }),
});

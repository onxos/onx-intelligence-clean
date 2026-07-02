import {
  AuthService,
  OpenAPI,
  SovereigntyService,
} from "@/lib/api/generated";
import { getToken } from "@/lib/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://onx-intelligence-clean.onrender.com";

OpenAPI.BASE = API_BASE_URL;
OpenAPI.TOKEN = async () => getToken() ?? "";

type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

async function workspaceFetch<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, QueryValue>;
    body?: unknown;
  },
): Promise<T> {
  const token = getToken();
  const res = await fetch(buildUrl(path, options?.query), {
    method: options?.method ?? "GET",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...(options?.body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(options?.body !== undefined && { body: JSON.stringify(options.body) }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }

  return (await res.text()) as T;
}

export const api = {
  auth: {
    login: AuthService.authControllerLogin,
    register: AuthService.authControllerRegister,
    me: AuthService.authControllerMe,
    devices: AuthService.authControllerDevices,
  },
  health: {
    check: () => workspaceFetch("/health"),
    report: () => workspaceFetch("/health/report"),
    systems: () => workspaceFetch("/health/systems"),
  },
  ai: {
    providers: () => workspaceFetch("/ai/providers"),
    providerStatus: (id: string) => workspaceFetch(`/ai/providers/${id}/status`),
    query: (body: { query: string; domain?: string; providerId?: string; signals?: Record<string, unknown> }) =>
      workspaceFetch("/ai/query", { method: "POST", body }),
    consensus: (body: { query: string; domain?: string; signals?: Record<string, unknown> }) =>
      workspaceFetch("/ai/consensus", { method: "POST", body }),
    chat: (body: { messages: Array<{ role: string; content: string }>; domain?: string }) =>
      workspaceFetch("/ai/chat", { method: "POST", body }),
    logs: (query?: Record<string, QueryValue>) => workspaceFetch("/ai/logs", { query }),
    clinicalDiagnosis: (body: { symptoms: string[]; history?: string }) =>
      workspaceFetch("/ai/clinical/diagnosis", { method: "POST", body }),
    clinicalProtocol: (body: { condition: string; context?: string }) =>
      workspaceFetch("/ai/clinical/protocol", { method: "POST", body }),
  },
  sech: {
    gates: () => workspaceFetch("/sech/gates"),
    pending: (query?: Record<string, QueryValue>) => workspaceFetch("/sech/pending", { query }),
    constraints: () => workspaceFetch("/sech/constraints"),
  },
  iurg: {
    violations: (query?: Record<string, QueryValue>) => workspaceFetch("/iurg/violations", { query }),
    enforcements: (query?: Record<string, QueryValue>) => workspaceFetch("/iurg/enforcements", { query }),
    edges: (query?: Record<string, QueryValue>) => workspaceFetch("/iurg/edges", { query }),
  },
  governance: {
    runAssessment: (body: Record<string, unknown>) =>
      workspaceFetch("/assessment/run", { method: "POST", body }),
    gaps: () => workspaceFetch("/assessment/gaps"),
    runAudit: (body: Record<string, unknown>) => workspaceFetch("/audit/run", { method: "POST", body }),
    inconsistencies: () => workspaceFetch("/audit/inconsistencies"),
  },
  intelligence: {
    list: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/intelligence", { query }),
    stats: () => workspaceFetch("/intelligence/stats"),
    create: (body: Record<string, unknown>) =>
      workspaceFetch("/intelligence", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/intelligence/${id}`, { method: "PUT", body }),
    remove: (id: string) => workspaceFetch(`/intelligence/${id}`, { method: "DELETE" }),
  },
  evidence: {
    list: (query?: Record<string, QueryValue>) => workspaceFetch("/evidence", { query }),
    create: (body: Record<string, unknown>) =>
      workspaceFetch("/evidence", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/evidence/${id}`, { method: "PUT", body }),
    remove: (id: string) => workspaceFetch(`/evidence/${id}`, { method: "DELETE" }),
  },
  providers: {
    list: (query?: Record<string, QueryValue>) => workspaceFetch("/providers", { query }),
    create: (body: Record<string, unknown>) =>
      workspaceFetch("/providers", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/providers/${id}`, { method: "PUT", body }),
    remove: (id: string) => workspaceFetch(`/providers/${id}`, { method: "DELETE" }),
    evaluate: (body: { providerId: string; intent: string; context?: string }) =>
      workspaceFetch("/providers/evaluate", { method: "POST", body }),
  },
  tools: {
    list: (query?: Record<string, QueryValue>) => workspaceFetch("/tools", { query }),
    create: (body: Record<string, unknown>) =>
      workspaceFetch("/tools", { method: "POST", body }),
    update: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/tools/${id}`, { method: "PUT", body }),
    remove: (id: string) => workspaceFetch(`/tools/${id}`, { method: "DELETE" }),
  },
  sovereignty: {
    report: SovereigntyService.sovereigntyControllerReport,
  },
  workspace: {
    home: () => workspaceFetch("/workspace/home"),
    projects: (query?: Record<string, QueryValue>) => workspaceFetch("/projects", { query }),
    createProject: (body: Record<string, unknown>) =>
      workspaceFetch("/projects", { method: "POST", body }),
    projectDetails: (id: string) => workspaceFetch(`/projects/${id}`),
    updateProject: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/projects/${id}`, { method: "PUT", body }),
    deleteProject: (id: string) => workspaceFetch(`/projects/${id}`, { method: "DELETE" }),
    knowledgeAssets: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/knowledge/assets", { query }),
    createKnowledgeAsset: (body: Record<string, unknown>) =>
      workspaceFetch("/knowledge/assets", { method: "POST", body }),
    knowledgeAssetDetails: (id: string) => workspaceFetch(`/knowledge/assets/${id}`),
    updateKnowledgeAsset: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/knowledge/assets/${id}`, { method: "PUT", body }),
    deleteKnowledgeAsset: (id: string) =>
      workspaceFetch(`/knowledge/assets/${id}`, { method: "DELETE" }),
    sources: (query?: Record<string, QueryValue>) => workspaceFetch("/sources", { query }),
    createSource: (body: Record<string, unknown>) =>
      workspaceFetch("/sources", { method: "POST", body }),
    sourceDetails: (id: string) => workspaceFetch(`/sources/${id}`),
    updateSource: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/sources/${id}`, { method: "PUT", body }),
    deleteSource: (id: string) => workspaceFetch(`/sources/${id}`, { method: "DELETE" }),
    agents: (query?: Record<string, QueryValue>) => workspaceFetch("/agents", { query }),
    createAgent: (body: Record<string, unknown>) =>
      workspaceFetch("/agents", { method: "POST", body }),
    updateAgent: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/agents/${id}`, { method: "PUT", body }),
    deleteAgent: (id: string) => workspaceFetch(`/agents/${id}`, { method: "DELETE" }),
    memory: (query?: Record<string, QueryValue>) => workspaceFetch("/memory", { query }),
    createMemory: (body: Record<string, unknown>) =>
      workspaceFetch("/memory", { method: "POST", body }),
    updateMemory: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/memory/${id}`, { method: "PUT", body }),
    deleteMemory: (id: string) => workspaceFetch(`/memory/${id}`, { method: "DELETE" }),
    models: (query?: Record<string, QueryValue>) => workspaceFetch("/models", { query }),
    createModel: (body: Record<string, unknown>) =>
      workspaceFetch("/models", { method: "POST", body }),
    modelDetails: (id: string) => workspaceFetch(`/models/${id}`),
    updateModel: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/models/${id}`, { method: "PUT", body }),
    deleteModel: (id: string) => workspaceFetch(`/models/${id}`, { method: "DELETE" }),
    evaluations: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/evaluations", { query }),
    createEvaluation: (body: Record<string, unknown>) =>
      workspaceFetch("/evaluations", { method: "POST", body }),
    evaluationDetails: (id: string) => workspaceFetch(`/evaluations/${id}`),
    updateEvaluation: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/evaluations/${id}`, { method: "PUT", body }),
    deleteEvaluation: (id: string) => workspaceFetch(`/evaluations/${id}`, { method: "DELETE" }),
    reports: () => workspaceFetch("/reports"),
    reportGovernance: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/reports/governance", { query }),
    reportCapital: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/reports/capital", { query }),
    monitoring: () => workspaceFetch("/monitoring"),
    monitoringAudit: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/monitoring/audit", { query }),
    monitoringAuditDetails: (id: string) => workspaceFetch(`/monitoring/audit/${id}`),
    settings: () => workspaceFetch("/settings"),
    updateSettings: (body: Record<string, unknown>) =>
      workspaceFetch("/settings", { method: "PUT", body }),
  },
  capital: {
    allocations: (query?: Record<string, QueryValue>) =>
      workspaceFetch("/capital/allocations", { query }),
    createAllocation: (body: Record<string, unknown>) =>
      workspaceFetch("/capital/allocations", { method: "POST", body }),
    allocationDetails: (id: string) => workspaceFetch(`/capital/allocations/${id}`),
    updateAllocation: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/capital/allocations/${id}`, { method: "PUT", body }),
    deleteAllocation: (id: string) =>
      workspaceFetch(`/capital/allocations/${id}`, { method: "DELETE" }),
    restoreAllocation: (id: string) =>
      workspaceFetch(`/capital/allocations/${id}/restore`, { method: "POST" }),
    approveAllocation: (id: string, body?: Record<string, unknown>) =>
      workspaceFetch(`/capital/allocations/${id}/approve`, { method: "POST", body: body ?? {} }),
    rejectAllocation: (id: string, body?: Record<string, unknown>) =>
      workspaceFetch(`/capital/allocations/${id}/reject`, { method: "POST", body: body ?? {} }),
    policies: (query?: Record<string, QueryValue>) => workspaceFetch("/capital/policies", { query }),
    createPolicy: (body: Record<string, unknown>) =>
      workspaceFetch("/capital/policies", { method: "POST", body }),
    policyDetails: (id: string) => workspaceFetch(`/capital/policies/${id}`),
    updatePolicy: (id: string, body: Record<string, unknown>) =>
      workspaceFetch(`/capital/policies/${id}`, { method: "PUT", body }),
    deletePolicy: (id: string) => workspaceFetch(`/capital/policies/${id}`, { method: "DELETE" }),
    restorePolicy: (id: string) =>
      workspaceFetch(`/capital/policies/${id}/restore`, { method: "POST" }),
    reports: (query?: Record<string, QueryValue>) => workspaceFetch("/capital/reports", { query }),
    history: (query?: Record<string, QueryValue>) => workspaceFetch("/capital/history", { query }),
  },
};

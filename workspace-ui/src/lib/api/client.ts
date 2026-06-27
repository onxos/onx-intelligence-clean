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
    knowledgeAssets: () => workspaceFetch("/knowledge/assets"),
    sources: () => workspaceFetch("/sources"),
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
    models: () => workspaceFetch("/models"),
    evaluations: () => workspaceFetch("/evaluations"),
    reports: () => workspaceFetch("/reports"),
    monitoring: () => workspaceFetch("/monitoring"),
    settings: () => workspaceFetch("/settings"),
    updateSettings: (body: Record<string, unknown>) =>
      workspaceFetch("/settings", { method: "PUT", body }),
  },
};

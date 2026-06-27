import {
  AuthService,
  EvidenceService,
  IntelligenceService,
  OpenAPI,
  ProviderService,
  SovereigntyService,
  ToolService,
} from "@/lib/api/generated";
import { getToken } from "@/lib/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://onx-intelligence-clean.onrender.com";

OpenAPI.BASE = API_BASE_URL;
OpenAPI.TOKEN = async () => getToken() ?? "";

async function workspaceFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
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
    list: IntelligenceService.intelligenceControllerList,
    stats: IntelligenceService.intelligenceControllerStats,
  },
  evidence: {
    list: EvidenceService.evidenceControllerList,
  },
  providers: {
    list: ProviderService.providerControllerList,
  },
  tools: {
    list: ToolService.toolControllerList,
  },
  sovereignty: {
    report: SovereigntyService.sovereigntyControllerReport,
  },
  workspace: {
    home: () => workspaceFetch("/workspace/home"),
    projects: () => workspaceFetch("/projects"),
    projectDetails: (id: string) => workspaceFetch(`/projects/${id}`),
    knowledgeAssets: () => workspaceFetch("/knowledge/assets"),
    sources: () => workspaceFetch("/sources"),
    agents: () => workspaceFetch("/agents"),
    models: () => workspaceFetch("/models"),
    evaluations: () => workspaceFetch("/evaluations"),
    reports: () => workspaceFetch("/reports"),
    monitoring: () => workspaceFetch("/monitoring"),
    settings: () => workspaceFetch("/settings"),
  },
};

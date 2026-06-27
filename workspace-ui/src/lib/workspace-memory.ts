export type LayoutMode = "comfortable" | "compact";

type DomainState = {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  pageSize?: number;
  filters?: Record<string, string>;
  lastVisitedAt?: number;
};

type RecentAsset = {
  id: string;
  domain: string;
  label: string;
  at: number;
};

type WorkspaceMemory = {
  lastPage?: string;
  lastProject?: string;
  language?: "en" | "ar";
  layout?: LayoutMode;
  navHistory: string[];
  recentSearches: string[];
  recentAssets: RecentAsset[];
  domains: Record<string, DomainState>;
};

const MEMORY_KEY = "onx_workspace_memory_v1";

const EMPTY_MEMORY: WorkspaceMemory = {
  navHistory: [],
  recentSearches: [],
  recentAssets: [],
  domains: {},
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function readWorkspaceMemory(): WorkspaceMemory {
  if (!canUseStorage()) return EMPTY_MEMORY;
  const raw = window.localStorage.getItem(MEMORY_KEY);
  if (!raw) return EMPTY_MEMORY;
  try {
    const parsed = JSON.parse(raw) as WorkspaceMemory;
    return {
      ...EMPTY_MEMORY,
      ...parsed,
      navHistory: Array.isArray(parsed.navHistory) ? parsed.navHistory : [],
      recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches : [],
      recentAssets: Array.isArray(parsed.recentAssets) ? parsed.recentAssets : [],
      domains: parsed.domains || {},
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

function writeWorkspaceMemory(next: WorkspaceMemory) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
}

function uniqueRecent(items: string[], value: string, limit = 8) {
  const normalized = value.trim();
  if (!normalized) return items;
  const rest = items.filter((item) => item !== normalized);
  return [normalized, ...rest].slice(0, limit);
}

export function rememberPage(pathname: string) {
  const state = readWorkspaceMemory();
  state.lastPage = pathname;
  state.navHistory = uniqueRecent(state.navHistory, pathname, 10);
  writeWorkspaceMemory(state);
}

export function rememberLanguage(language: "en" | "ar") {
  const state = readWorkspaceMemory();
  state.language = language;
  writeWorkspaceMemory(state);
}

export function rememberLayout(layout: LayoutMode) {
  const state = readWorkspaceMemory();
  state.layout = layout;
  writeWorkspaceMemory(state);
}

export function rememberProject(projectId: string) {
  const state = readWorkspaceMemory();
  state.lastProject = projectId;
  writeWorkspaceMemory(state);
}

export function rememberDomainState(domain: string, nextDomainState: DomainState) {
  const state = readWorkspaceMemory();
  state.domains[domain] = {
    ...state.domains[domain],
    ...nextDomainState,
    lastVisitedAt: Date.now(),
  };
  writeWorkspaceMemory(state);
}

export function getDomainState(domain: string): DomainState | undefined {
  return readWorkspaceMemory().domains[domain];
}

export function rememberSearch(search: string) {
  const trimmed = search.trim();
  if (!trimmed) return;
  const state = readWorkspaceMemory();
  state.recentSearches = uniqueRecent(state.recentSearches, trimmed, 8);
  writeWorkspaceMemory(state);
}

export function rememberAsset(asset: { id: string; domain: string; label: string }) {
  const state = readWorkspaceMemory();
  const normalized: RecentAsset = { ...asset, at: Date.now() };
  const rest = state.recentAssets.filter((item) => !(item.id === asset.id && item.domain === asset.domain));
  state.recentAssets = [normalized, ...rest].slice(0, 8);
  writeWorkspaceMemory(state);
}

export function getWorkspaceSnapshot() {
  return readWorkspaceMemory();
}

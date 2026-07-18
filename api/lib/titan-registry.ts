// ============================================================
// TITAN REGISTRY (Phase P) — canonical identities of the 5 Titans
//
// The prompt-only titan-bridge-router.ts (GPT-4o + in-memory Map)
// carries the personas; this registry is the DETERMINISTIC,
// key-free source of the five titan namespaces used by the durable
// Titan Decision Engine. Kept in its own module (no `openai` import)
// so it is safe to load in tests and the browser type layer.
//
// actionAuthority = the AuthorityGate level a titan's decision WOULD
// require to be carried out. Apollo (governance, VETO) sits at A3;
// the others at A2 — anything above the AUTO_GRANT_CEILING (A2) is
// classified REQUIRES_APPROVAL and never auto-executed (fail-closed).
// ============================================================
import type { AuthorityLevel } from "./authority-gate";

export interface TitanIdentity {
  id: string;
  name: string;
  nameAr: string;
  /** Human-facing domain label (mirrors titan-bridge-router.ts TITANS). */
  domain: string;
  /** Corpus domain hint used to bias deterministic retrieval, when present. */
  corpusDomainHint?: string;
  /** Authority level a carried-out decision by this titan would require. */
  actionAuthority: AuthorityLevel;
  /** Apollo alone holds constitutional VETO (Governance & Compliance). */
  hasVeto: boolean;
}

export const TITAN_REGISTRY: Record<string, TitanIdentity> = {
  prometheus: {
    id: "prometheus",
    name: "Prometheus",
    nameAr: "بروميثيوس",
    domain: "Strategy & Vision",
    actionAuthority: "A2",
    hasVeto: false,
  },
  athena: {
    id: "athena",
    name: "Athena",
    nameAr: "أثينا",
    domain: "Schema & Knowledge",
    actionAuthority: "A2",
    hasVeto: false,
  },
  zeus: {
    id: "zeus",
    name: "Zeus",
    nameAr: "زيوس",
    domain: "Architecture & Systems",
    actionAuthority: "A2",
    hasVeto: false,
  },
  hermes: {
    id: "hermes",
    name: "Hermes",
    nameAr: "هيرميس",
    domain: "Operations & Execution",
    actionAuthority: "A2",
    hasVeto: false,
  },
  apollo: {
    id: "apollo",
    name: "Apollo",
    nameAr: "أبولو",
    domain: "Governance & Compliance",
    actionAuthority: "A3",
    hasVeto: true,
  },
};

export const TITAN_IDS = Object.keys(TITAN_REGISTRY);

export function isTitanId(id: unknown): id is string {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(TITAN_REGISTRY, id);
}

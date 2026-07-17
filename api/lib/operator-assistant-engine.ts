import { createHash } from "crypto";
import { searchCorpus, type CorpusSearchResult } from "./corpus-search";
import {
  AUTO_GRANT_CEILING,
  authorityRank,
  decideAuthority,
  type AuthorityDecision,
  type AuthorityLevel,
} from "./authority-gate";
import { computeTitanEvalScore } from "./titan-engine";

export type OperatorDomain = "INCIDENT" | "RELIABILITY" | "SECURITY" | "COST";
export type OperatorVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type OperatorStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface OperatorEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface OperatorActionDraft {
  incident: string;
  domain: OperatorDomain;
  verdict: OperatorVerdict;
  rationale: string;
  evidence: OperatorEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: OperatorStatus;
  evalScore: number;
  fingerprint: string;
}

export class OperatorAssistantError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "OperatorAssistantError";
    this.code = code;
  }
}

export const OPERATOR_RELEVANCE_THRESHOLD = 1.0;

function domainAuthority(domain: OperatorDomain): AuthorityLevel {
  if (domain === "INCIDENT" || domain === "SECURITY") return "A2";
  return "A1";
}

function fingerprintAction(d: Omit<OperatorActionDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    incident: d.incident,
    domain: d.domain,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface OperatorActionInput {
  incident: string;
  domain?: OperatorDomain;
  topK?: number;
  corpusDomain?: string;
}

export interface OperatorActionDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function actOperator(
  input: OperatorActionInput,
  deps: OperatorActionDeps = {},
): Promise<OperatorActionDraft> {
  if (!input || typeof input !== "object") {
    throw new OperatorAssistantError("BAD_INPUT", "طلب Operator غير صالح.");
  }
  if (typeof input.incident !== "string" || input.incident.trim() === "") {
    throw new OperatorAssistantError("MISSING_INCIDENT", "كل طلب Operator يتطلب incident.");
  }
  const domain: OperatorDomain = input.domain ?? "INCIDENT";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const result = await search(input.incident, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: OperatorEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: OperatorVerdict =
    evidence.length > 0 && topScore >= OPERATOR_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = domainAuthority(domain);
  const auth = decideAuthority({
    subject: "operator-assistant",
    action: `operator action: ${input.incident.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const status: OperatorStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `Operator Assistant: grounded action from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; domain=${domain}; authority=${authorityLevel} (${auth.decision}).`
      : `Operator Assistant: insufficient evidence (top score=${topScore.toFixed(4)} < ${OPERATOR_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; domain=${domain}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<OperatorActionDraft, "fingerprint"> = {
    incident: input.incident,
    domain,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintAction(base) };
}


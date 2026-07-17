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

export type AnalystDomain = "BUSINESS" | "FINANCE" | "OPERATIONS" | "RISK";
export type AnalystVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type AnalystStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface AnalystEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface AnalystInsightDraft {
  question: string;
  domain: AnalystDomain;
  verdict: AnalystVerdict;
  rationale: string;
  evidence: AnalystEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: AnalystStatus;
  evalScore: number;
  fingerprint: string;
}

export class AnalystAssistantError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "AnalystAssistantError";
    this.code = code;
  }
}

export const ANALYST_RELEVANCE_THRESHOLD = 1.0;

function domainAuthority(domain: AnalystDomain): AuthorityLevel {
  if (domain === "FINANCE" || domain === "RISK") return "A2";
  return "A1";
}

function fingerprintInsight(d: Omit<AnalystInsightDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    question: d.question,
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

export interface AnalystInsightInput {
  question: string;
  domain?: AnalystDomain;
  topK?: number;
  corpusDomain?: string;
}

export interface AnalystInsightDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function analyzeInsight(
  input: AnalystInsightInput,
  deps: AnalystInsightDeps = {},
): Promise<AnalystInsightDraft> {
  if (!input || typeof input !== "object") {
    throw new AnalystAssistantError("BAD_INPUT", "طلب Analyst غير صالح.");
  }
  if (typeof input.question !== "string" || input.question.trim() === "") {
    throw new AnalystAssistantError("MISSING_QUESTION", "كل طلب Analyst يتطلب question.");
  }
  const domain: AnalystDomain = input.domain ?? "BUSINESS";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const result = await search(input.question, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: AnalystEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: AnalystVerdict =
    evidence.length > 0 && topScore >= ANALYST_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = domainAuthority(domain);
  const auth = decideAuthority({
    subject: "analyst-assistant",
    action: `analyst insight: ${input.question.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const status: AnalystStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `Analyst Assistant: grounded insight from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; domain=${domain}; authority=${authorityLevel} (${auth.decision}).`
      : `Analyst Assistant: insufficient evidence (top score=${topScore.toFixed(4)} < ${ANALYST_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; domain=${domain}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<AnalystInsightDraft, "fingerprint"> = {
    question: input.question,
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
  return { ...base, fingerprint: fingerprintInsight(base) };
}


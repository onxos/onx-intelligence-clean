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

export type FounderImpact = "OPERATIONAL" | "EXECUTIVE" | "STRATEGIC";
export type FounderVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type FounderStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface FounderEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface FounderAdviceDraft {
  prompt: string;
  impact: FounderImpact;
  verdict: FounderVerdict;
  rationale: string;
  evidence: FounderEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: FounderStatus;
  evalScore: number;
  fingerprint: string;
}

export class FounderCompanionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "FounderCompanionError";
    this.code = code;
  }
}

export const FOUNDER_RELEVANCE_THRESHOLD = 1.0;

function impactAuthority(impact: FounderImpact): AuthorityLevel {
  if (impact === "STRATEGIC") return "A3";
  if (impact === "EXECUTIVE") return "A2";
  return "A1";
}

function fingerprintAdvice(d: Omit<FounderAdviceDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    prompt: d.prompt,
    impact: d.impact,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface FounderAdviceInput {
  prompt: string;
  impact?: FounderImpact;
  topK?: number;
  domain?: string;
}

export interface FounderAdviceDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function adviseFounder(
  input: FounderAdviceInput,
  deps: FounderAdviceDeps = {},
): Promise<FounderAdviceDraft> {
  if (!input || typeof input !== "object") {
    throw new FounderCompanionError("BAD_INPUT", "طلب مؤسس غير صالح.");
  }
  if (typeof input.prompt !== "string" || input.prompt.trim() === "") {
    throw new FounderCompanionError("MISSING_PROMPT", "كل طلب مؤسس يتطلب prompt.");
  }
  const impact: FounderImpact = input.impact ?? "STRATEGIC";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;
  const search = deps.search ?? searchCorpus;
  const result = await search(input.prompt, {
    limit: topK,
    ...(input.domain ? { domain: input.domain } : {}),
  });
  const evidence: FounderEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: FounderVerdict =
    evidence.length > 0 && topScore >= FOUNDER_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = impactAuthority(impact);
  const auth = decideAuthority({
    subject: "founder-companion",
    action: `advise founder: ${input.prompt.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const status: FounderStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `Founder Companion: grounded advice from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; impact=${impact}; authority=${authorityLevel} (${auth.decision}).`
      : `Founder Companion: insufficient evidence (top score=${topScore.toFixed(4)} < ${FOUNDER_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; impact=${impact}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<FounderAdviceDraft, "fingerprint"> = {
    prompt: input.prompt,
    impact,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintAdvice(base) };
}


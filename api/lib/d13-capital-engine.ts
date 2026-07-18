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

export type D13CapitalCategory =
  | "WISDOM"
  | "JUDGMENT"
  | "UNDERSTANDING"
  | "PATTERN"
  | "PROCESS";
export type D13Verdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type D13Status = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface D13Evidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface D13CapitalDraft {
  signalId: string;
  amount: number;
  category: D13CapitalCategory;
  rationale: string;
  verdict: D13Verdict;
  evidence: D13Evidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: D13Status;
  evalScore: number;
  fingerprint: string;
}

export class D13CapitalError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "D13CapitalError";
    this.code = code;
  }
}

export const D13_RELEVANCE_THRESHOLD = 1.0;

function categoryAuthority(category: D13CapitalCategory, amount: number): AuthorityLevel {
  if (category === "WISDOM" || category === "JUDGMENT" || amount >= 50) return "A2";
  return "A1";
}

function fingerprintCapital(d: Omit<D13CapitalDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    signalId: d.signalId,
    amount: d.amount,
    category: d.category,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface D13CapitalInput {
  signalId: string;
  amount: number;
  category?: D13CapitalCategory;
  rationale: string;
  topK?: number;
  corpusDomain?: string;
}

export interface D13CapitalDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function capitalizeD13(
  input: D13CapitalInput,
  deps: D13CapitalDeps = {},
): Promise<D13CapitalDraft> {
  if (!input || typeof input !== "object") {
    throw new D13CapitalError("BAD_INPUT", "طلب D13 غير صالح.");
  }
  if (typeof input.signalId !== "string" || input.signalId.trim() === "") {
    throw new D13CapitalError("MISSING_SIGNAL_ID", "كل طلب D13 يتطلب signalId.");
  }
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
    throw new D13CapitalError("INVALID_AMOUNT", "كمية رأس المال يجب أن تكون رقمًا موجبًا.");
  }
  if (typeof input.rationale !== "string" || input.rationale.trim() === "") {
    throw new D13CapitalError("MISSING_RATIONALE", "كل طلب D13 يتطلب rationale.");
  }
  const category: D13CapitalCategory = input.category ?? "WISDOM";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const query = `${input.signalId} ${category} ${input.amount} ${input.rationale}`;
  const result = await search(query, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: D13Evidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: D13Verdict =
    evidence.length > 0 && topScore >= D13_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = categoryAuthority(category, input.amount);
  const auth = decideAuthority({
    subject: "d13-capital-runtime",
    action: `d13 capitalize: ${input.signalId} (${category})`,
    requested: authorityLevel,
  });
  const status: D13Status =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const enrichedRationale =
    verdict === "ACTIONABLE"
      ? `D13 Capital Runtime: grounded capitalization from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; signal=${input.signalId}; amount=${input.amount.toFixed(4)}; category=${category}; authority=${authorityLevel} (${auth.decision}); rationale=${input.rationale}`
      : `D13 Capital Runtime: insufficient evidence (top score=${topScore.toFixed(4)} < ${D13_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate capitalization confidence; signal=${input.signalId}; amount=${input.amount.toFixed(4)}; category=${category}; authority=${authorityLevel} (${auth.decision}); rationale=${input.rationale}`;

  const base: Omit<D13CapitalDraft, "fingerprint"> = {
    signalId: input.signalId,
    amount: Math.round(input.amount * 10000) / 10000,
    category,
    rationale: enrichedRationale,
    verdict,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintCapital(base) };
}


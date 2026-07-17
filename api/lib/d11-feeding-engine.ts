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

export type D11ObjectType =
  | "SIGNAL"
  | "PATTERN"
  | "UNDERSTANDING"
  | "JUDGMENT"
  | "WISDOM"
  | "LESSON";
export type D11OriginSource =
  | "L1_FOUNDER"
  | "L2_SIL"
  | "L3_COMPANION"
  | "L4_PARTNER"
  | "L5_REALITY"
  | "L6_PROCESS"
  | "L7_EXTERNAL"
  | "L8_GENERAL";
export type D11Verdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type D11Status = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";
export type D11Lifecycle = "RAW" | "VALIDATED";

export interface D11Evidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface D11FeedDraft {
  content: string;
  objectType: D11ObjectType;
  originSource: D11OriginSource;
  suggestedLifecycle: D11Lifecycle;
  verdict: D11Verdict;
  rationale: string;
  evidence: D11Evidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: D11Status;
  evalScore: number;
  fingerprint: string;
}

export class D11FeedingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "D11FeedingError";
    this.code = code;
  }
}

export const D11_RELEVANCE_THRESHOLD = 1.0;

function sourceAuthority(originSource: D11OriginSource): AuthorityLevel {
  if (originSource === "L1_FOUNDER" || originSource === "L2_SIL" || originSource === "L3_COMPANION") {
    return "A2";
  }
  return "A1";
}

function sourceLifecycle(originSource: D11OriginSource): D11Lifecycle {
  return originSource === "L7_EXTERNAL" ? "RAW" : "VALIDATED";
}

function fingerprintFeed(d: Omit<D11FeedDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    content: d.content,
    objectType: d.objectType,
    originSource: d.originSource,
    lifecycle: d.suggestedLifecycle,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface D11FeedInput {
  content: string;
  objectType?: D11ObjectType;
  originSource?: D11OriginSource;
  topK?: number;
  corpusDomain?: string;
}

export interface D11FeedDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function feedD11(
  input: D11FeedInput,
  deps: D11FeedDeps = {},
): Promise<D11FeedDraft> {
  if (!input || typeof input !== "object") {
    throw new D11FeedingError("BAD_INPUT", "طلب D11 غير صالح.");
  }
  if (typeof input.content !== "string" || input.content.trim() === "") {
    throw new D11FeedingError("MISSING_CONTENT", "كل طلب D11 يتطلب content.");
  }
  const objectType: D11ObjectType = input.objectType ?? "SIGNAL";
  const originSource: D11OriginSource = input.originSource ?? "L1_FOUNDER";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const result = await search(input.content, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: D11Evidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: D11Verdict =
    evidence.length > 0 && topScore >= D11_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = sourceAuthority(originSource);
  const auth = decideAuthority({
    subject: "d11-feeding-runtime",
    action: `d11 feed: ${input.content.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const status: D11Status =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";
  const suggestedLifecycle = sourceLifecycle(originSource);

  const rationale =
    verdict === "ACTIONABLE"
      ? `D11 Feeding Runtime: grounded feed from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; source=${originSource}; objectType=${objectType}; lifecycle=${suggestedLifecycle}; authority=${authorityLevel} (${auth.decision}).`
      : `D11 Feeding Runtime: insufficient evidence (top score=${topScore.toFixed(4)} < ${D11_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; source=${originSource}; objectType=${objectType}; lifecycle=${suggestedLifecycle}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<D11FeedDraft, "fingerprint"> = {
    content: input.content,
    objectType,
    originSource,
    suggestedLifecycle,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintFeed(base) };
}


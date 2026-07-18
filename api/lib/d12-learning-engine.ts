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

export type D12State =
  | "RAW"
  | "VALIDATED"
  | "PATTERN"
  | "UNDERSTANDING"
  | "JUDGMENT"
  | "WISDOM"
  | "CAPITALIZED"
  | "DECAYING"
  | "CORRECTING"
  | "ARCHIVED";
export type D12Trigger =
  | "PROVENANCE_GROUNDED"
  | "PATTERN_DETECTED"
  | "UNDERSTANDING_LADDER"
  | "CONSTITUTIONAL_VALIDATION"
  | "WISDOM_MATURATION"
  | "CAPITALIZATION"
  | "AMANAH_DECAY"
  | "CORRECTION_APPLIED"
  | "UNLEARN";
export type D12Verdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type D12Status = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface D12Evidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface D12TransitionDraft {
  objectId: string;
  fromState: D12State;
  toState: D12State;
  trigger: D12Trigger;
  rationale: string;
  verdict: D12Verdict;
  evidence: D12Evidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: D12Status;
  evalScore: number;
  fingerprint: string;
}

export class D12LearningError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "D12LearningError";
    this.code = code;
  }
}

export const D12_RELEVANCE_THRESHOLD = 1.0;

function transitionAuthority(toState: D12State): AuthorityLevel {
  if (toState === "JUDGMENT" || toState === "WISDOM" || toState === "CAPITALIZED") return "A2";
  return "A1";
}

function fingerprintTransition(d: Omit<D12TransitionDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    objectId: d.objectId,
    fromState: d.fromState,
    toState: d.toState,
    trigger: d.trigger,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface D12TransitionInput {
  objectId: string;
  fromState: D12State;
  toState: D12State;
  trigger: D12Trigger;
  rationale: string;
  topK?: number;
  corpusDomain?: string;
}

export interface D12TransitionDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function transitionD12(
  input: D12TransitionInput,
  deps: D12TransitionDeps = {},
): Promise<D12TransitionDraft> {
  if (!input || typeof input !== "object") {
    throw new D12LearningError("BAD_INPUT", "طلب D12 غير صالح.");
  }
  if (typeof input.objectId !== "string" || input.objectId.trim() === "") {
    throw new D12LearningError("MISSING_OBJECT_ID", "كل طلب D12 يتطلب objectId.");
  }
  if (typeof input.rationale !== "string" || input.rationale.trim() === "") {
    throw new D12LearningError("MISSING_RATIONALE", "كل انتقال D12 يتطلب rationale.");
  }

  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;
  const search = deps.search ?? searchCorpus;
  const corpusQuery = `${input.objectId} ${input.fromState} ${input.toState} ${input.trigger} ${input.rationale}`;
  const result = await search(corpusQuery, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: D12Evidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: D12Verdict =
    evidence.length > 0 && topScore >= D12_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = transitionAuthority(input.toState);
  const auth = decideAuthority({
    subject: "d12-learning-runtime",
    action: `d12 transition: ${input.objectId} ${input.fromState}->${input.toState}`,
    requested: authorityLevel,
  });
  const status: D12Status =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const enrichedRationale =
    verdict === "ACTIONABLE"
      ? `D12 Learning Runtime: grounded transition ${input.fromState}->${input.toState} from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; trigger=${input.trigger}; authority=${authorityLevel} (${auth.decision}); rationale=${input.rationale}`
      : `D12 Learning Runtime: insufficient evidence (top score=${topScore.toFixed(4)} < ${D12_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate transition confidence; trigger=${input.trigger}; authority=${authorityLevel} (${auth.decision}); rationale=${input.rationale}`;

  const base: Omit<D12TransitionDraft, "fingerprint"> = {
    objectId: input.objectId,
    fromState: input.fromState,
    toState: input.toState,
    trigger: input.trigger,
    rationale: enrichedRationale,
    verdict,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintTransition(base) };
}


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
import {
  allocate,
  type AllocationDecision,
  type AllocationRequest,
  type PriorityId,
} from "../allocation-engine";

export type AllocationVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type AllocationStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";
export type AllocationExecutionPolicy = "AUTO_EXECUTE" | "HUMAN_REVIEW_REQUIRED";

export interface AllocationEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface DurableAllocationDraft {
  question: string;
  request: AllocationRequest;
  decision: AllocationDecision;
  verdict: AllocationVerdict;
  rationale: string;
  evidence: AllocationEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: AllocationStatus;
  executionPolicy: AllocationExecutionPolicy;
  evalScore: number;
  fingerprint: string;
}

export class AllocationDurableError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "AllocationDurableError";
    this.code = code;
  }
}

export const ALLOCATION_RELEVANCE_THRESHOLD = 1.0;

function resolveAuthority(priorities: PriorityId[]): AuthorityLevel {
  const p = new Set(priorities);
  if (p.has("P1") || p.has("P2") || p.has("P3")) return "A2";
  return "A1";
}

function fingerprintDraft(d: Omit<DurableAllocationDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    question: d.question,
    decision: d.decision,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    executionPolicy: d.executionPolicy,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface DurableAllocationInput {
  question: string;
  request: AllocationRequest;
  topK?: number;
  corpusDomain?: string;
}

export interface DurableAllocationDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function decideDurableAllocation(
  input: DurableAllocationInput,
  deps: DurableAllocationDeps = {},
): Promise<DurableAllocationDraft> {
  if (!input || typeof input !== "object") {
    throw new AllocationDurableError("BAD_INPUT", "طلب D13.5 غير صالح.");
  }
  if (typeof input.question !== "string" || input.question.trim() === "") {
    throw new AllocationDurableError("MISSING_QUESTION", "كل طلب D13.5 يتطلب question.");
  }
  if (!input.request || typeof input.request !== "object") {
    throw new AllocationDurableError("MISSING_REQUEST", "كل طلب D13.5 يتطلب request.");
  }

  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;
  const search = deps.search ?? searchCorpus;
  const result = await search(input.question, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: AllocationEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: AllocationVerdict =
    evidence.length > 0 && topScore >= ALLOCATION_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const decision = allocate(input.request);
  const authorityLevel = resolveAuthority(input.request.priorities);
  const auth = decideAuthority({
    subject: "allocation-d13.5",
    action: `allocation decision: ${input.question.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const canAutoExecute =
    verdict === "ACTIONABLE" &&
    auth.decision === "GRANTED" &&
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING);
  const status: AllocationStatus = canAutoExecute ? "EXECUTED_ELIGIBLE" : "REQUIRES_APPROVAL";
  const executionPolicy: AllocationExecutionPolicy = canAutoExecute
    ? "AUTO_EXECUTE"
    : "HUMAN_REVIEW_REQUIRED";

  const rationale =
    verdict === "ACTIONABLE"
      ? `D13.5 Allocation: grounded decision from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; priority=${decision.priority ?? "NONE"}; mode=${decision.mode}; authority=${authorityLevel} (${auth.decision}); executionPolicy=${executionPolicy}.`
      : `D13.5 Allocation: insufficient evidence (top score=${topScore.toFixed(4)} < ${ALLOCATION_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; priority=${decision.priority ?? "NONE"}; mode=${decision.mode}; authority=${authorityLevel} (${auth.decision}); executionPolicy=${executionPolicy}.`;

  const base: Omit<DurableAllocationDraft, "fingerprint"> = {
    question: input.question,
    request: input.request,
    decision,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    executionPolicy,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintDraft(base) };
}

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

export type PersonalContext = "PERSONAL" | "WELLNESS" | "PRODUCTIVITY" | "FINANCE";
export type PersonalVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type PersonalStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface PersonalEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface PersonalPlanDraft {
  request: string;
  context: PersonalContext;
  verdict: PersonalVerdict;
  rationale: string;
  evidence: PersonalEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: PersonalStatus;
  evalScore: number;
  fingerprint: string;
}

export class PersonalAssistantError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "PersonalAssistantError";
    this.code = code;
  }
}

export const PERSONAL_RELEVANCE_THRESHOLD = 1.0;

function contextAuthority(context: PersonalContext): AuthorityLevel {
  return context === "FINANCE" ? "A2" : "A1";
}

function fingerprintPlan(d: Omit<PersonalPlanDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    request: d.request,
    context: d.context,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface PersonalPlanInput {
  request: string;
  context?: PersonalContext;
  topK?: number;
  domain?: string;
}

export interface PersonalPlanDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function planPersonal(
  input: PersonalPlanInput,
  deps: PersonalPlanDeps = {},
): Promise<PersonalPlanDraft> {
  if (!input || typeof input !== "object") {
    throw new PersonalAssistantError("BAD_INPUT", "طلب المساعد الشخصي غير صالح.");
  }
  if (typeof input.request !== "string" || input.request.trim() === "") {
    throw new PersonalAssistantError("MISSING_REQUEST", "كل طلب شخصي يتطلب request.");
  }
  const context: PersonalContext = input.context ?? "PERSONAL";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const result = await search(input.request, {
    limit: topK,
    ...(input.domain ? { domain: input.domain } : {}),
  });
  const evidence: PersonalEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: PersonalVerdict =
    evidence.length > 0 && topScore >= PERSONAL_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = contextAuthority(context);
  const auth = decideAuthority({
    subject: "personal-assistant",
    action: `personal plan: ${input.request.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const status: PersonalStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `Personal Assistant: grounded plan from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; context=${context}; authority=${authorityLevel} (${auth.decision}).`
      : `Personal Assistant: insufficient evidence (top score=${topScore.toFixed(4)} < ${PERSONAL_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; context=${context}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<PersonalPlanDraft, "fingerprint"> = {
    request: input.request,
    context,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintPlan(base) };
}


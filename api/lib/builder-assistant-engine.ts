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

export type BuilderScope = "FEATURE" | "ARCHITECTURE" | "REFACTOR" | "DELIVERY";
export type BuilderVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type BuilderStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface BuilderEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface BuilderPlanDraft {
  task: string;
  scope: BuilderScope;
  verdict: BuilderVerdict;
  rationale: string;
  evidence: BuilderEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: BuilderStatus;
  evalScore: number;
  fingerprint: string;
}

export class BuilderAssistantError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "BuilderAssistantError";
    this.code = code;
  }
}

export const BUILDER_RELEVANCE_THRESHOLD = 1.0;

function scopeAuthority(scope: BuilderScope): AuthorityLevel {
  if (scope === "ARCHITECTURE") return "A2";
  if (scope === "DELIVERY") return "A2";
  return "A1";
}

function fingerprintPlan(d: Omit<BuilderPlanDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    task: d.task,
    scope: d.scope,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface BuilderPlanInput {
  task: string;
  scope?: BuilderScope;
  topK?: number;
  domain?: string;
}

export interface BuilderPlanDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function planBuilder(
  input: BuilderPlanInput,
  deps: BuilderPlanDeps = {},
): Promise<BuilderPlanDraft> {
  if (!input || typeof input !== "object") {
    throw new BuilderAssistantError("BAD_INPUT", "طلب Builder غير صالح.");
  }
  if (typeof input.task !== "string" || input.task.trim() === "") {
    throw new BuilderAssistantError("MISSING_TASK", "كل طلب Builder يتطلب task.");
  }
  const scope: BuilderScope = input.scope ?? "FEATURE";
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const result = await search(input.task, {
    limit: topK,
    ...(input.domain ? { domain: input.domain } : {}),
  });
  const evidence: BuilderEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: BuilderVerdict =
    evidence.length > 0 && topScore >= BUILDER_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = scopeAuthority(scope);
  const auth = decideAuthority({
    subject: "builder-assistant",
    action: `builder plan: ${input.task.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const status: BuilderStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `Builder Assistant: grounded plan from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; scope=${scope}; authority=${authorityLevel} (${auth.decision}).`
      : `Builder Assistant: insufficient evidence (top score=${topScore.toFixed(4)} < ${BUILDER_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; scope=${scope}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<BuilderPlanDraft, "fingerprint"> = {
    task: input.task,
    scope,
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


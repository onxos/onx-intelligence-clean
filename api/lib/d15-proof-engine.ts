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
import { runProofSuite } from "../proof-engine";

export type D15VerificationMode = "CRITERIA" | "CONTRADICTION" | "STRESS" | "FAULT";
export type D15Verdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type D15Status = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface D15Evidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface D15Decision {
  mode: D15VerificationMode;
  suiteGreen: boolean;
  faultRecovery: number;
  contradictionCount: number;
}

export interface D15VerificationDraft {
  suiteId: string;
  mode: D15VerificationMode;
  target: string;
  stressLevel: number;
  decision: D15Decision;
  verdict: D15Verdict;
  rationale: string;
  evidence: D15Evidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: D15Status;
  evalScore: number;
  fingerprint: string;
}

export class D15ProofError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "D15ProofError";
    this.code = code;
  }
}

export const D15_RELEVANCE_THRESHOLD = 1.0;

function resolveAuthority(mode: D15VerificationMode, stressLevel: number): AuthorityLevel {
  if (mode === "FAULT" || stressLevel >= 7) return "A2";
  return "A1";
}

function fingerprintDraft(d: Omit<D15VerificationDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    suiteId: d.suiteId,
    mode: d.mode,
    target: d.target,
    stressLevel: d.stressLevel,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
    suiteGreen: d.decision.suiteGreen,
    faultRecovery: d.decision.faultRecovery,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface D15VerificationInput {
  suiteId: string;
  mode: D15VerificationMode;
  target: string;
  stressLevel: number;
  topK?: number;
  corpusDomain?: string;
}

export interface D15VerificationDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function verifyD15(
  input: D15VerificationInput,
  deps: D15VerificationDeps = {},
): Promise<D15VerificationDraft> {
  if (!input || typeof input !== "object") {
    throw new D15ProofError("BAD_INPUT", "طلب D15 غير صالح.");
  }
  if (typeof input.suiteId !== "string" || input.suiteId.trim() === "") {
    throw new D15ProofError("MISSING_SUITE_ID", "كل طلب D15 يتطلب suiteId.");
  }
  if (typeof input.target !== "string" || input.target.trim() === "") {
    throw new D15ProofError("MISSING_TARGET", "كل طلب D15 يتطلب target.");
  }
  if (
    typeof input.stressLevel !== "number" ||
    !Number.isFinite(input.stressLevel) ||
    input.stressLevel < 0 ||
    input.stressLevel > 10
  ) {
    throw new D15ProofError("INVALID_STRESS_LEVEL", "stressLevel يجب أن يكون بين 0 و 10.");
  }

  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;
  const search = deps.search ?? searchCorpus;
  const query = `${input.suiteId} ${input.mode} ${input.target} stress:${input.stressLevel}`;
  const result = await search(query, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: D15Evidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);

  const suite = runProofSuite();
  const decision: D15Decision = {
    mode: input.mode,
    suiteGreen: suite.allGreen,
    faultRecovery: suite.faultRecovery,
    contradictionCount: suite.contradictions.length,
  };
  const verdict: D15Verdict =
    evidence.length > 0 &&
    topScore >= D15_RELEVANCE_THRESHOLD &&
    suite.allGreen &&
    suite.faultRecovery === 1
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const authorityLevel = resolveAuthority(input.mode, input.stressLevel);
  const auth = decideAuthority({
    subject: "d15-proof-runtime",
    action: `d15 verify: ${input.suiteId} ${input.mode} ${input.target.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const canExecute =
    verdict === "ACTIONABLE" &&
    auth.decision === "GRANTED" &&
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING);
  const status: D15Status = canExecute ? "EXECUTED_ELIGIBLE" : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `D15 Proof Runtime: grounded verification from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; suiteGreen=${suite.allGreen}; faultRecovery=${suite.faultRecovery.toFixed(4)}; mode=${input.mode}; target=${input.target}; authority=${authorityLevel} (${auth.decision}).`
      : `D15 Proof Runtime: insufficient evidence (top score=${topScore.toFixed(4)} < ${D15_RELEVANCE_THRESHOLD}) or proof gates not fully green (suiteGreen=${suite.allGreen}; faultRecovery=${suite.faultRecovery.toFixed(4)}); fail-honest refusal to fabricate readiness; mode=${input.mode}; target=${input.target}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<D15VerificationDraft, "fingerprint"> = {
    suiteId: input.suiteId,
    mode: input.mode,
    target: input.target,
    stressLevel: input.stressLevel,
    decision,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: fingerprintDraft(base) };
}

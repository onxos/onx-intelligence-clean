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

export type D14Context =
  | "FOUNDER"
  | "CLINIC"
  | "PERSONAL"
  | "BUILDER"
  | "OPERATOR"
  | "ANALYST"
  | "PLATFORM";
export type D14Route =
  | "L1_FOUNDER"
  | "L2_SIL"
  | "L3_COMPANION"
  | "L4_PARTNER"
  | "L5_REALITY"
  | "L6_PROCESS"
  | "L7_EXTERNAL"
  | "L8_GENERAL";
export type D14Mode = "SELECT_SOURCE" | "ROUTE" | "ARBITRATE" | "SYNTHESIZE" | "BOUNDARY_GUARD";
export type D14BoundaryGuard = "ALLOW" | "REVIEW" | "BLOCK";
export type D14Verdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type D14Status = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface D14Evidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface D14Decision {
  mode: D14Mode;
  selectedRoute: D14Route;
  selectedPerspective: string;
  boundaryGuard: D14BoundaryGuard;
}

export interface D14CoordinationDraft {
  topic: string;
  context: D14Context;
  route: D14Route;
  conflictLevel: number;
  decision: D14Decision;
  verdict: D14Verdict;
  rationale: string;
  evidence: D14Evidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: D14Status;
  evalScore: number;
  fingerprint: string;
}

export class D14CoordinationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "D14CoordinationError";
    this.code = code;
  }
}

export const D14_RELEVANCE_THRESHOLD = 1.0;

function resolvePerspective(context: D14Context): string {
  if (context === "FOUNDER") return "STRATEGIC_COMMAND";
  if (context === "CLINIC") return "CLINICAL_OPERATION";
  if (context === "PERSONAL") return "PERSONAL_CONTINUITY";
  if (context === "BUILDER") return "EXECUTION_BUILD";
  if (context === "OPERATOR") return "OPERATIONAL_RELIABILITY";
  if (context === "ANALYST") return "ANALYTICAL_TRUTH";
  return "PLATFORM_INTEGRATION";
}

function resolveMode(conflictLevel: number, context: D14Context): D14Mode {
  if (conflictLevel >= 8) return "BOUNDARY_GUARD";
  if (conflictLevel >= 6) return "ARBITRATE";
  if (context === "PLATFORM") return "SELECT_SOURCE";
  if (context === "ANALYST") return "SYNTHESIZE";
  return "ROUTE";
}

function resolveBoundaryGuard(conflictLevel: number): D14BoundaryGuard {
  if (conflictLevel >= 8) return "BLOCK";
  if (conflictLevel >= 5) return "REVIEW";
  return "ALLOW";
}

function resolveAuthority(route: D14Route, conflictLevel: number, guard: D14BoundaryGuard): AuthorityLevel {
  if (guard === "BLOCK" || conflictLevel >= 7 || route === "L1_FOUNDER" || route === "L2_SIL") return "A2";
  return "A1";
}

function fingerprintCoordination(d: Omit<D14CoordinationDraft, "fingerprint">): string {
  const canonical = JSON.stringify({
    topic: d.topic,
    context: d.context,
    route: d.route,
    conflictLevel: d.conflictLevel,
    mode: d.decision.mode,
    boundaryGuard: d.decision.boundaryGuard,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface D14CoordinationInput {
  topic: string;
  context: D14Context;
  route: D14Route;
  conflictLevel: number;
  topK?: number;
  corpusDomain?: string;
}

export interface D14CoordinationDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function coordinateD14(
  input: D14CoordinationInput,
  deps: D14CoordinationDeps = {},
): Promise<D14CoordinationDraft> {
  if (!input || typeof input !== "object") {
    throw new D14CoordinationError("BAD_INPUT", "طلب D14 غير صالح.");
  }
  if (typeof input.topic !== "string" || input.topic.trim() === "") {
    throw new D14CoordinationError("MISSING_TOPIC", "كل طلب D14 يتطلب topic.");
  }
  if (
    typeof input.conflictLevel !== "number" ||
    !Number.isFinite(input.conflictLevel) ||
    input.conflictLevel < 0 ||
    input.conflictLevel > 10
  ) {
    throw new D14CoordinationError("INVALID_CONFLICT_LEVEL", "conflictLevel يجب أن يكون بين 0 و 10.");
  }

  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;
  const search = deps.search ?? searchCorpus;
  const query = `${input.topic} ${input.context} ${input.route} conflict:${input.conflictLevel}`;
  const result = await search(query, {
    limit: topK,
    ...(input.corpusDomain ? { domain: input.corpusDomain } : {}),
  });
  const evidence: D14Evidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: D14Verdict =
    evidence.length > 0 && topScore >= D14_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";

  const boundaryGuard = resolveBoundaryGuard(input.conflictLevel);
  const decision: D14Decision = {
    mode: resolveMode(input.conflictLevel, input.context),
    selectedRoute: input.route,
    selectedPerspective: resolvePerspective(input.context),
    boundaryGuard,
  };
  const authorityLevel = resolveAuthority(input.route, input.conflictLevel, boundaryGuard);
  const auth = decideAuthority({
    subject: "d14-coordination-runtime",
    action: `d14 coordinate: ${input.context} ${input.route} ${input.topic.slice(0, 120)}`,
    requested: authorityLevel,
  });
  const canExecute =
    verdict === "ACTIONABLE" &&
    auth.decision === "GRANTED" &&
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING) &&
    boundaryGuard !== "BLOCK";
  const status: D14Status = canExecute ? "EXECUTED_ELIGIBLE" : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `D14 Coordination Runtime: grounded decision from ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; context=${input.context}; route=${input.route}; mode=${decision.mode}; guard=${boundaryGuard}; authority=${authorityLevel} (${auth.decision}).`
      : `D14 Coordination Runtime: insufficient evidence (top score=${topScore.toFixed(4)} < ${D14_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate orchestration certainty; context=${input.context}; route=${input.route}; mode=${decision.mode}; guard=${boundaryGuard}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<D14CoordinationDraft, "fingerprint"> = {
    topic: input.topic,
    context: input.context,
    route: input.route,
    conflictLevel: input.conflictLevel,
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
  return { ...base, fingerprint: fingerprintCoordination(base) };
}

// ============================================================
// TITAN DECISION ENGINE (Phase P) — operational, deterministic
//
// Converts the 5 Titans from a prompt-only GPT-4o wrapper
// (titan-bridge-router.ts callTitan + in-memory sessions Map) into
// a genuinely OPERATIONAL decision system with six properties:
//   1. durable state    → titan-decision-store.ts (raw pg)
//   2. real tool        → searchCorpus (BM25, corpus-search.ts)
//   3. memory           → durable decision history read-back
//   4. authorization    → decideAuthority (AuthorityGate, A0–A5)
//   5. evaluation       → deterministic eval score from retrieval
//   6. outcome feedback → recorded outcome recomputes accuracy
//
// FULLY DETERMINISTIC — no OpenAI key, no external call (D-19
// envelope). Grounds every decision in measured corpus evidence and
// REFUSES honestly (INSUFFICIENT_EVIDENCE) below the relevance
// threshold instead of fabricating. Above the autonomy ceiling a
// decision is REQUIRES_APPROVAL and is never auto-executed.
// ============================================================
import { searchCorpus, type CorpusSearchResult } from "./corpus-search";
import {
  decideAuthority,
  authorityRank,
  AUTO_GRANT_CEILING,
  type AuthorityLevel,
  type AuthorityDecision,
} from "./authority-gate";
import { TITAN_REGISTRY, isTitanId, type TitanIdentity } from "./titan-registry";
import { createHash } from "crypto";

// Minimum BM25 top-hit score for a decision to be GROUNDED. Mirrors
// answer-composer.ts RELEVANCE_THRESHOLD (1.0): below it there is no
// honest evidentiary basis, so the titan refuses rather than guess.
export const TITAN_RELEVANCE_THRESHOLD = 1.0;

// Deterministic confidence curve scale (mirrors intent-engine.ts).
export const TITAN_EVAL_SCALE = 5;

export type TitanVerdict = "GROUNDED" | "INSUFFICIENT_EVIDENCE";
export type TitanStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface TitanEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface TitanDecisionDraft {
  titanId: string;
  titanName: string;
  domain: string;
  subject: string;
  query: string;
  verdict: TitanVerdict;
  rationale: string;
  evidence: TitanEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: TitanStatus;
  hasVeto: boolean;
  /** Deterministic evaluation score in [0,1], rounded to 4 decimals. */
  evalScore: number;
  /** sha256 over the canonical decision fields (id/outcome/time excluded). */
  fingerprint: string;
}

export class TitanEngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "TitanEngineError";
    this.code = code;
  }
}

/** 1 − e^(−score/scale), clamped to [0,1], rounded to 4 decimals. */
export function computeTitanEvalScore(topScore: number): number {
  if (typeof topScore !== "number" || !Number.isFinite(topScore) || topScore <= 0) {
    return 0;
  }
  const raw = 1 - Math.exp(-topScore / TITAN_EVAL_SCALE);
  const clamped = Math.min(1, Math.max(0, raw));
  return Math.round(clamped * 10000) / 10000;
}

function fingerprintDecision(d: Omit<TitanDecisionDraft, "fingerprint">): string {
  // Canonical, order-frozen projection — deterministic across runs.
  const canonical = JSON.stringify({
    titanId: d.titanId,
    subject: d.subject,
    query: d.query,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface TitanDecideInput {
  titanId: string;
  subject: string;
  query: string;
  /** How many corpus hits to ground on (1..20, default 5). */
  topK?: number;
  /** Optional corpus domain filter passed to the retrieval tool. */
  domain?: string;
}

export interface TitanDecideDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

/**
 * Deterministically decide on `subject` for `titanId`, grounded in the
 * corpus via BM25 retrieval, authority-classified, and evaluated. Pure
 * except for the injected retrieval tool (defaults to the live corpus).
 * Fail-closed on bad input; fail-honest below the relevance threshold.
 */
export async function decideTitan(
  input: TitanDecideInput,
  deps: TitanDecideDeps = {},
): Promise<TitanDecisionDraft> {
  if (!input || typeof input !== "object") {
    throw new TitanEngineError("BAD_INPUT", "طلب قرار غير صالح.");
  }
  if (!isTitanId(input.titanId)) {
    throw new TitanEngineError(
      "TITAN_NOT_FOUND",
      `تيتان غير معروف: «${String(input.titanId)}». المتاح: ${Object.keys(TITAN_REGISTRY).join(", ")}.`,
    );
  }
  if (typeof input.subject !== "string" || input.subject.trim() === "") {
    throw new TitanEngineError("MISSING_SUBJECT", "كل قرار يتطلب موضوعاً (subject).");
  }
  if (typeof input.query !== "string" || input.query.trim() === "") {
    throw new TitanEngineError("MISSING_QUERY", "كل قرار يتطلب استعلاماً (query) للاستناد.");
  }

  const titan: TitanIdentity = TITAN_REGISTRY[input.titanId];
  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;

  const search = deps.search ?? searchCorpus;
  const result = await search(input.query, {
    limit: topK,
    ...(input.domain ? { domain: input.domain } : {}),
  });

  const hits = Array.isArray(result?.hits) ? result.hits : [];
  const evidence: TitanEvidence[] = hits.map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));

  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const grounded = evidence.length > 0 && topScore >= TITAN_RELEVANCE_THRESHOLD;
  const verdict: TitanVerdict = grounded ? "GROUNDED" : "INSUFFICIENT_EVIDENCE";

  // Authorization: what the carried-out decision would require.
  const action = `titan:${titan.id} decide on «${input.subject}»`;
  const authorityLevel = titan.actionAuthority;
  const auth = decideAuthority({
    subject: `titan-decision:${titan.id}`,
    action,
    requested: authorityLevel,
  });
  const status: TitanStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale = grounded
    ? `${titan.nameAr} (${titan.name} — ${titan.domain}): قرار مُستند إلى ${evidence.length} دليلاً من الذخيرة (أقواها «${evidence[0].title}»، score=${topScore.toFixed(4)}). ` +
      `authority=${authorityLevel} (${auth.decision}); status=${status}.` +
      (titan.hasVeto ? " [VETO holder]" : "")
    : `${titan.nameAr} (${titan.name} — ${titan.domain}): أدلة غير كافية (أعلى score=${topScore.toFixed(4)} < العتبة ${TITAN_RELEVANCE_THRESHOLD}). ` +
      `رفض صادق بلا تلفيق. authority=${authorityLevel} (${auth.decision}); status=${status}.`;

  const base: Omit<TitanDecisionDraft, "fingerprint"> = {
    titanId: titan.id,
    titanName: titan.name,
    domain: titan.domain,
    subject: input.subject,
    query: input.query,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    hasVeto: titan.hasVeto,
    evalScore,
  };

  return { ...base, fingerprint: fingerprintDecision(base) };
}

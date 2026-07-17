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

export type ClinicSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ClinicVerdict = "ACTIONABLE" | "INSUFFICIENT_EVIDENCE";
export type ClinicStatus = "EXECUTED_ELIGIBLE" | "REQUIRES_APPROVAL";

export interface ClinicEvidence {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface ClinicAssessmentDraft {
  species: string;
  chiefComplaint: string;
  symptoms: string[];
  severity: ClinicSeverity;
  verdict: ClinicVerdict;
  rationale: string;
  evidence: ClinicEvidence[];
  authorityLevel: AuthorityLevel;
  authorityDecision: AuthorityDecision;
  authorityReason: string;
  status: ClinicStatus;
  evalScore: number;
  fingerprint: string;
}

export class ClinicAssistantError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ClinicAssistantError";
    this.code = code;
  }
}

export const CLINIC_RELEVANCE_THRESHOLD = 1.0;

const EMERGENCY_TERMS = [
  "difficulty breathing",
  "breathing",
  "cyanosis",
  "seizure",
  "seizures",
  "collapse",
  "shock",
  "severe bleeding",
  "can't breathe",
];

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function classifyClinicSeverity(
  chiefComplaint: string,
  symptoms: string[],
): ClinicSeverity {
  const all = [chiefComplaint, ...symptoms].map(normalize).join(" ");
  if (EMERGENCY_TERMS.some((term) => all.includes(term))) return "CRITICAL";
  if (all.includes("dehydration") || all.includes("persistent vomiting")) return "HIGH";
  if (all.includes("fever") || all.includes("lethargy") || all.includes("diarrhea")) {
    return "MEDIUM";
  }
  return "LOW";
}

function canonicalFingerprint(
  d: Omit<ClinicAssessmentDraft, "fingerprint">,
): string {
  const canonical = JSON.stringify({
    species: d.species,
    chiefComplaint: d.chiefComplaint,
    symptoms: d.symptoms,
    severity: d.severity,
    verdict: d.verdict,
    evidenceIds: d.evidence.map((e) => e.id),
    authorityLevel: d.authorityLevel,
    authorityDecision: d.authorityDecision,
    status: d.status,
    evalScore: d.evalScore,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ClinicAssessInput {
  species: string;
  chiefComplaint: string;
  symptoms: string[];
  topK?: number;
  domain?: string;
}

export interface ClinicAssessDeps {
  search?: (
    query: string,
    options?: { domain?: string; limit?: number; offset?: number },
  ) => Promise<CorpusSearchResult>;
}

export async function assessClinicCase(
  input: ClinicAssessInput,
  deps: ClinicAssessDeps = {},
): Promise<ClinicAssessmentDraft> {
  if (!input || typeof input !== "object") {
    throw new ClinicAssistantError("BAD_INPUT", "طلب تقييم الحالة غير صالح.");
  }
  if (typeof input.species !== "string" || input.species.trim() === "") {
    throw new ClinicAssistantError("MISSING_SPECIES", "يجب تحديد نوع الحيوان.");
  }
  if (typeof input.chiefComplaint !== "string" || input.chiefComplaint.trim() === "") {
    throw new ClinicAssistantError("MISSING_COMPLAINT", "يجب تحديد الشكوى الرئيسية.");
  }
  if (!Array.isArray(input.symptoms) || input.symptoms.length === 0) {
    throw new ClinicAssistantError("MISSING_SYMPTOMS", "يجب تحديد عرض واحد على الأقل.");
  }

  const topK =
    typeof input.topK === "number" && Number.isFinite(input.topK)
      ? Math.min(20, Math.max(1, Math.floor(input.topK)))
      : 5;
  const severity = classifyClinicSeverity(input.chiefComplaint, input.symptoms);
  const authorityLevel: AuthorityLevel = severity === "HIGH" || severity === "CRITICAL" ? "A2" : "A1";
  const search = deps.search ?? searchCorpus;
  const query = [input.species, input.chiefComplaint, ...input.symptoms].join(" ").trim();
  const result = await search(query, {
    limit: topK,
    ...(input.domain ? { domain: input.domain } : {}),
  });
  const evidence: ClinicEvidence[] = (result?.hits ?? []).map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));
  const topScore = evidence.length > 0 ? evidence[0].score : 0;
  const evalScore = computeTitanEvalScore(topScore);
  const verdict: ClinicVerdict =
    evidence.length > 0 && topScore >= CLINIC_RELEVANCE_THRESHOLD
      ? "ACTIONABLE"
      : "INSUFFICIENT_EVIDENCE";
  const auth = decideAuthority({
    subject: `clinic-assistant:${normalize(input.species)}`,
    action: `assess case ${input.chiefComplaint}`,
    requested: authorityLevel,
  });
  const status: ClinicStatus =
    authorityRank(authorityLevel) <= authorityRank(AUTO_GRANT_CEILING)
      ? "EXECUTED_ELIGIBLE"
      : "REQUIRES_APPROVAL";

  const rationale =
    verdict === "ACTIONABLE"
      ? `Clinic Assistant: assessment grounded in ${evidence.length} corpus evidence item(s); top score=${topScore.toFixed(4)}; severity=${severity}; authority=${authorityLevel} (${auth.decision}).`
      : `Clinic Assistant: insufficient evidence (top score=${topScore.toFixed(4)} < ${CLINIC_RELEVANCE_THRESHOLD}); fail-honest refusal to fabricate; severity=${severity}; authority=${authorityLevel} (${auth.decision}).`;

  const base: Omit<ClinicAssessmentDraft, "fingerprint"> = {
    species: input.species,
    chiefComplaint: input.chiefComplaint,
    symptoms: input.symptoms,
    severity,
    verdict,
    rationale,
    evidence,
    authorityLevel,
    authorityDecision: auth.decision,
    authorityReason: auth.reason,
    status,
    evalScore,
  };
  return { ...base, fingerprint: canonicalFingerprint(base) };
}


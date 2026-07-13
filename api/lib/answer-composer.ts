// ============================================================
// ANSWER COMPOSER — STE-K-04 "Deterministic cited answer" (ask.onx)
// Composition wave: fuses the STE-K-01 BM25 retrieval and the
// STE-K-02 intent engine into ONE working capability. Zero LLM,
// zero keys — fully deterministic (D-19 envelope).
//
// question → classifyIntent (leading intent + confidence)
//          → searchCorpus top-k (BM25, k=5 default)
//          → deterministic answer assembled from cited snippets,
//            with an intent-specific lead-in (EMERGENCY leads with
//            an immediate-care warning).
//
// Honesty guarantees:
//  - truthDisclosure carries the OSVA corpus verdict: the current
//    seed is templated (DEMO), so answers say so literally — no
//    marketing.
//  - Below a declared relevance threshold the composer REFUSES
//    (INSUFFICIENT_EVIDENCE) instead of fabricating or padding.
// ============================================================
import { classifyIntent, type IntentId } from "./intent-engine";
import { searchCorpus } from "./corpus-search";
import { buildCorpusManifest } from "../knowledge-router";

// Declared, constant relevance floor. A top BM25 score below this
// means the corpus holds no genuinely relevant evidence → refuse.
export const RELEVANCE_THRESHOLD = 1.0;
export const DEFAULT_TOP_K = 5;

export type AnswerStatus = "ANSWERED" | "INSUFFICIENT_EVIDENCE";

export interface AnswerCitation {
  id: string;
  domain: string;
  title: string;
  score: number;
}

export interface ComposedAnswer {
  deterministic: true;
  engine: "COMPOSER_SAFE";
  question: string;
  intent: IntentId;
  confidence: number;
  status: AnswerStatus;
  answer: string | null;
  refusal: string | null;
  citations: AnswerCitation[];
  truthDisclosure: string;
  relevanceThreshold: number;
  topScore: number;
}

// Intent-specific opening lines (Arabic). EMERGENCY leads with an
// unmissable immediate-care warning before any retrieved content.
const LEAD_INS: Record<IntentId, string> = {
  EMERGENCY:
    "⚠️ حالة طارئة محتملة: توجّه فوراً إلى أقرب مستشفى/طوارئ بيطرية أو اتصل بالطبيب المناوب الآن. ما يلي للاسترشاد فقط ولا يغني عن التدخل العاجل.",
  BOOKING: "بخصوص حجز موعد، إليك ما وجدته في الذخيرة:",
  PRICING: "بخصوص الأسعار/التكلفة، إليك ما وجدته في الذخيرة:",
  COMPLAINT: "بخصوص ملاحظتك/شكواك، إليك ما وجدته في الذخيرة:",
  RESULTS: "بخصوص نتائج الفحوصات، إليك ما وجدته في الذخيرة:",
  REFILL: "بخصوص إعادة صرف الدواء، إليك ما وجدته في الذخيرة:",
  INFO: "إليك ما وجدته في الذخيرة بخصوص استفسارك:",
};

function buildTruthDisclosure(): string {
  const m = buildCorpusManifest();
  // The corpus verdict in OSVA is DEMO until the authentic archive
  // lands (STE-REC-06) — state it literally, never as a claim of
  // authoritative knowledge.
  return (
    `DEMO: الذخيرة الحالية محتوى قالبي مُولَّد (${m.rawTotal} وحدة، ` +
    `${m.uniqueByTitleBody} فريدة، ثبات=${m.persistence}) — ليست مرجعاً أصيلاً؛ ` +
    `الأصيل قيد الاسترداد (STE-REC-06، انظر docs/CORPUS_GAP_REPORT.md).`
  );
}

export interface ComposeOptions {
  topK?: number;
  domain?: string;
}

export async function composeAnswer(
  question: string,
  options: ComposeOptions = {},
): Promise<ComposedAnswer> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const classification = classifyIntent(question, 1);
  const leading = classification.results[0];
  const intent = leading.intent;
  const confidence = leading.confidence;
  const truthDisclosure = buildTruthDisclosure();

  const search = await searchCorpus(question, { limit: topK, domain: options.domain });
  const hits = search.hits;
  const topScore = hits.length > 0 ? hits[0].score : 0;

  const base = {
    deterministic: true as const,
    engine: "COMPOSER_SAFE" as const,
    question,
    intent,
    confidence,
    truthDisclosure,
    relevanceThreshold: RELEVANCE_THRESHOLD,
    topScore,
  };

  // Honest refusal: no fabrication, no padding.
  if (topScore < RELEVANCE_THRESHOLD) {
    return {
      ...base,
      status: "INSUFFICIENT_EVIDENCE",
      answer: null,
      refusal:
        `لا دليل كافٍ في الذخيرة للإجابة على هذا السؤال ` +
        `(أعلى صلة ${topScore} < العتبة ${RELEVANCE_THRESHOLD}). ` +
        `لا يُقدَّم جواب ملفّق.`,
      citations: [],
    };
  }

  const citations: AnswerCitation[] = hits.map((h) => ({
    id: h.id,
    domain: h.domain,
    title: h.title,
    score: h.score,
  }));

  // Deterministic assembly: fixed lead-in, then cited snippets in
  // BM25 score order (already sorted by searchCorpus).
  const lines = [LEAD_INS[intent]];
  hits.forEach((h, i) => {
    lines.push(`[${i + 1}] ${h.title} — ${h.snippet}`);
  });

  return {
    ...base,
    status: "ANSWERED",
    answer: lines.join("\n\n"),
    refusal: null,
    citations,
  };
}

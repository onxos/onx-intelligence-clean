// ============================================================
// INTENT ENGINE — LLM PATH (GPT-4o) with deterministic fallback
// STE-K-REAL: upgrades intent classification from RULE_BASED_SAFE
// to real LLM understanding, while preserving the deterministic
// rule engine as a fail-safe (D-19: no fabricated confidence —
// if the LLM is unavailable or fails, we honestly fall back and
// SAY so in the `engine` field).
//
// Contract: same IntentId taxonomy as intent-engine.ts, so
// downstream consumers never see a shape change — only a better
// engine label and (usually) higher-quality ranking.
// ============================================================
import OpenAI from "openai";
import { env } from "./env";
import { classifyIntent, type IntentId } from "./intent-engine";

const VALID_INTENTS: readonly IntentId[] = [
  "EMERGENCY",
  "BOOKING",
  "PRICING",
  "COMPLAINT",
  "RESULTS",
  "REFILL",
  "INFO",
];

const INTENT_NAMES: Record<IntentId, { nameAr: string; nameEn: string }> = {
  EMERGENCY: { nameAr: "طوارئ", nameEn: "Emergency" },
  BOOKING: { nameAr: "حجز", nameEn: "Booking" },
  PRICING: { nameAr: "أسعار", nameEn: "Pricing" },
  COMPLAINT: { nameAr: "شكوى", nameEn: "Complaint" },
  RESULTS: { nameAr: "نتائج", nameEn: "Results" },
  REFILL: { nameAr: "إعادة صرف", nameEn: "Refill" },
  INFO: { nameAr: "استفسار عام", nameEn: "General info" },
};

const LLM_TIMEOUT_MS = 8000;

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  const key = env.openAiApiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!openai) openai = new OpenAI({ apiKey: key });
  return openai;
}

interface LlmIntentResult {
  engine: "LLM_GPT4O";
  mode: "LLM_WITH_RULE_FALLBACK";
  tokenCount: number;
  results: Array<{
    intent: IntentId;
    nameAr: string;
    nameEn: string;
    score: number;
    confidence: number;
    fallback: boolean;
    trace: { keywords: never[]; phrases: never[]; llm?: string };
  }>;
}

/**
 * Classify with GPT-4o. Returns null on ANY failure (no key, timeout,
 * bad JSON, invalid intents) so the caller falls back to rules.
 */
export async function classifyIntentWithLLM(
  text: string,
  topN: number,
): Promise<LlmIntentResult | null> {
  const client = getOpenAI();
  if (!client) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the ONX veterinary-clinic intent classifier. " +
              "Classify the user message (Arabic or English) into ranked intents. " +
              `Valid intents: ${VALID_INTENTS.join(", ")}. ` +
              "EMERGENCY = any life-threatening or urgent medical sign — it MUST rank first when present. " +
              'Return strict JSON: {"intents":[{"intent":"ID","confidence":0.0-1.0,"reason":"short"}]} ' +
              `with at most ${topN} entries, best first. Confidence must be honest.`,
          },
          { role: "user", content: text },
        ],
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      intents?: Array<{ intent?: string; confidence?: number; reason?: string }>;
    };
    if (!Array.isArray(parsed.intents) || parsed.intents.length === 0) return null;

    const results = parsed.intents
      .filter((i): i is { intent: IntentId; confidence: number; reason?: string } =>
        VALID_INTENTS.includes(i.intent as IntentId),
      )
      .slice(0, topN)
      .map((i, idx) => ({
        intent: i.intent,
        nameAr: INTENT_NAMES[i.intent].nameAr,
        nameEn: INTENT_NAMES[i.intent].nameEn,
        score: Math.round((1 - idx * 0.1) * 100) / 100,
        confidence: Math.min(1, Math.max(0, i.confidence ?? 0.5)),
        fallback: false,
        trace: { keywords: [], phrases: [], llm: i.reason ?? "" },
      }));
    if (results.length === 0) return null;

    // Decisive emergency priority — same invariant as the rule engine.
    results.sort((a, b) => {
      const em = Number(b.intent === "EMERGENCY") - Number(a.intent === "EMERGENCY");
      if (em !== 0) return em;
      return b.confidence - a.confidence;
    });

    return {
      engine: "LLM_GPT4O",
      mode: "LLM_WITH_RULE_FALLBACK",
      tokenCount: text.split(/\s+/).length,
      results,
    };
  } catch {
    return null; // honest fallback — caller reports RULE_BASED_SAFE
  } finally {
    clearTimeout(timer);
  }
}

/**
 * LLM-first classification with deterministic rule fallback.
 * The `engine` field always tells the truth about which path answered.
 */
export async function classifyIntentHybrid(text: string, topN: number) {
  const llm = await classifyIntentWithLLM(text, topN);
  if (llm) return llm;
  return classifyIntent(text, topN); // RULE_BASED_SAFE — unchanged
}

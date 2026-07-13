// ============================================================
// INTENT ENGINE — STE-K-02 "Deterministic intent classification"
// Rule-based SAFE mode: zero LLM, zero keys, fully deterministic
// (D-19 envelope). Turns the locked intentEngine bridge into a
// working no-key capability, while the future LLM path stays
// behind the fail-closed bridge untouched.
//
// Reuses tokenizeNormalize from corpus-search (STE-K-01): Arabic
// diacritics stripped, alef/yaa/taa-marbuta unified, English
// lowercased — so undiacritized queries match diacritized text.
//
// Vet-domain intent taxonomy with decisive EMERGENCY priority:
// any positive emergency evidence ranks EMERGENCY first.
// ============================================================
import { tokenizeNormalize } from "./corpus-search";

export type IntentId =
  | "EMERGENCY"
  | "BOOKING"
  | "PRICING"
  | "COMPLAINT"
  | "RESULTS"
  | "REFILL"
  | "INFO";

interface WeightedTerm {
  term: string; // normalized at build time
  weight: number;
}

interface IntentRule {
  id: IntentId;
  nameAr: string;
  nameEn: string;
  keywords: WeightedTerm[];
  phrases: WeightedTerm[]; // matched on the space-joined normalized token stream
  negatives?: WeightedTerm[]; // subtract when present — kills false positives
}

const norm = (s: string): string => tokenizeNormalize(s).join(" ");

function kw(weight: number, ...terms: string[]): WeightedTerm[] {
  return terms.map((t) => ({ term: norm(t), weight }));
}

// All terms pass through the same normalizer as user input, so the
// rule table can be written naturally (with hamza, taa marbuta…).
const RULES: IntentRule[] = [
  {
    id: "EMERGENCY",
    nameAr: "طوارئ",
    nameEn: "Emergency",
    keywords: [
      ...kw(5, "نزيف", "ينزف", "تنزف", "تسمم", "مسموم", "اختناق", "يختنق", "تختنق",
        "حادث", "دهس", "مدهوس", "إغماء", "مغمى", "تشنج", "تشنجات", "إسعاف", "طوارئ"),
      ...kw(3, "عاجل", "كسر", "مكسور", "الحقوه", "الحقيني", "أنقذوه"),
      ...kw(5, "bleeding", "bleeds", "poisoned", "poison", "choking", "seizure",
        "unconscious", "collapsed", "emergency"),
      ...kw(3, "urgent", "accident", "fracture"),
    ],
    phrases: [
      ...kw(6, "يتنفس بصعوبة", "لا يتنفس", "ابتلع سم", "صدمته سيارة",
        "cannot breathe", "not breathing", "hit by a car", "hit by car"),
    ],
  },
  {
    id: "BOOKING",
    nameAr: "حجز موعد",
    nameEn: "Booking",
    keywords: [
      ...kw(3, "موعد", "مواعيد", "حجز", "احجز", "أحجز"),
      ...kw(3, "appointment", "booking", "reschedule"),
      ...kw(1, "بكرة", "غدا", "tomorrow", "schedule", "visit", "book"),
    ],
    phrases: [
      ...kw(4, "ابغى موعد", "أبغى موعد", "أريد موعد", "احتاج موعد",
        "book an appointment", "make an appointment"),
    ],
    // Negative signals: weather questions leak into BOOKING via the
    // weak time-word "tomorrow/غدا" (weight 1). Weather vocabulary
    // cancels that lone signal so such queries fall to the honest INFO
    // fallback. Real bookings never carry weather terms, so genuine
    // "book … tomorrow" requests (score ≥ appointment/موعد weight) are
    // unaffected — proven by anti-overfit golden cases.
    negatives: [
      ...kw(2, "طقس", "الطقس", "مطر", "تمطر", "أمطار", "غيم", "غائم", "الجو"),
      ...kw(2, "weather", "rain", "rains", "raining", "forecast", "cloudy", "sunny"),
    ],
  },
  {
    id: "PRICING",
    nameAr: "الأسعار",
    nameEn: "Pricing",
    keywords: [
      ...kw(3, "سعر", "أسعار", "تكلفة", "كلفة", "رسوم", "بكم"),
      ...kw(3, "price", "prices", "cost", "costs", "fee", "fees", "pricing"),
    ],
    phrases: [
      ...kw(4, "كم سعر", "كم تكلفة", "كم يكلف", "how much", "what does it cost"),
    ],
  },
  {
    id: "COMPLAINT",
    nameAr: "شكوى",
    nameEn: "Complaint",
    keywords: [
      ...kw(3, "شكوى", "أشتكي", "اشتكي", "تقصير", "سيء", "سيئة", "مستاء", "استياء"),
      ...kw(3, "complaint", "complain", "unhappy", "disappointed", "terrible"),
    ],
    phrases: [
      ...kw(4, "خدمة سيئة", "أريد تقديم شكوى", "bad service", "poor service"),
    ],
  },
  {
    id: "RESULTS",
    nameAr: "نتائج الفحوصات",
    nameEn: "Results",
    keywords: [
      ...kw(3, "نتائج", "نتيجة", "تحليل", "تحاليل", "أشعة", "فحص", "فحوصات", "مختبر"),
      ...kw(3, "results", "lab", "labs", "xray", "analysis", "scan", "bloodwork"),
    ],
    phrases: [
      ...kw(4, "نتائج التحليل", "نتيجة الأشعة", "lab results", "test results"),
    ],
  },
  {
    id: "REFILL",
    nameAr: "إعادة صرف دواء",
    nameEn: "Refill",
    keywords: [
      ...kw(3, "دواء", "أدوية", "وصفة", "علاج"),
      ...kw(3, "refill", "prescription", "medication", "medicine", "renew"),
    ],
    phrases: [
      ...kw(4, "إعادة صرف", "صرف دواء", "خلص الدواء", "refill prescription",
        "renew prescription", "ran out of medication"),
    ],
  },
  {
    id: "INFO",
    nameAr: "استفسار عام",
    nameEn: "General info",
    keywords: [
      ...kw(2, "معلومات", "استفسار", "سؤال", "ساعات", "دوام", "عنوان", "موقع"),
      ...kw(2, "info", "information", "question", "hours", "address", "location"),
    ],
    phrases: [...kw(3, "ساعات العمل", "opening hours", "working hours")],
  },
];

export interface IntentTrace {
  keywords: Array<{ term: string; weight: number }>;
  phrases: Array<{ phrase: string; weight: number }>;
  negatives?: Array<{ term: string; weight: number }>;
}

export interface IntentResult {
  intent: IntentId;
  nameAr: string;
  nameEn: string;
  score: number;
  confidence: number; // 0-1, deterministic saturation of the raw score
  fallback: boolean; // true only for the honest low-confidence INFO default
  trace: IntentTrace;
}

export interface IntentClassification {
  engine: "RULE_BASED_SAFE";
  mode: "DETERMINISTIC_NO_KEY";
  tokenCount: number;
  results: IntentResult[];
}

// Honest fallback confidence when nothing matched at all.
const FALLBACK_CONFIDENCE = 0.1;

function confidenceFromScore(score: number): number {
  // Deterministic saturation: 3→0.45, 5→0.63, 8→0.80, 12→0.91.
  return Math.round((1 - Math.exp(-score / 5)) * 10000) / 10000;
}

export function classifyIntent(text: string, topN = 3): IntentClassification {
  const tokens = tokenizeNormalize(text);
  const tokenSet = new Set(tokens);
  const joined = tokens.join(" ");

  const scored: IntentResult[] = [];
  for (const rule of RULES) {
    const trace: IntentTrace = { keywords: [], phrases: [] };
    let score = 0;
    for (const k of rule.keywords) {
      if (tokenSet.has(k.term)) {
        score += k.weight;
        trace.keywords.push({ term: k.term, weight: k.weight });
      }
    }
    for (const p of rule.phrases) {
      if (p.term.length > 0 && joined.includes(p.term)) {
        score += p.weight;
        trace.phrases.push({ phrase: p.term, weight: p.weight });
      }
    }
    // Negative signals subtract — they cancel false-positive triggers
    // (e.g. weather words neutralizing the weak "tomorrow" booking cue).
    if (rule.negatives) {
      for (const nterm of rule.negatives) {
        if (tokenSet.has(nterm.term)) {
          score -= nterm.weight;
          (trace.negatives ??= []).push({ term: nterm.term, weight: nterm.weight });
        }
      }
    }
    if (score > 0) {
      scored.push({
        intent: rule.id,
        nameAr: rule.nameAr,
        nameEn: rule.nameEn,
        score,
        confidence: confidenceFromScore(score),
        fallback: false,
        trace,
      });
    }
  }

  // Decisive emergency priority: any positive emergency evidence
  // outranks everything; then score desc; then intent id asc for a
  // fully deterministic order.
  scored.sort((a, b) => {
    const emergency = Number(b.intent === "EMERGENCY") - Number(a.intent === "EMERGENCY");
    if (emergency !== 0) return emergency;
    if (b.score !== a.score) return b.score - a.score;
    return a.intent < b.intent ? -1 : 1;
  });

  // Nothing matched → honest low-confidence INFO default, never a
  // confident guess.
  if (scored.length === 0) {
    scored.push({
      intent: "INFO",
      nameAr: "استفسار عام",
      nameEn: "General info",
      score: 0,
      confidence: FALLBACK_CONFIDENCE,
      fallback: true,
      trace: { keywords: [], phrases: [] },
    });
  }

  return {
    engine: "RULE_BASED_SAFE",
    mode: "DETERMINISTIC_NO_KEY",
    tokenCount: tokens.length,
    results: scored.slice(0, topN),
  };
}

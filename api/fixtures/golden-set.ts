// ============================================================
// GOLDEN SET (STE-K-06) — the institutional quality ratchet's
// measured ground truth. 57 deterministic cases across Arabic +
// English covering all seven intents, deliberate honest-refusal
// cases (out-of-corpus questions: weather / politics / cooking),
// and retrieval cases (unique English topic terms that DO hit a
// known domain). Diacritized and Gulf-colloquial phrasings are
// included so the normalizer is exercised end to end.
//
// Fields:
//   expectedIntent    — the intent classifyIntent must return.
//   expectRefusal     — true when composeAnswer SHOULD refuse
//                       (INSUFFICIENT_EVIDENCE). Vet questions refuse
//                       today because the corpus is templated (DEMO)
//                       and holds no veterinary content; the pure
//                       out-of-domain questions refuse for the same
//                       honest reason.
//   expectedTopDomain — (retrieval cases only) the domain the top
//                       citation must belong to.
// ============================================================
import type { IntentId } from "../lib/intent-engine";

export interface GoldenCase {
  id: string;
  question: string;
  expectedIntent: string;
  expectRefusal?: boolean;
  expectedTopDomain?: string;
  note?: string;
}

export const GOLDEN_SET: GoldenCase[] = [
  // ---- EMERGENCY (ar + en, diacritized, colloquial, phrase) ----
  { id: "em-ar-1", question: "كلبي ينزف بشدة وأحتاج مساعدة", expectedIntent: "EMERGENCY", expectRefusal: true },
  { id: "em-ar-2", question: "قطتي فيها تسمم شديد الحقوه", expectedIntent: "EMERGENCY", expectRefusal: true },
  { id: "em-ar-3", question: "حيواني تعرض لحادث دهس في الشارع", expectedIntent: "EMERGENCY", expectRefusal: true },
  { id: "em-ar-4", question: "كَلبي يَنزِف بِشِدّة الآن", expectedIntent: "EMERGENCY", expectRefusal: true, note: "diacritized" },
  { id: "em-ar-5", question: "الكلب ابتلع سم وصار تعبان", expectedIntent: "EMERGENCY", expectRefusal: true, note: "phrase + gulf" },
  { id: "em-en-1", question: "my dog is bleeding badly please help", expectedIntent: "EMERGENCY", expectRefusal: true },
  { id: "em-en-2", question: "cat poisoned emergency what do I do", expectedIntent: "EMERGENCY", expectRefusal: true },

  // ---- BOOKING (incl. Gulf colloquial) ----
  { id: "bk-ar-1", question: "ابغى موعد بكرة للعيادة", expectedIntent: "BOOKING", expectRefusal: true, note: "gulf" },
  { id: "bk-ar-2", question: "أريد حجز موعد للقطة", expectedIntent: "BOOKING", expectRefusal: true },
  { id: "bk-ar-3", question: "ابي احجز موعد فحص", expectedIntent: "BOOKING", expectRefusal: true, note: "gulf" },
  { id: "bk-en-1", question: "book an appointment tomorrow", expectedIntent: "BOOKING", expectRefusal: true },
  { id: "bk-en-2", question: "reschedule my visit please", expectedIntent: "BOOKING", expectRefusal: true },

  // ---- PRICING ----
  { id: "pr-ar-1", question: "كم سعر تطعيم القطط", expectedIntent: "PRICING", expectRefusal: true },
  { id: "pr-ar-2", question: "بكم تكلفة الفحص الشامل", expectedIntent: "PRICING", expectRefusal: true },
  { id: "pr-ar-3", question: "كَم سِعر الكَشف عندكم", expectedIntent: "PRICING", expectRefusal: true, note: "diacritized" },
  { id: "pr-en-1", question: "how much does vaccination cost", expectedIntent: "PRICING", expectRefusal: true },
  { id: "pr-en-2", question: "what is the price of the surgery", expectedIntent: "PRICING", expectRefusal: true },

  // ---- COMPLAINT ----
  { id: "co-ar-1", question: "أريد تقديم شكوى عاجلة", expectedIntent: "COMPLAINT", expectRefusal: true },
  { id: "co-ar-2", question: "خدمة سيئة جدا وأنا مستاء", expectedIntent: "COMPLAINT", expectRefusal: true, note: "phrase" },
  { id: "co-en-1", question: "I want to file a complaint bad service", expectedIntent: "COMPLAINT", expectRefusal: true },

  // ---- RESULTS ----
  { id: "re-ar-1", question: "متى تظهر نتائج التحليل", expectedIntent: "RESULTS", expectRefusal: true, note: "phrase" },
  { id: "re-ar-2", question: "أريد نتيجة الأشعة", expectedIntent: "RESULTS", expectRefusal: true },
  { id: "re-en-1", question: "when are the lab results ready", expectedIntent: "RESULTS", expectRefusal: true },

  // ---- REFILL ----
  { id: "rf-ar-1", question: "أحتاج إعادة صرف دواء", expectedIntent: "REFILL", expectRefusal: true, note: "phrase" },
  { id: "rf-ar-2", question: "خلص الدواء أريد علاج جديد", expectedIntent: "REFILL", expectRefusal: true, note: "phrase" },
  { id: "rf-en-1", question: "refill prescription please", expectedIntent: "REFILL", expectRefusal: true },
  { id: "rf-en-2", question: "ran out of medication renew it", expectedIntent: "REFILL", expectRefusal: true, note: "phrase" },

  // ---- INFO (general clinic info) ----
  { id: "in-ar-1", question: "ما هي ساعات العمل", expectedIntent: "INFO", expectRefusal: true, note: "phrase" },
  { id: "in-ar-2", question: "أين موقع العيادة", expectedIntent: "INFO", expectRefusal: true },
  { id: "in-en-1", question: "what are your opening hours", expectedIntent: "INFO", expectRefusal: true },
  { id: "in-en-2", question: "where is your address", expectedIntent: "INFO", expectRefusal: true },

  // ---- Deliberate out-of-corpus REFUSALS (weather/politics/cooking):
  //      no intent keywords → INFO fallback; no evidence → refuse. ----
  { id: "rj-weather-ar", question: "كيف حالة الطقس غدا في الرياض", expectedIntent: "INFO", expectRefusal: true, note: "weather" },
  { id: "rj-weather-en", question: "will it rain tomorrow afternoon", expectedIntent: "INFO", expectRefusal: true, note: "weather" },
  { id: "rj-politics-ar", question: "من سيفوز في الانتخابات القادمة", expectedIntent: "INFO", expectRefusal: true, note: "politics" },
  { id: "rj-politics-en", question: "who will win the presidential election", expectedIntent: "INFO", expectRefusal: true, note: "politics" },
  { id: "rj-cooking-ar", question: "كيف أطبخ كبسة لحم لذيذة", expectedIntent: "INFO", expectRefusal: true, note: "cooking" },
  { id: "rj-cooking-en", question: "best recipe for chocolate cake", expectedIntent: "INFO", expectRefusal: true, note: "cooking" },

  // ---- ANTI-OVERFIT: real bookings that DO contain "tomorrow/غدا"
  //      must still classify BOOKING (the weather negative-signal fix
  //      must not blunt genuine booking cues). expectRefusal:true —
  //      operational intent, no clinic corpus (honest refusal). ----
  { id: "ao-book-ar-1", question: "ابغى احجز موعد بكرة الساعة خمسة", expectedIntent: "BOOKING", expectRefusal: true, note: "anti-overfit gulf" },
  { id: "ao-book-ar-2", question: "أريد حجز موعد غدا للكشف", expectedIntent: "BOOKING", expectRefusal: true, note: "anti-overfit tomorrow" },
  { id: "ao-book-en-1", question: "book an appointment tomorrow morning", expectedIntent: "BOOKING", expectRefusal: true, note: "anti-overfit tomorrow" },
  { id: "ao-book-en-2", question: "schedule a visit for tomorrow please", expectedIntent: "BOOKING", expectRefusal: true, note: "anti-overfit tomorrow" },

  // ---- RETRIEVAL cases: unique English topic terms → real domain
  //      hit. No intent keywords → INFO fallback; corpus HAS evidence
  //      so these must ANSWER (expectRefusal:false). ----
  { id: "rt-tech", question: "neural networks transformer edge computing", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "TECHNOLOGY" },
  { id: "rt-energy", question: "solar wind battery storage smart grid", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "ENERGY" },
  { id: "rt-econ", question: "islamic banking marginal utility moral hazard", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "ECONOMICS" },
  { id: "rt-sci", question: "natural selection entropy thermodynamics laws", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "SCIENCE" },
  { id: "rt-hist", question: "abbasid ottoman mamluk caliphate expansion", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "HISTORY" },
  { id: "rt-islamic", question: "usul fiqh hadith authentication ijma qiyas", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "ISLAMIC" },
  { id: "rt-mfg", question: "six sigma lean production digital twin", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "MANUFACTURING" },
  { id: "rt-eng", question: "control systems signal processing load balancing", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "ENGINEERING" },
  { id: "rt-legal", question: "contract law tort liability jurisprudence precedent", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "LEGAL" },
  { id: "rt-med", question: "oncology diagnosis epidemiology cardiology treatment", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "MEDICINE" },
  { id: "rt-edu", question: "curriculum pedagogy formative assessment classroom", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "EDUCATION" },
  { id: "rt-fin", question: "portfolio diversification derivatives hedging yield curve", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "FINANCE" },
  { id: "rt-env", question: "biodiversity conservation watershed reforestation emissions", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "ENVIRONMENT" },
  { id: "rt-transport", question: "transportation multimodal transit railway aviation maritime", expectedIntent: "INFO", expectRefusal: false, expectedTopDomain: "TRANSPORTATION" },

  // ---- Additional out-of-corpus honest refusals (deterministic INFO→refuse) ----
  { id: "rj-sports-ar", question: "من سيفوز بكأس العالم القادم", expectedIntent: "INFO", expectRefusal: true, note: "sports" },
  { id: "rj-sports-en", question: "who will win the next world cup", expectedIntent: "INFO", expectRefusal: true, note: "sports" },
];

// The seven canonical intents the set must fully cover.
export const ALL_INTENTS: IntentId[] = [
  "EMERGENCY", "BOOKING", "PRICING", "COMPLAINT", "RESULTS", "REFILL", "INFO",
];

// Re-export for typed consumers that want the union.
export type { IntentId };
